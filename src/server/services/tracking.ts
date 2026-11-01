import type { Tracker, TrackerEntry, UnitOfMeasure } from "@prisma/client";
import { db } from "../db";
export class TrackingError extends Error { name = "TrackingError"; }
import { D, dec, type Dec } from "@/lib/decimal";
import { convertUnits, compatible, UnitError } from "@/lib/units";

export const allUnits = () => db.unitOfMeasure.findMany({ orderBy: [{ dimension: "asc" }, { name: "asc" }] });

export async function logEntry(input: { trackerId: string; at: Date; value: string; unit: string; note?: string | null }, userId: string) {
  const [t, units] = await Promise.all([db.tracker.findUnique({ where: { id: input.trackerId } }), allUnits()]);
  if (!t || t.archived) throw new TrackingError("Tracker not found.");
  if (!compatible(input.unit, t.unitCode, units)) throw new TrackingError(`That unit can't be converted to ${t.unitCode}. Pick a unit of the same kind.`);
  let value: Dec;
  try { value = convertUnits(input.value, input.unit, t.unitCode, units).toDecimalPlaces(6); } catch (e) { throw new TrackingError(e instanceof UnitError ? e.message : "Invalid value."); }
  return db.trackerEntry.create({ data: { trackerId: t.id, at: input.at, value: value.toString(), enteredValue: dec(input.value).toString(), enteredUnit: input.unit, note: input.note || null, createdBy: userId } });
}

export type Bucket = { key: string; label: string; start: Date; value: Dec | null; count: number };

const startOf = (d: Date, f: Tracker["frequency"]) => {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  if (f === "WEEKLY") x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  if (f === "MONTHLY" || f === "AS_NEEDED") x.setUTCDate(1);
  return x;
};
const step = (d: Date, f: Tracker["frequency"], n: number) => { const x = new Date(d); if (f === "DAILY") x.setUTCDate(x.getUTCDate() + n); else if (f === "WEEKLY") x.setUTCDate(x.getUTCDate() + 7 * n); else x.setUTCMonth(x.getUTCMonth() + n); return x; };
const label = (d: Date, f: Tracker["frequency"]) => f === "MONTHLY" || f === "AS_NEEDED" ? d.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }) : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function aggregate(vals: { v: Dec; at: Date; created: Date }[], agg: Tracker["aggregation"]): Dec | null {
  if (!vals.length) return null;
  if (agg === "SUM") return vals.reduce((s, x) => s.plus(x.v), new D(0));
  if (agg === "AVERAGE") return vals.reduce((s, x) => s.plus(x.v), new D(0)).div(vals.length);
  return [...vals].sort((a, b) => a.at.getTime() - b.at.getTime() || a.created.getTime() - b.created.getTime()).at(-1)!.v;
}

/** Period buckets (most recent last) converted into the display unit. */
export function summarize(t: Tracker, entries: TrackerEntry[], units: UnitOfMeasure[], displayUnit: string, periods = 12, now = new Date()) {
  const conv = (v: Dec) => convertUnits(v, t.unitCode, displayUnit, units);
  const cur = startOf(now, t.frequency);
  const buckets: Bucket[] = [];
  for (let i = periods - 1; i >= 0; i--) {
    const s = step(cur, t.frequency, -i), e = step(s, t.frequency, 1);
    const inside = entries.filter((x) => x.at >= s && x.at < e).map((x) => ({ v: dec(x.value), at: x.at, created: x.createdAt }));
    const v = aggregate(inside, t.aggregation);
    buckets.push({ key: s.toISOString().slice(0, 10), label: label(s, t.frequency), start: s, value: v ? conv(v) : null, count: inside.length });
  }
  const current = buckets.at(-1)!, previous = buckets.at(-2) ?? null;
  const latestEntry = [...entries].sort((a, b) => b.at.getTime() - a.at.getTime() || b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
  const target = t.target ? conv(dec(t.target)) : null;
  const headline = t.aggregation === "LATEST" ? (latestEntry ? conv(dec(latestEntry.value)) : null) : current.value;
  const change = headline && previous?.value && !previous.value.isZero() ? headline.minus(previous.value).div(previous.value.abs()) : null;
  const onTarget = target && headline ? (t.targetDirection === "AT_MOST" ? headline.lte(target) : headline.gte(target)) : null;
  const filled = buckets.filter((b) => b.value);
  const total = t.aggregation === "SUM" ? filled.reduce((s, b) => s.plus(b.value!), new D(0)) : null;
  return { buckets, current, previous, headline, change, target, onTarget, latestEntry, total, unit: displayUnit };
}
