"use server";

import { z } from "zod";
import { db } from "../db";
import { audit } from "../audit";
import { action, zReq, zOpt, zDec, zDate, zBool } from "../action";
import type { ActionState } from "../action";
import * as plant from "../services/plant";

const ticketActionImpl = action(
  "inventory.operate",
  z.object({ direction: z.enum(["IN", "OUT"]), productId: zReq("Product"), grossKg: zDec("Gross weight", { min: 0, allowZero: false }), tareKg: zDec("Empty weight", { min: 0 }), truckId: zOpt(40), vehicleRef: zOpt(60), driver: zOpt(80), reference: zOpt(120), notes: zOpt(500), post: zBool, locationId: zOpt(40), lotNumber: zOpt(60), lotId: zOpt(40), unitCost: zOpt(30), idempotencyKey: z.string().optional() }),
  async (d, u) => {
    const t = await plant.recordScaleTicket({ userId: u.id }, { ...d, post: d.post ? { locationId: d.locationId, lotNumber: d.lotNumber, lotId: d.lotId, unitCost: d.unitCost } : undefined });
    return `Ticket ${t.number}: ${t.netQty} net${d.post ? " — posted to inventory" : ""}.`;
  },
);

const productionActionImpl = action(
  "inventory.operate",
  z.object({ runDate: zDate("Run date"), inputLotId: zReq("Input lot"), inputQty: zDec("Input quantity", { min: 0, allowZero: false }), outputProductId: zReq("Output product"), outputLocationId: zReq("Output location"), outputLotNumber: zReq("Output lot", 60), outputQty: zDec("Output quantity", { min: 0, allowZero: false }), processingCost: zOpt(30), notes: zOpt(500), idempotencyKey: z.string().optional() }),
  async (d, u) => {
    const r = await plant.recordProductionRun({ userId: u.id }, d);
    return `Run ${r.number} recorded — yield ${(Number(r.yieldPct) * 100).toFixed(2)}%.`;
  },
);

const vesselDayActionImpl = action("logistics.manage", z.object({ shipmentId: zReq("Shipment"), day: zDate("Day"), quantity: zDec("Quantity", { min: 0 }), notes: zOpt(300) }), async (d, u) => {
  await plant.recordVesselDay({ userId: u.id }, d);
  return "Loading recorded.";
});

const saveTruckImpl = action("products.manage", z.object({ id: zOpt(40), code: zReq("Truck number", 20), plate: zOpt(20), notes: zOpt(200), active: zBool }), async (d, u) => {
  const data = { code: d.code.toUpperCase(), plate: d.plate ?? null, notes: d.notes ?? null, active: d.id ? d.active : true };
  const t = d.id ? await db.truck.update({ where: { id: d.id }, data }) : await db.truck.create({ data });
  await audit(db, { userId: u.id, action: "truck.save", entity: "Truck", entityId: t.id, summary: `${d.id ? "Updated" : "Added"} truck ${t.code}` });
  return "Truck saved.";
});

const setShipmentDetailsImpl = action("logistics.manage", z.object({ id: zReq("id"), truckId: zOpt(40), containerCount: z.string().optional().transform((v) => (v ? Number(v) : null)).refine((v) => v === null || (Number.isInteger(v) && v >= 0 && v < 10000), "Whole number"), berth: zOpt(40) }), async (d, u) => {
  const s = await db.shipment.update({ where: { id: d.id }, data: { truckId: d.truckId ?? null, containerCount: d.containerCount, berth: d.berth ?? null } });
  await audit(db, { userId: u.id, action: "shipment.update", entity: "Shipment", entityId: s.id, summary: `Updated equipment details on ${s.number}` });
  return "Saved.";
});

// Server Action exports must be async functions (Next.js requirement for "use server" files).
export async function ticketAction(prev: ActionState, fd: FormData) {
  return ticketActionImpl(prev, fd);
}
export async function productionAction(prev: ActionState, fd: FormData) {
  return productionActionImpl(prev, fd);
}
export async function vesselDayAction(prev: ActionState, fd: FormData) {
  return vesselDayActionImpl(prev, fd);
}
export async function saveTruck(prev: ActionState, fd: FormData) {
  return saveTruckImpl(prev, fd);
}
export async function setShipmentDetails(prev: ActionState, fd: FormData) {
  return setShipmentDetailsImpl(prev, fd);
}
