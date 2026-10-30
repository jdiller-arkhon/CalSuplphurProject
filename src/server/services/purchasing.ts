import { D, dec, unitAmt, qty as q6, type DecInput } from "@/lib/decimal";
import { serializable, nextNumber } from "../db";
import { audit } from "../audit";
import { receiveTx } from "./inventory";

export class PurchasingError extends Error {}
type Ctx = { userId: string };

export async function createPO(ctx: Ctx, i: { supplierId: string; expectedAt?: Date; notes?: string; lines: { productId: string; quantity: DecInput; unitCost: DecInput }[] }) {
  return serializable(async (tx) => {
    if (!i.lines.length) throw new PurchasingError("A purchase order needs at least one line.");
    const sup = await tx.supplier.findUnique({ where: { id: i.supplierId } });
    if (!sup?.active) throw new PurchasingError("Supplier not found or inactive.");
    const lines = i.lines.map((l) => {
      const quantity = q6(l.quantity);
      const unitCost = unitAmt(l.unitCost);
      if (quantity.lte(0)) throw new PurchasingError("Line quantity must be greater than zero.");
      if (unitCost.lt(0)) throw new PurchasingError("Unit cost cannot be negative.");
      return { productId: l.productId, quantity: quantity.toString(), unitCost: unitCost.toString() };
    });
    const number = await nextNumber(tx, "PO");
    const po = await tx.purchaseOrder.create({ data: { number, supplierId: i.supplierId, expectedAt: i.expectedAt, notes: i.notes, createdBy: ctx.userId, lines: { create: lines } } });
    await audit(tx, { userId: ctx.userId, action: "po.create", entity: "PurchaseOrder", entityId: po.id, summary: `Created ${number} for ${sup.name}` });
    return po;
  });
}

export async function issuePO(ctx: Ctx, poId: string) {
  return serializable(async (tx) => {
    const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: poId } });
    if (po.status !== "DRAFT") throw new PurchasingError("Only draft purchase orders can be issued.");
    await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: "ISSUED" } });
    await audit(tx, { userId: ctx.userId, action: "po.issue", entity: "PurchaseOrder", entityId: po.id, summary: `Issued ${po.number}` });
  });
}

/** Amend a line's quantity or cost. Quantity cannot drop below what has been received. Revision is incremented. */
export async function amendPOLine(ctx: Ctx, i: { poLineId: string; quantity: DecInput; unitCost: DecInput; reason: string }) {
  return serializable(async (tx) => {
    const line = await tx.purchaseOrderLine.findUniqueOrThrow({ where: { id: i.poLineId }, include: { po: true } });
    if (["CLOSED", "CANCELLED", "RECEIVED"].includes(line.po.status)) throw new PurchasingError(`Purchase order is ${line.po.status.toLowerCase()}.`);
    const quantity = q6(i.quantity);
    if (quantity.lt(dec(line.receivedQty))) throw new PurchasingError("Quantity cannot be less than what has already been received.");
    await tx.purchaseOrderLine.update({ where: { id: line.id }, data: { quantity: quantity.toString(), unitCost: unitAmt(i.unitCost).toString() } });
    await tx.purchaseOrder.update({ where: { id: line.poId }, data: { revision: { increment: 1 } } });
    await audit(tx, { userId: ctx.userId, action: "po.amend", entity: "PurchaseOrder", entityId: line.poId, summary: `Amended ${line.po.number}: ${i.reason}`, data: { before: { quantity: line.quantity, unitCost: line.unitCost }, after: { quantity: quantity.toString(), unitCost: i.unitCost?.toString() } } });
  });
}

/** Record a (partial) receipt. Each line posts a RECEIPT movement through the inventory ledger. */
export async function receivePO(
  ctx: Ctx,
  i: { poId: string; reference?: string; receivedAt?: Date; idempotencyKey?: string; lines: { poLineId: string; quantity: DecInput; locationId: string; lotNumber: string; unitCost?: DecInput }[] },
) {
  return serializable(async (tx) => {
    const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: i.poId }, include: { lines: true } });
    if (!["ISSUED", "PARTIALLY_RECEIVED"].includes(po.status)) throw new PurchasingError("Only issued purchase orders can be received.");
    if (i.idempotencyKey) {
      const k = await tx.idempotencyKey.findUnique({ where: { key: i.idempotencyKey } });
      if (k) return k.result as { receiptId: string };
    }
    const lines = i.lines.filter((l) => dec(l.quantity).gt(0));
    if (!lines.length) throw new PurchasingError("Enter a received quantity on at least one line.");
    const receipt = await tx.purchaseReceipt.create({ data: { poId: po.id, reference: i.reference, receivedAt: i.receivedAt ?? new Date(), createdBy: ctx.userId } });
    for (const l of lines) {
      const pol = po.lines.find((x) => x.id === l.poLineId);
      if (!pol) throw new PurchasingError("Line does not belong to this purchase order.");
      const qty = q6(l.quantity);
      const cost = l.unitCost !== undefined && l.unitCost !== "" ? unitAmt(l.unitCost) : dec(pol.unitCost);
      const rl = await tx.purchaseReceiptLine.create({ data: { receiptId: receipt.id, poLineId: pol.id, locationId: l.locationId, lotNumber: l.lotNumber, quantity: qty.toString(), unitCost: cost.toString() } });
      await receiveTx(tx, ctx, { productId: pol.productId, locationId: l.locationId, lotNumber: l.lotNumber, quantity: qty, unitCost: cost, reference: `${po.number}${i.reference ? ` / ${i.reference}` : ""}`, receivedAt: i.receivedAt, purchaseReceiptLineId: rl.id });
      await tx.purchaseOrderLine.update({ where: { id: pol.id }, data: { receivedQty: dec(pol.receivedQty).plus(qty).toString() } });
    }
    const fresh = await tx.purchaseOrderLine.findMany({ where: { poId: po.id } });
    const done = fresh.every((x) => dec(x.receivedQty).gte(dec(x.quantity)));
    await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: done ? "RECEIVED" : "PARTIALLY_RECEIVED" } });
    const over = fresh.filter((x) => dec(x.receivedQty).gt(dec(x.quantity)));
    await audit(tx, { userId: ctx.userId, action: "po.receive", entity: "PurchaseOrder", entityId: po.id, summary: `Received against ${po.number}${over.length ? " (over-receipt recorded)" : ""}` });
    if (i.idempotencyKey) await tx.idempotencyKey.create({ data: { key: i.idempotencyKey, scope: "po.receive", result: { receiptId: receipt.id } } });
    return { receiptId: receipt.id };
  });
}

export async function cancelPO(ctx: Ctx, poId: string, reason: string) {
  return serializable(async (tx) => {
    const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: poId }, include: { lines: true } });
    const received = po.lines.reduce((s, l) => s.plus(dec(l.receivedQty)), new D(0));
    const status = received.gt(0) ? "CLOSED" : "CANCELLED";
    await tx.purchaseOrder.update({ where: { id: po.id }, data: { status, notes: [po.notes, `${status === "CLOSED" ? "Closed short" : "Cancelled"}: ${reason}`].filter(Boolean).join("\n") } });
    await audit(tx, { userId: ctx.userId, action: "po.cancel", entity: "PurchaseOrder", entityId: po.id, summary: `${status === "CLOSED" ? "Closed short" : "Cancelled"} ${po.number}: ${reason}` });
  });
}
