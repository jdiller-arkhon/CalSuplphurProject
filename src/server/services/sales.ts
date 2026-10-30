import { D, dec, unitAmt, qty as q6, money, type DecInput } from "@/lib/decimal";
import { serializable, nextNumber, type Tx } from "../db";
import { audit } from "../audit";
import { reserveTx, releaseTx, shipOutTx, InventoryError } from "./inventory";
import { getSetting } from "./settings";

export class SalesError extends Error {}
type Ctx = { userId: string; canApprove?: boolean };

export interface QuoteLineInput {
  productId: string;
  description?: string;
  quantity: DecInput;
  unitPrice: DecInput;
  unitCost?: DecInput; // snapshot; defaults to product default cost or current weighted avg
}

async function currentUnitCost(tx: Tx, productId: string) {
  const r = await tx.$queryRaw<{ avg: string | null }[]>`
    SELECT CASE WHEN SUM("onHand") > 0 THEN (SUM("onHand" * "unitCost") / SUM("onHand"))::text END AS avg
    FROM "InventoryLot" WHERE "productId" = ${productId} AND "onHand" > 0`;
  if (r[0]?.avg) return dec(r[0].avg);
  const p = await tx.product.findUnique({ where: { id: productId } });
  return dec(p?.defaultCost ?? 0);
}

async function marginCheck(tx: Tx, lines: { productId: string; unitPrice: DecInput; unitCost: DecInput }[]) {
  const fallback = dec((await getSetting(tx, "pricing.defaultMinMarginPct")) as string);
  for (const l of lines) {
    const p = await tx.product.findUniqueOrThrow({ where: { id: l.productId } });
    const min = p.minMarginPct !== null ? dec(p.minMarginPct) : fallback;
    const price = dec(l.unitPrice);
    if (price.lte(0)) return true;
    if (price.minus(dec(l.unitCost)).div(price).lt(min)) return true;
  }
  return false;
}

export async function createQuote(
  ctx: Ctx,
  i: { customerId: string; scenarioId?: string; validUntil: Date; currency?: string; deliveryTerms?: string; paymentTerms?: string; notes?: string; lines: QuoteLineInput[] },
) {
  return serializable(async (tx) => {
    if (!i.lines.length) throw new SalesError("A quote needs at least one line.");
    const cust = await tx.customer.findUnique({ where: { id: i.customerId } });
    if (!cust?.active) throw new SalesError("Customer not found or inactive.");
    const lines = [];
    for (const l of i.lines) {
      const quantity = q6(l.quantity);
      const unitPrice = unitAmt(l.unitPrice);
      if (quantity.lte(0)) throw new SalesError("Line quantity must be greater than zero.");
      if (unitPrice.lt(0)) throw new SalesError("Unit price cannot be negative.");
      const unitCost = l.unitCost !== undefined && l.unitCost !== "" ? unitAmt(l.unitCost) : unitAmt(await currentUnitCost(tx, l.productId));
      lines.push({ productId: l.productId, description: l.description, quantity: quantity.toString(), unitPrice: unitPrice.toString(), unitCost: unitCost.toString() });
    }
    const below = await marginCheck(tx, lines);
    const number = await nextNumber(tx, "Q");
    const quote = await tx.quote.create({
      data: {
        number,
        customerId: i.customerId,
        scenarioId: i.scenarioId,
        validUntil: i.validUntil,
        currency: i.currency ?? cust.currency,
        deliveryTerms: i.deliveryTerms,
        paymentTerms: i.paymentTerms ?? cust.paymentTerms,
        notes: i.notes,
        belowMinMargin: below,
        createdBy: ctx.userId,
        lines: { create: lines },
      },
    });
    await audit(tx, { userId: ctx.userId, action: "quote.create", entity: "Quote", entityId: quote.id, summary: `Created quote ${number} for ${cust.name}${below ? " (below minimum margin)" : ""}` });
    return quote;
  });
}

/** Submit: quotes at/above minimum margin are approved automatically; below-margin quotes need an approver. */
export async function submitQuote(ctx: Ctx, quoteId: string) {
  return serializable(async (tx) => {
    const q = await tx.quote.findUniqueOrThrow({ where: { id: quoteId } });
    if (q.status !== "DRAFT" && q.status !== "REJECTED") throw new SalesError(`Quote is ${q.status.toLowerCase()} and cannot be submitted.`);
    const status = q.belowMinMargin ? "PENDING_APPROVAL" : "APPROVED";
    const out = await tx.quote.update({ where: { id: q.id }, data: { status, approvedAt: status === "APPROVED" ? new Date() : null, approvedBy: status === "APPROVED" ? ctx.userId : null } });
    await audit(tx, { userId: ctx.userId, action: "quote.submit", entity: "Quote", entityId: q.id, summary: `Quote ${q.number} ${status === "APPROVED" ? "approved (meets margin policy)" : "submitted for approval"}` });
    return out;
  });
}

export async function decideQuote(ctx: Ctx, quoteId: string, approve: boolean, note?: string) {
  if (!ctx.canApprove) throw new SalesError("You are not allowed to approve quotes.");
  return serializable(async (tx) => {
    const q = await tx.quote.findUniqueOrThrow({ where: { id: quoteId } });
    if (q.status !== "PENDING_APPROVAL") throw new SalesError("Only quotes awaiting approval can be decided.");
    const out = await tx.quote.update({ where: { id: q.id }, data: { status: approve ? "APPROVED" : "REJECTED", approvedBy: ctx.userId, approvedAt: new Date() } });
    await audit(tx, { userId: ctx.userId, action: approve ? "quote.approve" : "quote.reject", entity: "Quote", entityId: q.id, summary: `Quote ${q.number} ${approve ? "approved" : "rejected"}${note ? `: ${note}` : ""}` });
    return out;
  });
}

export async function cancelQuote(ctx: Ctx, quoteId: string) {
  return serializable(async (tx) => {
    const q = await tx.quote.findUniqueOrThrow({ where: { id: quoteId } });
    if (q.status === "CONVERTED") throw new SalesError("Converted quotes cannot be cancelled; cancel the sales order instead.");
    await tx.quote.update({ where: { id: q.id }, data: { status: "CANCELLED" } });
    await audit(tx, { userId: ctx.userId, action: "quote.cancel", entity: "Quote", entityId: q.id, summary: `Cancelled quote ${q.number}` });
  });
}

/** Convert an approved quote into a sales order. Prices and cost snapshots are copied, never re-derived. */
export async function convertQuote(ctx: Ctx, quoteId: string) {
  return serializable(async (tx) => {
    const q = await tx.quote.findUniqueOrThrow({ where: { id: quoteId }, include: { lines: true, order: true } });
    if (q.order) return q.order; // idempotent
    if (q.status !== "APPROVED") throw new SalesError("Only approved quotes can become sales orders.");
    if (q.validUntil < new Date()) throw new SalesError("This quote has expired. Duplicate it to re-quote.");
    const number = await nextNumber(tx, "SO");
    const order = await tx.salesOrder.create({
      data: {
        number,
        customerId: q.customerId,
        quoteId: q.id,
        currency: q.currency,
        deliveryTerms: q.deliveryTerms,
        paymentTerms: q.paymentTerms,
        notes: q.notes,
        createdBy: ctx.userId,
        lines: { create: q.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice, estUnitCost: l.unitCost })) },
      },
    });
    await tx.quote.update({ where: { id: q.id }, data: { status: "CONVERTED" } });
    await audit(tx, { userId: ctx.userId, action: "order.create", entity: "SalesOrder", entityId: order.id, summary: `Created sales order ${number} from quote ${q.number}` });
    return order;
  });
}

export async function createOrder(ctx: Ctx, i: { customerId: string; requestedDate?: Date; deliveryTerms?: string; paymentTerms?: string; notes?: string; lines: QuoteLineInput[] }) {
  return serializable(async (tx) => {
    if (!i.lines.length) throw new SalesError("An order needs at least one line.");
    const cust = await tx.customer.findUnique({ where: { id: i.customerId } });
    if (!cust?.active) throw new SalesError("Customer not found or inactive.");
    const number = await nextNumber(tx, "SO");
    const lines = [];
    for (const l of i.lines) {
      const quantity = q6(l.quantity);
      if (quantity.lte(0)) throw new SalesError("Line quantity must be greater than zero.");
      lines.push({ productId: l.productId, quantity: quantity.toString(), unitPrice: unitAmt(l.unitPrice).toString(), estUnitCost: unitAmt(l.unitCost ?? (await currentUnitCost(tx, l.productId))).toString() });
    }
    const order = await tx.salesOrder.create({ data: { number, customerId: i.customerId, currency: cust.currency, requestedDate: i.requestedDate, deliveryTerms: i.deliveryTerms, paymentTerms: i.paymentTerms ?? cust.paymentTerms, notes: i.notes, createdBy: ctx.userId, lines: { create: lines } } });
    await audit(tx, { userId: ctx.userId, action: "order.create", entity: "SalesOrder", entityId: order.id, summary: `Created sales order ${number} for ${cust.name}` });
    return order;
  });
}

/** Reserve stock for every unallocated quantity, oldest lots first (FIFO by receipt date). */
export async function allocateOrder(ctx: Ctx, orderId: string, locationId?: string) {
  return serializable(async (tx) => {
    const o = await tx.salesOrder.findUniqueOrThrow({ where: { id: orderId }, include: { lines: { include: { reservations: true, product: true } } } });
    if (["CANCELLED", "COMPLETED", "SHIPPED"].includes(o.status)) throw new SalesError(`Order is ${o.status.toLowerCase()}.`);
    const shortages: string[] = [];
    for (const line of o.lines) {
      const covered = line.reservations.filter((r) => r.status !== "RELEASED").reduce((s, r) => s.plus(dec(r.quantity)), new D(0));
      let need = dec(line.quantity).minus(covered);
      if (need.lte(0)) continue;
      const lots = await tx.inventoryLot.findMany({ where: { productId: line.productId, ...(locationId ? { locationId } : {}), onHand: { gt: 0 } }, orderBy: [{ receivedAt: "asc" }, { createdAt: "asc" }] });
      for (const lot of lots) {
        if (need.lte(0)) break;
        const fresh = await tx.inventoryLot.findUniqueOrThrow({ where: { id: lot.id } });
        const avail = dec(fresh.onHand).minus(dec(fresh.reserved));
        if (avail.lte(0)) continue;
        const take = D.min(avail, need);
        await reserveTx(tx, ctx, { lotId: lot.id, quantity: take, salesOrderLineId: line.id, note: `Order ${o.number}` });
        need = need.minus(take);
      }
      if (need.gt(0)) shortages.push(`${line.product.name}: short ${need.toString()} ${line.product.unitCode}`);
    }
    const status = shortages.length ? o.status : o.status === "OPEN" ? "ALLOCATED" : o.status;
    await tx.salesOrder.update({ where: { id: o.id }, data: { status } });
    await audit(tx, { userId: ctx.userId, action: "order.allocate", entity: "SalesOrder", entityId: o.id, summary: `Allocated inventory to ${o.number}${shortages.length ? ` — shortages: ${shortages.join("; ")}` : ""}` });
    return { shortages };
  });
}

export async function cancelOrder(ctx: Ctx, orderId: string, reason: string) {
  return serializable(async (tx) => {
    const o = await tx.salesOrder.findUniqueOrThrow({ where: { id: orderId }, include: { lines: { include: { reservations: true } } } });
    if (o.status === "CANCELLED") return o;
    if (["SHIPPED", "COMPLETED"].includes(o.status)) throw new SalesError("Fully shipped orders cannot be cancelled.");
    for (const l of o.lines) for (const r of l.reservations) if (r.status === "ACTIVE") await releaseTx(tx, ctx, r.id);
    const anyShipped = o.lines.some((l) => dec(l.shippedQty).gt(0));
    const out = await tx.salesOrder.update({ where: { id: o.id }, data: { status: anyShipped ? "COMPLETED" : "CANCELLED", notes: [o.notes, `Cancelled: ${reason}`].filter(Boolean).join("\n") } });
    await audit(tx, { userId: ctx.userId, action: "order.cancel", entity: "SalesOrder", entityId: o.id, summary: `Cancelled ${o.number}${anyShipped ? " (remaining balance; shipped quantities retained)" : ""}: ${reason}` });
    return out;
  });
}

/**
 * Create a shipment for an order. Each line draws from the order line's active reservations.
 * Inventory is deducted only when the shipment is dispatched (postShipment), exactly once per line.
 */
export async function createShipment(
  ctx: Ctx,
  i: { orderId?: string; mode: string; carrier?: string; vehicleRef?: string; origin?: string; destination?: string; scheduledAt?: Date; notes?: string; lines: { salesOrderLineId?: string; lotId: string; quantity: DecInput }[]; freight?: { category: string; amount: DecInput; notes?: string }[] },
) {
  return serializable(async (tx) => {
    if (!i.lines.length) throw new SalesError("A shipment needs at least one line.");
    const number = await nextNumber(tx, "SH");
    const lines = [];
    for (const l of i.lines) {
      const qty = q6(l.quantity);
      if (qty.lte(0)) throw new SalesError("Shipment quantity must be greater than zero.");
      const lot = await tx.inventoryLot.findUniqueOrThrow({ where: { id: l.lotId } });
      if (l.salesOrderLineId) {
        const sol = await tx.salesOrderLine.findUniqueOrThrow({ where: { id: l.salesOrderLineId }, include: { shipmentLines: { include: { shipment: true } } } });
        if (sol.productId !== lot.productId) throw new SalesError("Lot product does not match the order line.");
        const planned = sol.shipmentLines.filter((s) => s.shipment.status !== "CANCELLED").reduce((s, x) => s.plus(dec(x.quantity)), new D(0));
        if (planned.plus(qty).gt(dec(sol.quantity))) throw new SalesError("Shipments would exceed the ordered quantity.");
      }
      lines.push({ salesOrderLineId: l.salesOrderLineId, lotId: l.lotId, quantity: qty.toString(), unitCost: lot.unitCost.toString() });
    }
    const s = await tx.shipment.create({
      data: {
        number,
        orderId: i.orderId,
        mode: i.mode,
        carrier: i.carrier,
        vehicleRef: i.vehicleRef,
        origin: i.origin,
        destination: i.destination,
        scheduledAt: i.scheduledAt,
        notes: i.notes,
        lines: { create: lines },
        freightCosts: { create: (i.freight ?? []).filter((f) => dec(f.amount).gt(0)).map((f) => ({ category: f.category, amount: money(f.amount).toString(), notes: f.notes })) },
      },
    });
    await audit(tx, { userId: ctx.userId, action: "shipment.create", entity: "Shipment", entityId: s.id, summary: `Planned shipment ${number} (${i.mode})` });
    return s;
  });
}

/** Dispatch: deducts inventory (consuming reservations first) and updates order fulfilment. Idempotent per line. */
export async function postShipment(ctx: Ctx, shipmentId: string) {
  return serializable(async (tx) => {
    const s = await tx.shipment.findUniqueOrThrow({ where: { id: shipmentId }, include: { lines: true } });
    if (s.status === "CANCELLED") throw new SalesError("Shipment is cancelled.");
    for (const line of s.lines) {
      if (line.posted) continue;
      let remaining = dec(line.quantity);
      if (line.salesOrderLineId) {
        const res = await tx.inventoryReservation.findMany({ where: { salesOrderLineId: line.salesOrderLineId, lotId: line.lotId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
        for (const r of res) {
          if (remaining.lte(0)) break;
          const take = D.min(remaining, dec(r.quantity).minus(dec(r.consumed)));
          if (take.lte(0)) continue;
          await shipOutTx(tx, ctx, { lotId: line.lotId, quantity: take, reservationId: r.id, reference: s.number, shipmentLineId: line.id, idempotencyKey: `ship:${line.id}:${r.id}` });
          remaining = remaining.minus(take);
        }
      }
      if (remaining.gt(0)) await shipOutTx(tx, ctx, { lotId: line.lotId, quantity: remaining, reference: s.number, shipmentLineId: line.id, idempotencyKey: `ship:${line.id}:free` });
      const lot = await tx.inventoryLot.findUniqueOrThrow({ where: { id: line.lotId } });
      await tx.shipmentLine.update({ where: { id: line.id }, data: { posted: true, unitCost: lot.unitCost } });
      if (line.salesOrderLineId) await tx.salesOrderLine.update({ where: { id: line.salesOrderLineId }, data: { shippedQty: { increment: line.quantity } } });
    }
    await tx.shipment.update({ where: { id: s.id }, data: { status: s.status === "PLANNED" ? "IN_TRANSIT" : s.status, shippedAt: s.shippedAt ?? new Date() } });
    if (s.orderId) await refreshOrderStatus(tx, s.orderId);
    await audit(tx, { userId: ctx.userId, action: "shipment.dispatch", entity: "Shipment", entityId: s.id, summary: `Dispatched shipment ${s.number}` });
  });
}

export async function deliverShipment(ctx: Ctx, shipmentId: string, deliveredAt = new Date()) {
  return serializable(async (tx) => {
    const s = await tx.shipment.findUniqueOrThrow({ where: { id: shipmentId }, include: { lines: true } });
    if (s.status !== "IN_TRANSIT") throw new SalesError("Only dispatched shipments can be marked delivered.");
    await tx.shipment.update({ where: { id: s.id }, data: { status: "DELIVERED", deliveredAt } });
    if (s.orderId) await refreshOrderStatus(tx, s.orderId);
    await audit(tx, { userId: ctx.userId, action: "shipment.deliver", entity: "Shipment", entityId: s.id, summary: `Shipment ${s.number} delivered` });
  });
}

export async function cancelShipment(ctx: Ctx, shipmentId: string) {
  return serializable(async (tx) => {
    const s = await tx.shipment.findUniqueOrThrow({ where: { id: shipmentId }, include: { lines: true } });
    if (s.lines.some((l) => l.posted)) throw new SalesError("A dispatched shipment cannot be cancelled. Record a return or adjustment instead.");
    await tx.shipment.update({ where: { id: s.id }, data: { status: "CANCELLED" } });
    await audit(tx, { userId: ctx.userId, action: "shipment.cancel", entity: "Shipment", entityId: s.id, summary: `Cancelled shipment ${s.number}` });
  });
}

async function refreshOrderStatus(tx: Tx, orderId: string) {
  const o = await tx.salesOrder.findUniqueOrThrow({ where: { id: orderId }, include: { lines: true, shipments: true } });
  if (o.status === "CANCELLED") return;
  const all = o.lines.every((l) => dec(l.shippedQty).gte(dec(l.quantity)));
  const any = o.lines.some((l) => dec(l.shippedQty).gt(0));
  const live = o.shipments.filter((s) => s.status !== "CANCELLED");
  const delivered = live.length > 0 && live.every((s) => s.status === "DELIVERED");
  const status = all ? (delivered ? "COMPLETED" : "SHIPPED") : any ? "PARTIALLY_SHIPPED" : o.status;
  if (status !== o.status) await tx.salesOrder.update({ where: { id: o.id }, data: { status } });
}

export { InventoryError };
