import { D, dec, unitAmt, qty as q6, type DecInput } from "@/lib/decimal";
import { convert } from "@/lib/units";
import { serializable, nextNumber } from "../db";
import { audit } from "../audit";
import { receiveTx, shipOutTx, InventoryError } from "./inventory";

type Ctx = { userId: string };
export class PlantError extends Error {}

/**
 * Weighbridge ticket. Net = gross − tare in kg, converted to the product's unit.
 * Optionally posts the net quantity to inventory (IN = receipt into a lot, OUT = outbound from a lot).
 */
export async function recordScaleTicket(
  ctx: Ctx,
  i: {
    direction: "IN" | "OUT";
    productId: string;
    grossKg: DecInput;
    tareKg: DecInput;
    truckId?: string;
    vehicleRef?: string;
    driver?: string;
    reference?: string;
    notes?: string;
    shipmentId?: string;
    at?: Date;
    post?: { lotId?: string; locationId?: string; lotNumber?: string; unitCost?: DecInput };
    idempotencyKey?: string;
  },
) {
  return serializable(async (tx) => {
    const gross = dec(i.grossKg), tare = dec(i.tareKg);
    if (gross.lte(0) || tare.lt(0)) throw new PlantError("Gross must be above zero and tare cannot be negative.");
    if (tare.gte(gross)) throw new PlantError("Tare must be less than gross weight.");
    const product = await tx.product.findUniqueOrThrow({ where: { id: i.productId }, include: { unit: true } });
    const netKg = gross.minus(tare);
    const table = { KG: "1", [product.unitCode]: product.unit.toKg.toString() };
    const netQty = q6(convert(netKg, "KG", product.unitCode, table));
    const number = await nextNumber(tx, i.direction === "IN" ? "TKI" : "TKO");
    const t = await tx.scaleTicket.create({
      data: { number, direction: i.direction, at: i.at ?? new Date(), productId: product.id, truckId: i.truckId, vehicleRef: i.vehicleRef, driver: i.driver, grossKg: gross.toString(), tareKg: tare.toString(), netKg: netKg.toString(), netQty: netQty.toString(), shipmentId: i.shipmentId, reference: i.reference, notes: i.notes, createdBy: ctx.userId },
    });
    if (i.post) {
      if (i.direction === "IN") {
        if (!i.post.locationId || !i.post.lotNumber) throw new PlantError("Choose a location and lot number to receive into.");
        await receiveTx(tx, ctx, { productId: product.id, locationId: i.post.locationId, lotNumber: i.post.lotNumber, quantity: netQty, unitCost: i.post.unitCost ?? product.defaultCost ?? 0, reference: `Ticket ${number}`, idempotencyKey: i.idempotencyKey ? `tki:${i.idempotencyKey}` : undefined });
      } else {
        if (!i.post.lotId) throw new PlantError("Choose the lot this load came from.");
        await shipOutTx(tx, ctx, { lotId: i.post.lotId, quantity: netQty, reference: `Ticket ${number}`, idempotencyKey: i.idempotencyKey ? `tko:${i.idempotencyKey}` : undefined });
      }
    }
    await audit(tx, { userId: ctx.userId, action: "scale.ticket", entity: "ScaleTicket", entityId: t.id, summary: `Scale ticket ${number}: ${netQty} ${product.unitCode} ${i.direction === "IN" ? "in" : "out"}${i.post ? " (posted to inventory)" : ""}` });
    return t;
  });
}

/**
 * Pelletizer run: consumes input (e.g. molten) from a lot and produces output (e.g. prill) into a new/existing lot.
 * Output unit cost = (input value + processing cost) ÷ output quantity, so the cost of any loss is carried by the product made.
 */
export async function recordProductionRun(
  ctx: Ctx,
  i: { runDate: Date; inputLotId: string; inputQty: DecInput; outputProductId: string; outputLocationId: string; outputLotNumber: string; outputQty: DecInput; processingCost?: DecInput; notes?: string; idempotencyKey?: string },
) {
  return serializable(async (tx) => {
    if (i.idempotencyKey) {
      const k = await tx.idempotencyKey.findUnique({ where: { key: `prod:${i.idempotencyKey}` } });
      if (k) return tx.productionRun.findUniqueOrThrow({ where: { id: (k.result as { id: string }).id } });
    }
    const inQty = q6(i.inputQty), outQty = q6(i.outputQty);
    if (inQty.lte(0) || outQty.lte(0)) throw new PlantError("Input and output quantities must be above zero.");
    const lot = await tx.inventoryLot.findUniqueOrThrow({ where: { id: i.inputLotId }, include: { product: true } });
    const outProduct = await tx.product.findUniqueOrThrow({ where: { id: i.outputProductId } });
    if (lot.product.unitCode !== outProduct.unitCode) throw new PlantError("Input and output products must use the same unit.");
    const processing = unitAmt(i.processingCost ?? 0);
    if (processing.lt(0)) throw new PlantError("Processing cost cannot be negative.");
    const inputValue = inQty.times(dec(lot.unitCost));
    const outCost = unitAmt(inputValue.plus(processing).div(outQty));
    const yieldPct = outQty.div(inQty).toDecimalPlaces(6);
    const number = await nextNumber(tx, "PR");
    const ref = `Production ${number}`;
    try {
      await shipOutTx(tx, ctx, { lotId: lot.id, quantity: inQty, reference: ref });
    } catch (e) {
      if (e instanceof InventoryError) throw new PlantError(`Not enough input available: ${e.message}`);
      throw e;
    }
    // Re-label the consumption as production use rather than a sale.
    await tx.inventoryMovement.updateMany({ where: { lotId: lot.id, reference: ref, type: "SHIPMENT" }, data: { type: "PRODUCTION_OUT" } });
    await receiveTx(tx, ctx, { productId: outProduct.id, locationId: i.outputLocationId, lotNumber: i.outputLotNumber, quantity: outQty, unitCost: outCost, reference: ref, type: "PRODUCTION_IN", receivedAt: i.runDate });
    const run = await tx.productionRun.create({ data: { number, runDate: i.runDate, inputLotId: lot.id, inputQty: inQty.toString(), outputProductId: outProduct.id, outputLocationId: i.outputLocationId, outputLotNumber: i.outputLotNumber, outputQty: outQty.toString(), processingCost: processing.toString(), outputUnitCost: outCost.toString(), yieldPct: yieldPct.toString(), notes: i.notes, createdBy: ctx.userId } });
    if (i.idempotencyKey) await tx.idempotencyKey.create({ data: { key: `prod:${i.idempotencyKey}`, scope: "production", result: { id: run.id } } });
    await audit(tx, { userId: ctx.userId, action: "production.run", entity: "ProductionRun", entityId: run.id, summary: `${number}: ${inQty} ${lot.product.unitCode} ${lot.product.name} → ${outQty} ${outProduct.name} (yield ${yieldPct.times(100).toFixed(2)}%)` });
    return run;
  });
}

/** Record tons loaded on a given day for a vessel shipment (one row per day; re-entering a day replaces it). */
export async function recordVesselDay(ctx: Ctx, i: { shipmentId: string; day: Date; quantity: DecInput; notes?: string }) {
  return serializable(async (tx) => {
    const s = await tx.shipment.findUniqueOrThrow({ where: { id: i.shipmentId } });
    if (s.mode !== "VESSEL") throw new PlantError("Daily loading is only tracked for vessel shipments.");
    const q = q6(i.quantity);
    if (q.lt(0)) throw new PlantError("Quantity cannot be negative.");
    const day = new Date(Date.UTC(i.day.getUTCFullYear(), i.day.getUTCMonth(), i.day.getUTCDate()));
    const row = await tx.vesselLoadDay.upsert({ where: { shipmentId_day: { shipmentId: s.id, day } }, update: { quantity: q.toString(), notes: i.notes }, create: { shipmentId: s.id, day, quantity: q.toString(), notes: i.notes } });
    await audit(tx, { userId: ctx.userId, action: "vessel.day", entity: "Shipment", entityId: s.id, summary: `${s.number}: ${q} loaded on ${day.toISOString().slice(0, 10)}` });
    return row;
  });
}

export { D };
