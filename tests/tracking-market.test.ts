import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, fixture, db } from "./helpers";
import { convertUnits, convertUnitRate, compatible, UnitError } from "@/lib/units";
import { logEntry, summarize, allUnits } from "@/server/services/tracking";
import { marketGuide, weightedQuantile, position } from "@/server/services/market";
import { dec } from "@/lib/decimal";

let f: Awaited<ReturnType<typeof fixture>>;
beforeEach(async () => { await resetDb(); f = await fixture(); });

describe("units of any kind", () => {
  it("converts exactly within a kind and refuses across kinds", async () => {
    const u = await allUnits();
    expect(convertUnits("1", "MT", "ST", u).toDecimalPlaces(6).toString()).toBe("1.102311");
    expect(convertUnits("1", "BBL", "GAL", u).toString()).toBe("42");
    expect(convertUnits("1", "MMBTU", "THERM", u).toString()).toBe("10");
    expect(convertUnits("90", "MIN", "H", u).toDecimalPlaces(6).toString()).toBe("1.5");
    expect(() => convertUnits("1", "MT", "GAL", u)).toThrow(UnitError);
    expect(compatible("LOAD", "EA", u)).toBe(false); // truck loads are their own kind
  });
  it("converts prices inversely to quantities", async () => {
    const u = await allUnits();
    // $100 per short ton = $110.23 per metric ton
    expect(convertUnitRate("100", "ST", "MT", u).toDecimalPlaces(2).toString()).toBe("110.23");
  });
});

describe("trackers", () => {
  it("stores values in the tracker unit, keeps what was typed, and sums by day", async () => {
    const t = await db.tracker.create({ data: { name: "Tons loaded", unitCode: "MT", aggregation: "SUM", frequency: "DAILY", target: "100", targetDirection: "AT_LEAST" } });
    const day = new Date(Date.UTC(2026, 9, 31));
    await logEntry({ trackerId: t.id, at: day, value: "60", unit: "MT" }, f.user.id);
    const e = await logEntry({ trackerId: t.id, at: day, value: "50", unit: "ST" }, f.user.id);
    expect(e.value.toString()).toBe("45.359237");
    expect(e.enteredValue.toString()).toBe("50");
    const entries = await db.trackerEntry.findMany({ where: { trackerId: t.id } });
    const s = summarize(t, entries, await allUnits(), "MT", 3, new Date(Date.UTC(2026, 9, 31, 15)));
    expect(s.headline!.toString()).toBe("105.359237");
    expect(s.onTarget).toBe(true);
    const inST = summarize(t, entries, await allUnits(), "ST", 3, new Date(Date.UTC(2026, 9, 31, 15)));
    expect(inST.headline!.toDecimalPlaces(4).toString()).toBe("116.1387");
  });
  it("refuses a unit of the wrong kind", async () => {
    const t = await db.tracker.create({ data: { name: "Diesel", unitCode: "GAL", aggregation: "SUM", frequency: "WEEKLY" } });
    await expect(logEntry({ trackerId: t.id, at: new Date(), value: "5", unit: "MT" }, f.user.id)).rejects.toThrow(/same kind/);
  });
  it("averages and takes latest readings correctly", async () => {
    const units = await allUnits();
    const now = new Date(Date.UTC(2026, 9, 15));
    const avg = await db.tracker.create({ data: { name: "Moisture", unitCode: "PCT", aggregation: "AVERAGE", frequency: "MONTHLY", target: "0.5", targetDirection: "AT_MOST" } });
    for (const v of ["0.4", "0.6", "0.8"]) await logEntry({ trackerId: avg.id, at: new Date(Date.UTC(2026, 9, 3)), value: v, unit: "PCT" }, f.user.id);
    const sa = summarize(avg, await db.trackerEntry.findMany({ where: { trackerId: avg.id } }), units, "PCT", 2, now);
    expect(sa.headline!.toString()).toBe("0.6");
    expect(sa.onTarget).toBe(false);
    const lvl = await db.tracker.create({ data: { name: "Tank level", unitCode: "M3", aggregation: "LATEST", frequency: "DAILY" } });
    await logEntry({ trackerId: lvl.id, at: new Date(Date.UTC(2026, 9, 10)), value: "500", unit: "M3" }, f.user.id);
    await logEntry({ trackerId: lvl.id, at: new Date(Date.UTC(2026, 9, 12)), value: "1000", unit: "L" }, f.user.id);
    const sl = summarize(lvl, await db.trackerEntry.findMany({ where: { trackerId: lvl.id } }), units, "M3", 7, now);
    expect(sl.headline!.toString()).toBe("1");
  });
});

describe("market-rate guide", () => {
  it("weights newer prices more in the quantiles", () => {
    const xs = [{ v: dec(100), w: 1 }, { v: dec(200), w: 3 }];
    expect(weightedQuantile(xs, 0.5).toString()).toBe("200");
  });
  it("returns nothing to suggest when there is no data", async () => {
    const g = await marketGuide(f.product.id);
    expect(g!.suggested).toBeNull();
    expect(g!.confidence).toBe("none");
  });
  it("converts recorded prices to the product unit, skips non-USD, and computes a floor from cost", async () => {
    const now = new Date(Date.UTC(2026, 10, 1));
    const days = (n: number) => new Date(now.getTime() - n * 86400000);
    const base = { productId: f.product.id, sourceType: "COMPETITOR_QUOTE" as const, source: "Test", basis: "FOB", createdBy: f.user.id };
    await db.marketRate.createMany({ data: [
      { ...base, price: "100", unitCode: "MT", observedAt: days(2) },
      { ...base, price: "110", unitCode: "MT", observedAt: days(5) },
      { ...base, price: "90.718474", unitCode: "ST", observedAt: days(10) }, // = $100/MT
      { ...base, price: "120", unitCode: "MT", observedAt: days(20) },
      { ...base, price: "105", unitCode: "MT", observedAt: days(25) },
      { ...base, price: "999", currency: "EUR", unitCode: "MT", observedAt: days(1) },
    ] });
    const g = await marketGuide(f.product.id, { now });
    expect(g!.market!.count).toBe(5);
    expect(g!.excluded.currency).toBe(1);
    expect(g!.suggested!.source).toBe("market");
    expect(g!.confidence).toBe("high");
    expect(g!.suggested!.mid.toString()).toBe("105");
    expect(g!.market!.low.toString()).toBe("100");
    expect(g!.market!.high.toString()).toBe("120");
    // default cost 80 at 15% minimum margin → 94.12
    expect(g!.floor!.toString()).toBe("94.12");
    expect(position(dec(90), g!)!.belowFloor).toBe(true);
    expect(position(dec(130), g!)!.zone).toBe("above");
  });
  it("ignores prices outside the window and filters by basis", async () => {
    const now = new Date(Date.UTC(2026, 10, 1));
    const base = { productId: f.product.id, sourceType: "BROKER" as const, source: "B", unitCode: "MT", createdBy: f.user.id };
    await db.marketRate.createMany({ data: [
      { ...base, price: "100", basis: "FOB", observedAt: new Date(Date.UTC(2026, 9, 20)) },
      { ...base, price: "140", basis: "DELIVERED", observedAt: new Date(Date.UTC(2026, 9, 21)) },
      { ...base, price: "50", basis: "FOB", observedAt: new Date(Date.UTC(2025, 0, 1)) },
    ] });
    const fob = await marketGuide(f.product.id, { now, basis: "FOB" });
    expect(fob!.market!.count).toBe(1);
    expect(fob!.suggested!.mid.toString()).toBe("100");
    expect(fob!.confidence).toBe("low");
  });
});
