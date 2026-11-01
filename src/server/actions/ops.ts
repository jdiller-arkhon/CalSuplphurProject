"use server";

import { z } from "zod";
import { db } from "../db";
import { audit } from "../audit";
import { action, zReq, zOpt, zDec, zDateOpt, UserError } from "../action";
import type { ActionState } from "../action";
import * as po from "../services/purchasing";
import * as sales from "../services/sales";
import { dec, money } from "@/lib/decimal";

const poLine = z.object({ productId: zReq("Product"), quantity: zDec("Quantity", { min: 0, allowZero: false }), unitCost: zDec("Unit cost", { min: 0 }) });

const createPOActionImpl = action("purchasing.manage", z.object({ supplierId: zReq("Supplier"), expectedAt: zDateOpt, notes: zOpt(2000), lines: z.array(poLine).min(1) }), async (d, u) => {
  const p = await po.createPO({ userId: u.id }, d);
  return { message: `${p.number} created as draft.`, redirect: `/purchasing/${p.id}` };
});
const issuePOActionImpl = action("purchasing.manage", z.object({ id: zReq("id") }), async (d, u) => {
  await po.issuePO({ userId: u.id }, d.id);
  return "Purchase order issued. CSC Command does not send it — share the document with the supplier yourself.";
});
const amendPOActionImpl = action("purchasing.manage", z.object({ poLineId: zReq("Line"), quantity: zDec("Quantity", { min: 0 }), unitCost: zDec("Unit cost", { min: 0 }), reason: zReq("Reason", 300) }), async (d, u) => {
  await po.amendPOLine({ userId: u.id }, d);
  return "Line amended; revision recorded.";
});
const cancelPOActionImpl = action("purchasing.manage", z.object({ id: zReq("id"), reason: zReq("Reason", 300) }), async (d, u) => {
  await po.cancelPO({ userId: u.id }, d.id, d.reason);
  return "Purchase order closed.";
});
const receivePOActionImpl = action(
  "purchasing.manage",
  z.object({
    poId: zReq("PO"),
    reference: zOpt(120),
    receivedAt: zDateOpt,
    idempotencyKey: z.string().optional(),
    lines: z.array(z.object({ poLineId: zReq("Line"), quantity: z.string().trim().optional().default(""), locationId: z.string().optional().default(""), lotNumber: z.string().trim().max(60).optional().default(""), unitCost: zOpt(30) })),
  }),
  async (d, u) => {
    const lines = d.lines.filter((l) => l.quantity && dec(l.quantity).gt(0));
    for (const l of lines) {
      if (!/^\d{1,14}(\.\d{1,6})?$/.test(l.quantity)) throw new UserError("Received quantities must be numbers.");
      if (!l.locationId || !l.lotNumber) throw new UserError("Each received line needs a location and lot number.");
    }
    await po.receivePO({ userId: u.id }, { poId: d.poId, reference: d.reference, receivedAt: d.receivedAt, idempotencyKey: d.idempotencyKey ? `por:${d.idempotencyKey}` : undefined, lines: lines.map((l) => ({ ...l, unitCost: l.unitCost })) });
    return "Receipt posted to inventory.";
  },
);

const createShipmentActionImpl = action(
  "logistics.manage",
  z.object({
    orderId: zOpt(40),
    mode: zReq("Mode"),
    carrier: zOpt(120),
    vehicleRef: zOpt(120),
    origin: zOpt(200),
    destination: zOpt(200),
    scheduledAt: zDateOpt,
    notes: zOpt(2000),
    lines: z.array(z.object({ salesOrderLineId: zOpt(40), lotId: zReq("Lot"), quantity: z.string().trim().optional().default("") })),
    freight: z.array(z.object({ category: zReq("Category"), amount: z.string().trim().optional().default(""), notes: zOpt(200) })).optional().default([]),
  }),
  async (d, u) => {
    const lines = d.lines.filter((l) => l.quantity && /^\d+(\.\d+)?$/.test(l.quantity) && dec(l.quantity).gt(0));
    if (!lines.length) throw new UserError("Enter a quantity on at least one line.");
    const freight = d.freight.filter((f) => f.amount && /^\d+(\.\d+)?$/.test(f.amount));
    const s = await sales.createShipment({ userId: u.id }, { ...d, lines, freight });
    return { message: `Shipment ${s.number} planned.`, redirect: `/logistics/${s.id}` };
  },
);
const sid = z.object({ id: zReq("id") });
const dispatchShipmentActionImpl = action("logistics.manage", sid, async (d, u) => {
  await sales.postShipment({ userId: u.id }, d.id);
  return "Shipment dispatched — inventory deducted and revenue recognized.";
});
const deliverShipmentActionImpl = action("logistics.manage", z.object({ id: zReq("id"), deliveredAt: zDateOpt }), async (d, u) => {
  await sales.deliverShipment({ userId: u.id }, d.id, d.deliveredAt);
  return "Delivery confirmed.";
});
const cancelShipmentActionImpl = action("logistics.manage", sid, async (d, u) => {
  await sales.cancelShipment({ userId: u.id }, d.id);
  return "Shipment cancelled.";
});
const addFreightActionImpl = action("logistics.manage", z.object({ shipmentId: zReq("Shipment"), category: zReq("Category"), amount: zDec("Amount", { min: 0, allowZero: false }), notes: zOpt(200) }), async (d, u) => {
  const s = await db.shipment.findUniqueOrThrow({ where: { id: d.shipmentId } });
  if (s.status === "CANCELLED") throw new UserError("Shipment is cancelled.");
  await db.freightCost.create({ data: { shipmentId: d.shipmentId, category: d.category, amount: money(d.amount).toString(), notes: d.notes } });
  await audit(db, { userId: u.id, action: "shipment.freight", entity: "Shipment", entityId: s.id, summary: `Added ${d.category.toLowerCase()} $${d.amount} to ${s.number}` });
  return "Freight cost recorded.";
});
const updateShipmentActionImpl = action("logistics.manage", z.object({ id: zReq("id"), carrier: zOpt(120), vehicleRef: zOpt(120), scheduledAt: zDateOpt, destination: zOpt(200), notes: zOpt(2000) }), async (d, u) => {
  const s = await db.shipment.update({ where: { id: d.id }, data: { carrier: d.carrier ?? null, vehicleRef: d.vehicleRef ?? null, scheduledAt: d.scheduledAt ?? null, destination: d.destination ?? null, notes: d.notes ?? null } });
  await audit(db, { userId: u.id, action: "shipment.update", entity: "Shipment", entityId: s.id, summary: `Updated ${s.number} details` });
  return "Shipment updated.";
});

// Server Action exports must be async functions (Next.js requirement for "use server" files).
export async function createPOAction(prev: ActionState, fd: FormData) {
  return createPOActionImpl(prev, fd);
}
export async function issuePOAction(prev: ActionState, fd: FormData) {
  return issuePOActionImpl(prev, fd);
}
export async function amendPOAction(prev: ActionState, fd: FormData) {
  return amendPOActionImpl(prev, fd);
}
export async function cancelPOAction(prev: ActionState, fd: FormData) {
  return cancelPOActionImpl(prev, fd);
}
export async function receivePOAction(prev: ActionState, fd: FormData) {
  return receivePOActionImpl(prev, fd);
}
export async function createShipmentAction(prev: ActionState, fd: FormData) {
  return createShipmentActionImpl(prev, fd);
}
export async function dispatchShipmentAction(prev: ActionState, fd: FormData) {
  return dispatchShipmentActionImpl(prev, fd);
}
export async function deliverShipmentAction(prev: ActionState, fd: FormData) {
  return deliverShipmentActionImpl(prev, fd);
}
export async function cancelShipmentAction(prev: ActionState, fd: FormData) {
  return cancelShipmentActionImpl(prev, fd);
}
export async function addFreightAction(prev: ActionState, fd: FormData) {
  return addFreightActionImpl(prev, fd);
}
export async function updateShipmentAction(prev: ActionState, fd: FormData) {
  return updateShipmentActionImpl(prev, fd);
}
