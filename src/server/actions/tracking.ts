"use server";
import { z } from "zod";
import { db } from "../db";
import { audit } from "../audit";
import { action, zReq, zOpt, zDec, zDecOpt, zDate, UserError } from "../action";
import type { ActionState } from "../action";
import { logEntry } from "../services/tracking";

const trackerSchema = z.object({
  id: zOpt(40),
  name: zReq("Name", 120),
  description: zOpt(1000),
  category: zOpt(60),
  unitCode: zReq("Unit", 20),
  aggregation: z.enum(["SUM", "AVERAGE", "LATEST"]),
  frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "AS_NEEDED"]),
  target: zDecOpt("Target"),
  targetDirection: z.enum(["AT_LEAST", "AT_MOST", ""]).optional(),
  decimals: z.coerce.number().int().min(0).max(6).default(2),
  productId: zOpt(40),
  locationId: zOpt(40),
});

const saveTrackerImpl = action("tracking.use", trackerSchema, async (d, u) => {
  const unit = await db.unitOfMeasure.findUnique({ where: { code: d.unitCode } });
  if (!unit) throw new UserError("Choose a unit.");
  const data = { name: d.name, description: d.description ?? null, category: d.category ?? null, unitCode: d.unitCode, aggregation: d.aggregation, frequency: d.frequency, target: d.target ?? null, targetDirection: d.target ? (d.targetDirection || "AT_LEAST") : null, decimals: d.decimals, productId: d.productId ?? null, locationId: d.locationId ?? null };
  if (d.id) {
    const cur = await db.tracker.findUnique({ where: { id: d.id }, include: { _count: { select: { entries: true } } } });
    if (!cur) throw new UserError("Tracker not found.");
    if (cur.unitCode !== d.unitCode && cur._count.entries > 0) {
      const from = await db.unitOfMeasure.findUnique({ where: { code: cur.unitCode } });
      if (from?.dimension !== unit.dimension) throw new UserError("This tracker has values already, so its unit can only change to one of the same kind (e.g. MT → short tons).");
      // Re-express stored values in the new unit so history stays correct.
      const factor = (await import("@/lib/units")).convertUnits(1, cur.unitCode, d.unitCode, await db.unitOfMeasure.findMany());
      await db.$executeRaw`UPDATE "TrackerEntry" SET "value" = ROUND("value" * ${factor.toString()}::numeric, 6) WHERE "trackerId" = ${d.id}`;
      if (cur.target) data.target = factor.times(cur.target.toString()).toDecimalPlaces(6).toString() as never;
    }
    await db.tracker.update({ where: { id: d.id }, data });
    await audit(db, { userId: u.id, action: "tracker.update", entity: "Tracker", entityId: d.id, summary: `Updated tracker ${d.name}` });
    return { message: "Tracker updated." };
  }
  const t = await db.tracker.create({ data: { ...data, createdBy: u.id } });
  await audit(db, { userId: u.id, action: "tracker.create", entity: "Tracker", entityId: t.id, summary: `Created tracker ${d.name} (${d.unitCode})` });
  return { message: "Tracker created.", redirect: `/tracking/${t.id}` };
}, { revalidate: ["/tracking"] });
export async function saveTracker(prev: ActionState, fd: FormData) { return saveTrackerImpl(prev, fd); }

const archiveImpl = action("tracking.use", z.object({ id: zReq("Tracker", 40), archived: z.enum(["true", "false"]) }), async (d, u) => {
  const t = await db.tracker.update({ where: { id: d.id }, data: { archived: d.archived === "true" } });
  await audit(db, { userId: u.id, action: d.archived === "true" ? "tracker.archive" : "tracker.restore", entity: "Tracker", entityId: t.id, summary: `${d.archived === "true" ? "Archived" : "Restored"} tracker ${t.name}` });
  return { message: d.archived === "true" ? "Tracker archived." : "Tracker restored.", redirect: "/tracking" };
}, { revalidate: ["/tracking"] });
export async function archiveTracker(prev: ActionState, fd: FormData) { return archiveImpl(prev, fd); }

const logImpl = action("tracking.use", z.object({ trackerId: zReq("Tracker", 40), at: zDate("Date"), value: zDec("Value"), unit: zReq("Unit", 20), note: zOpt(500) }), async (d, u) => {
  if (d.at.getTime() > Date.now() + 86400000) throw new UserError("The date can't be in the future.");
  const e = await logEntry({ trackerId: d.trackerId, at: d.at, value: d.value, unit: d.unit, note: d.note }, u.id);
  await audit(db, { userId: u.id, action: "tracker.log", entity: "TrackerEntry", entityId: e.id, summary: `Logged ${d.value} ${d.unit}`, data: { trackerId: d.trackerId } });
  return "Value logged.";
}, { revalidate: ["/tracking"] });
export async function logTrackerEntry(prev: ActionState, fd: FormData) { return logImpl(prev, fd); }

const delEntryImpl = action("tracking.use", z.object({ id: zReq("Entry", 40) }), async (d, u) => {
  const e = await db.trackerEntry.delete({ where: { id: d.id } });
  await audit(db, { userId: u.id, action: "tracker.entry.delete", entity: "TrackerEntry", entityId: e.id, summary: `Deleted logged value ${e.enteredValue} ${e.enteredUnit}`, data: { trackerId: e.trackerId, at: e.at } });
  return "Entry deleted.";
}, { revalidate: ["/tracking"] });
export async function deleteTrackerEntry(prev: ActionState, fd: FormData) { return delEntryImpl(prev, fd); }
