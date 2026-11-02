import type { MovementType } from "@prisma/client";
import { D, dec, unitAmt, money, qty as q6, type DecInput } from "@/lib/decimal";
import { serializable, type Tx } from "../db";
import { audit } from "../audit";
import { getSetting } from "./settings";

export class InventoryError extends Error {}

type Ctx = { userId: string };

async function lockLot(tx: Tx, lotId: string) {
  await tx.$queryRaw`SELECT id FROM "InventoryLot" WHERE id = ${lotId} FOR UPDATE`;
  const lot = await tx.inventoryLot.findUnique({ where: { id: lotId }, include: { product: true, location: true } });
  if (!lot) throw new InventoryError("Lot not found.");
  return lot;
}

async function allowNegative(tx: Tx) {
  return (await getSetting(tx, "inventory.allowNegativeAvailable")) === true;
}

async function postMovement(
  tx: Tx,
  m: { type: MovementType; productId: string; lotId: string; quantity: DecInput; unitCost: DecInput; reference?: string | null; reason?: string | null; userId: string; transferGroup?: string; reversesId?: string; idempotencyKey?: string | null; shipmentLineId?: string; purchaseReceiptLineId?: string },
) {
  const quantity = q6(m.quantity);
  const unitCost = unitAmt(m.unitCost);
  return tx.inventoryMovement.create({
    data: {
      type: m.type,
      productId: m.productId,
      lotId: m.lotId,
      quantity: quantity.toString(),
      unitCost: unitCost.toString(),
      value: money(quantity.times(unitCost)).toString(),
      reference: m.reference ?? null,
      reason: m.reason ?? null,
      userId: m.userId,
      transferGroup: m.transferGroup,
      reversesId: m.reversesId,
      idempotencyKey: m.idempotencyKey ?? null,
      shipmentLineId: m.shipmentLineId,
      purchaseReceiptLineId: m.purchaseReceiptLineId,
    },
  });
}

async function existingByKey(tx: Tx, key?: string | null) {
  if (!key) return null;
  return tx.inventoryMovement.findUnique({ where: { idempotencyKey: key } });
}

/** Receive quantity into a lot (created on first receipt). Unit cost blends by weighted average within the lot. */
export async function receiveTx(
  tx: Tx,
  ctx: Ctx,
  i: { productId: string; locationId: string; lotNumber: string; quantity: DecInput; unitCost: DecInput; reference?: string; reason?: string; receivedAt?: Date; idempotencyKey?: string; type?: MovementType; purchaseReceiptLineId?: string },
) {
  const prior = await existingByKey(tx, i.idempotencyKey);
  if (prior) return prior;
  const qty = q6(i.quantity);
  const cost = unitAmt(i.unitCost);
  if (qty.lte(0)) throw new InventoryError("Receipt quantity must be greater than zero.");
  if (cost.lt(0)) throw new InventoryError("Unit cost cannot be negative.");
  const lotNumber = i.lotNumber.trim();
  if (!lotNumber) throw new InventoryError("Lot number is required.");

  const product = await tx.product.findUnique({ where: { id: i.productId } });
  if (!product?.active) throw new InventoryError("Product not found or inactive.");
  const loc = await tx.location.findUnique({ where: { id: i.locationId } });
  if (!loc?.active) throw new InventoryError("Location not found or inactive.");

  await tx.inventoryLot.upsert({
    where: { productId_locationId_lotNumber: { productId: i.productId, locationId: i.locationId, lotNumber } },
    update: {},
    create: { productId: i.productId, locationId: i.locationId, lotNumber, receivedAt: i.receivedAt ?? new Date(), unitCost: cost.toString() },
  });
  const lotRow = await tx.inventoryLot.findUniqueOrThrow({ where: { productId_locationId_lotNumber: { productId: i.productId, locationId: i.locationId, lotNumber } } });
  const lot = await lockLot(tx, lotRow.id);
  const onHand = dec(lot.onHand);
  const newOnHand = onHand.plus(qty);
  const blended = onHand.lte(0) ? cost : onHand.times(dec(lot.unitCost)).plus(qty.times(cost)).div(newOnHand);
  await tx.inventoryLot.update({ where: { id: lot.id }, data: { onHand: newOnHand.toString(), unitCost: unitAmt(blended).toString(), version: { increment: 1 } } });
  const mv = await postMovement(tx, { type: i.type ?? "RECEIPT", productId: i.productId, lotId: lot.id, quantity: qty, unitCost: cost, reference: i.reference, reason: i.reason, userId: ctx.userId, idempotencyKey: i.idempotencyKey, purchaseReceiptLineId: i.purchaseReceiptLineId });
  await audit(tx, { userId: ctx.userId, action: "inventory.receive", entity: "InventoryLot", entityId: lot.id, summary: `Received ${qty} ${product.unitCode} of ${product.name} into ${loc.code}/${lotNumber}`, data: { movementId: mv.id } });
  return mv;
}
export const receive = (ctx: Ctx, i: Parameters<typeof receiveTx>[2]) => serializable((tx) => receiveTx(tx, ctx, i));

/** Signed adjustment at the lot's current cost (cycle counts, damage, moisture loss). */
export const adjust = (ctx: Ctx, i: Parameters<typeof adjustTx>[2]) => serializable((tx) => adjustTx(tx, ctx, i));
export async function adjustTx(tx: Tx, ctx: Ctx, i: { lotId: string; delta: DecInput; reason: string; idempotencyKey?: string }) {
  {
    const prior = await existingByKey(tx, i.idempotencyKey);
    if (prior) return prior;
    const delta = q6(i.delta);
    if (delta.isZero()) throw new InventoryError("Adjustment cannot be zero.");
    if (!i.reason?.trim()) throw new InventoryError("A reason is required for adjustments.");
    const lot = await lockLot(tx, i.lotId);
    const onHand = dec(lot.onHand).plus(delta);
    if (onHand.lt(0)) throw new InventoryError("Adjustment would make on-hand quantity negative.");
    if (onHand.lt(dec(lot.reserved)) && !(await allowNegative(tx))) throw new InventoryError("Adjustment would leave less on hand than is reserved for orders. Release reservations first.");
    await tx.inventoryLot.update({ where: { id: lot.id }, data: { onHand: onHand.toString(), version: { increment: 1 } } });
    const mv = await postMovement(tx, { type: "ADJUSTMENT", productId: lot.productId, lotId: lot.id, quantity: delta, unitCost: lot.unitCost, reason: i.reason, userId: ctx.userId, idempotencyKey: i.idempotencyKey });
    await audit(tx, { userId: ctx.userId, action: "inventory.adjust", entity: "InventoryLot", entityId: lot.id, summary: `Adjusted ${lot.product.name} ${lot.location.code}/${lot.lotNumber} by ${delta}: ${i.reason}`, data: { movementId: mv.id } });
    return mv;
  }
}

/** Move available quantity to another location, preserving the lot number and cost. */
export async function transfer(ctx: Ctx, i: { lotId: string; toLocationId: string; quantity: DecInput; reference?: string; idempotencyKey?: string }) {
  return serializable(async (tx) => {
    const prior = await existingByKey(tx, i.idempotencyKey);
    if (prior) return prior;
    const qty = q6(i.quantity);
    if (qty.lte(0)) throw new InventoryError("Transfer quantity must be greater than zero.");
    const src = await lockLot(tx, i.lotId);
    if (src.locationId === i.toLocationId) throw new InventoryError("Source and destination are the same location.");
    const available = dec(src.onHand).minus(dec(src.reserved));
    if (qty.gt(available)) throw new InventoryError(`Only ${available} ${src.product.unitCode} is available to transfer.`);
    const group = crypto.randomUUID();
    await tx.inventoryLot.update({ where: { id: src.id }, data: { onHand: dec(src.onHand).minus(qty).toString(), version: { increment: 1 } } });
    const out = await postMovement(tx, { type: "TRANSFER_OUT", productId: src.productId, lotId: src.id, quantity: qty.neg(), unitCost: src.unitCost, reference: i.reference, userId: ctx.userId, transferGroup: group, idempotencyKey: i.idempotencyKey });
    const inMv = await receiveTx(tx, ctx, { productId: src.productId, locationId: i.toLocationId, lotNumber: src.lotNumber, quantity: qty, unitCost: src.unitCost, reference: i.reference, type: "TRANSFER_IN", receivedAt: src.receivedAt });
    await tx.inventoryMovement.update({ where: { id: inMv.id }, data: { transferGroup: group } });
    return out;
  });
}

export async function reserveTx(tx: Tx, ctx: Ctx, i: { lotId: string; quantity: DecInput; salesOrderLineId?: string; note?: string }) {
  const qty = q6(i.quantity);
  if (qty.lte(0)) throw new InventoryError("Reservation quantity must be greater than zero.");
  const lot = await lockLot(tx, i.lotId);
  const available = dec(lot.onHand).minus(dec(lot.reserved));
  if (qty.gt(available) && !(await allowNegative(tx))) throw new InventoryError(`Only ${available} ${lot.product.unitCode} available in lot ${lot.lotNumber}.`);
  await tx.inventoryLot.update({ where: { id: lot.id }, data: { reserved: dec(lot.reserved).plus(qty).toString(), version: { increment: 1 } } });
  const r = await tx.inventoryReservation.create({ data: { lotId: lot.id, quantity: qty.toString(), salesOrderLineId: i.salesOrderLineId, note: i.note, createdBy: ctx.userId } });
  await audit(tx, { userId: ctx.userId, action: "inventory.reserve", entity: "InventoryReservation", entityId: r.id, summary: `Reserved ${qty} ${lot.product.unitCode} from ${lot.location.code}/${lot.lotNumber}` });
  return r;
}
export const reserve = (ctx: Ctx, i: Parameters<typeof reserveTx>[2]) => serializable((tx) => reserveTx(tx, ctx, i));

export async function releaseTx(tx: Tx, ctx: Ctx, reservationId: string) {
  const r = await tx.inventoryReservation.findUnique({ where: { id: reservationId } });
  if (!r) throw new InventoryError("Reservation not found.");
  if (r.status !== "ACTIVE") return r;
  const lot = await lockLot(tx, r.lotId);
  const remaining = dec(r.quantity).minus(dec(r.consumed));
  await tx.inventoryLot.update({ where: { id: lot.id }, data: { reserved: D.max(0, dec(lot.reserved).minus(remaining)).toString(), version: { increment: 1 } } });
  const out = await tx.inventoryReservation.update({ where: { id: r.id }, data: { status: "RELEASED" } });
  await audit(tx, { userId: ctx.userId, action: "inventory.release", entity: "InventoryReservation", entityId: r.id, summary: `Released ${remaining} from ${lot.location.code}/${lot.lotNumber}` });
  return out;
}
export const release = (ctx: Ctx, id: string) => serializable((tx) => releaseTx(tx, ctx, id));

/**
 * Outbound posting. If a reservation is given, quantity is consumed from it (reserved decreases too),
 * so a reserved unit can never be deducted twice.
 */
export async function shipOutTx(tx: Tx, ctx: Ctx, i: { lotId: string; quantity: DecInput; reservationId?: string; reference?: string; shipmentLineId?: string; idempotencyKey?: string }) {
  const prior = await existingByKey(tx, i.idempotencyKey);
  if (prior) return prior;
  const qty = q6(i.quantity);
  if (qty.lte(0)) throw new InventoryError("Shipment quantity must be greater than zero.");
  const lot = await lockLot(tx, i.lotId);
  let reserved = dec(lot.reserved);
  if (i.reservationId) {
    const r = await tx.inventoryReservation.findUnique({ where: { id: i.reservationId } });
    if (!r || r.lotId !== lot.id || r.status !== "ACTIVE") throw new InventoryError("Reservation is not active for this lot.");
    const remaining = dec(r.quantity).minus(dec(r.consumed));
    if (qty.gt(remaining)) throw new InventoryError(`Reservation only covers ${remaining} more.`);
    const consumed = dec(r.consumed).plus(qty);
    await tx.inventoryReservation.update({ where: { id: r.id }, data: { consumed: consumed.toString(), status: consumed.gte(dec(r.quantity)) ? "CONSUMED" : "ACTIVE" } });
    reserved = reserved.minus(qty);
  } else {
    const available = dec(lot.onHand).minus(reserved);
    if (qty.gt(available) && !(await allowNegative(tx))) throw new InventoryError(`Only ${available} ${lot.product.unitCode} available (unreserved) in lot ${lot.lotNumber}.`);
  }
  const onHand = dec(lot.onHand).minus(qty);
  if (onHand.lt(0)) throw new InventoryError("Shipment exceeds quantity on hand.");
  await tx.inventoryLot.update({ where: { id: lot.id }, data: { onHand: onHand.toString(), reserved: D.max(0, reserved).toString(), version: { increment: 1 } } });
  const mv = await postMovement(tx, { type: "SHIPMENT", productId: lot.productId, lotId: lot.id, quantity: qty.neg(), unitCost: lot.unitCost, reference: i.reference, userId: ctx.userId, shipmentLineId: i.shipmentLineId, idempotencyKey: i.idempotencyKey });
  await audit(tx, { userId: ctx.userId, action: "inventory.ship", entity: "InventoryLot", entityId: lot.id, summary: `Shipped ${qty} ${lot.product.unitCode} from ${lot.location.code}/${lot.lotNumber}`, data: { movementId: mv.id } });
  return mv;
}
export const shipOut = (ctx: Ctx, i: Parameters<typeof shipOutTx>[2]) => serializable((tx) => shipOutTx(tx, ctx, i));

/** Reverse a receipt or adjustment by posting an equal and opposite movement. History is never edited. */
export async function reverse(ctx: Ctx, movementId: string, reason: string) {
  return serializable(async (tx) => {
    if (!reason?.trim()) throw new InventoryError("A reason is required to reverse a movement.");
    const m = await tx.inventoryMovement.findUnique({ where: { id: movementId }, include: { reversedBy: true } });
    if (!m) throw new InventoryError("Movement not found.");
    if (m.reversedBy) throw new InventoryError("This movement has already been reversed.");
    if (m.type === "REVERSAL") throw new InventoryError("A reversal cannot itself be reversed; post a new movement instead.");
    if (!["RECEIPT", "ADJUSTMENT"].includes(m.type)) throw new InventoryError("Only receipts and adjustments can be reversed here. Transfers and shipments are corrected through their own workflows.");
    if (m.purchaseReceiptLineId) throw new InventoryError("Purchase-order receipts are reversed from the purchase order.");
    const lot = await lockLot(tx, m.lotId);
    const delta = dec(m.quantity).neg();
    const onHand = dec(lot.onHand).plus(delta);
    if (onHand.lt(0) || onHand.lt(dec(lot.reserved))) throw new InventoryError("Reversal would leave the lot below its reserved or zero quantity.");
    let unitCost = dec(lot.unitCost);
    if (m.type === "RECEIPT" && onHand.gt(0)) {
      // Back the receipt's value out of the blended lot cost.
      unitCost = dec(lot.onHand).times(unitCost).minus(dec(m.quantity).times(dec(m.unitCost))).div(onHand);
      if (unitCost.lt(0)) unitCost = new D(0);
    }
    await tx.inventoryLot.update({ where: { id: lot.id }, data: { onHand: onHand.toString(), unitCost: unitAmt(unitCost).toString(), version: { increment: 1 } } });
    const mv = await postMovement(tx, { type: "REVERSAL", productId: m.productId, lotId: m.lotId, quantity: delta, unitCost: m.unitCost, reason, reference: m.reference, userId: ctx.userId, reversesId: m.id });
    await audit(tx, { userId: ctx.userId, action: "inventory.reverse", entity: "InventoryMovement", entityId: m.id, summary: `Reversed ${m.type.toLowerCase()} of ${m.quantity}: ${reason}` });
    return mv;
  });
}

/** Recompute lot balances from the ledger and report differences (integrity check). */
export async function reconcileLots(tx: Tx) {
  const rows = await tx.$queryRaw<{ id: string; onHand: string; ledger: string }[]>`
    SELECT l.id, l."onHand"::text AS "onHand", COALESCE(SUM(m.quantity),0)::text AS ledger
    FROM "InventoryLot" l LEFT JOIN "InventoryMovement" m ON m."lotId" = l.id
    GROUP BY l.id HAVING l."onHand" <> COALESCE(SUM(m.quantity),0)`;
  return rows;
}
