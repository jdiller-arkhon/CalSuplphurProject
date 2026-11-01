import { db } from "../db";
import { D, dec, type Dec } from "@/lib/decimal";
import { convertUnitRate, type UnitDef } from "@/lib/units";

export type GuideObservation = { id: string; date: Date; price: Dec; kind: "market" | "sale" | "purchase"; label: string; source: string; basis?: string; weight: number };
export type Range = { count: number; low: Dec; p25: Dec; median: Dec; p75: Dec; high: Dec; newest: Date };

const HALF_LIFE_DAYS = 45;

/** Weighted quantile: newer observations count more (weight halves every 45 days). */
export function weightedQuantile(xs: { v: Dec; w: number }[], q: number): Dec {
  const s = [...xs].sort((a, b) => a.v.comparedTo(b.v));
  const total = s.reduce((t, x) => t + x.w, 0);
  let acc = 0;
  for (const x of s) { acc += x.w; if (acc >= q * total - 1e-12) return x.v; }
  return s.at(-1)!.v;
}
export function range(obs: GuideObservation[]): Range | null {
  if (!obs.length) return null;
  const xs = obs.map((o) => ({ v: o.price, w: o.weight }));
  return { count: obs.length, low: D.min(...obs.map((o) => o.price)), p25: weightedQuantile(xs, 0.25), median: weightedQuantile(xs, 0.5), p75: weightedQuantile(xs, 0.75), high: D.max(...obs.map((o) => o.price)), newest: new Date(Math.max(...obs.map((o) => o.date.getTime()))) };
}
const recency = (d: Date, now: Date) => Math.pow(0.5, Math.max(0, (now.getTime() - d.getTime()) / 86400000) / HALF_LIFE_DAYS);

export type MarketGuide = Awaited<ReturnType<typeof marketGuide>>;

/**
 * Market-rate guide for one product, in the product's unit and USD.
 * Built only from records in this system: market prices staff entered, the company's own sales prices
 * and its supplier costs. Nothing is fetched from outside and nothing is estimated when data is missing.
 */
export async function marketGuide(productId: string, opts: { days?: number; basis?: string; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const days = opts.days ?? 180;
  const since = new Date(now.getTime() - days * 86400000);
  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) return null;
  const unit = product.unitCode;
  const [units, rates, sales, buys, lots] = await Promise.all([
    db.unitOfMeasure.findMany(),
    db.marketRate.findMany({ where: { productId, observedAt: { gte: since } }, orderBy: { observedAt: "desc" } }),
    db.salesOrderLine.findMany({ where: { productId, order: { orderDate: { gte: since }, status: { not: "CANCELLED" } } }, include: { order: { include: { customer: true } } } }),
    db.purchaseOrderLine.findMany({ where: { productId, po: { orderDate: { gte: since }, status: { notIn: ["DRAFT", "CANCELLED"] } } }, include: { po: { include: { supplier: true } } } }),
    db.inventoryLot.findMany({ where: { productId, onHand: { gt: 0 } } }),
  ]);
  const u = units as unknown as UnitDef[];
  const excluded = { currency: 0, unit: 0, basis: 0 };
  const market: GuideObservation[] = [];
  for (const r of rates) {
    if (r.currency !== "USD") { excluded.currency++; continue; }
    if (opts.basis && r.basis !== opts.basis) { excluded.basis++; continue; }
    let price: Dec;
    try { price = convertUnitRate(r.price, r.unitCode, unit, u).toDecimalPlaces(4); } catch { excluded.unit++; continue; }
    market.push({ id: r.id, date: r.observedAt, price, kind: "market", label: r.sourceType, source: r.source, basis: r.basis, weight: recency(r.observedAt, now) });
  }
  const sold: GuideObservation[] = sales.filter((l) => l.order.currency === "USD").map((l) => ({ id: l.id, date: l.order.orderDate, price: dec(l.unitPrice), kind: "sale", label: l.order.number, source: l.order.customer.name, weight: recency(l.order.orderDate, now) }));
  const bought: GuideObservation[] = buys.filter((l) => l.po.currency === "USD").map((l) => ({ id: l.id, date: l.po.orderDate, price: dec(l.unitCost), kind: "purchase", label: l.po.number, source: l.po.supplier.name, weight: recency(l.po.orderDate, now) }));

  const m = range(market), s = range(sold), b = range(bought);
  const onHand = lots.reduce((t, l) => t.plus(dec(l.onHand)), new D(0));
  const stockCost = onHand.gt(0) ? lots.reduce((t, l) => t.plus(dec(l.onHand).times(dec(l.unitCost))), new D(0)).div(onHand).toDecimalPlaces(4) : null;
  const cost = stockCost ?? (product.defaultCost ? dec(product.defaultCost) : null);
  const minMargin = product.minMarginPct ? dec(product.minMarginPct) : null;
  const floor = cost && minMargin && minMargin.lt(1) ? cost.div(new D(1).minus(minMargin)).toDecimalPlaces(2) : null;

  // Trend: weighted median of the most recent 60 days vs the 60 days before.
  const mid = (xs: GuideObservation[]) => (xs.length ? weightedQuantile(xs.map((o) => ({ v: o.price, w: 1 })), 0.5) : null);
  const cut = new Date(now.getTime() - 60 * 86400000), cut2 = new Date(now.getTime() - 120 * 86400000);
  const recent = mid(market.filter((o) => o.date >= cut)), prior = mid(market.filter((o) => o.date >= cut2 && o.date < cut));
  const trend = recent && prior && !prior.isZero() ? recent.minus(prior).div(prior) : null;

  const basisSource = m ? "market" : s ? "sales" : null;
  const ref = m ?? s;
  const suggested = ref ? { low: ref.p25.toDecimalPlaces(2), mid: ref.median.toDecimalPlaces(2), high: ref.p75.toDecimalPlaces(2), source: basisSource as "market" | "sales" } : null;
  const ageDays = m ? Math.round((now.getTime() - m.newest.getTime()) / 86400000) : null;
  const confidence: "high" | "medium" | "low" | "none" = !m ? (s ? "low" : "none") : m.count >= 5 && ageDays! <= 30 ? "high" : m.count >= 2 && ageDays! <= 90 ? "medium" : "low";

  return { product: { id: product.id, name: product.name, unit }, days, market: m, sales: s, purchases: b, cost, floor, minMargin, trend, suggested, confidence, ageDays, excluded, observations: [...market, ...sold, ...bought].sort((a, b) => a.date.getTime() - b.date.getTime()) };
}

/** Where a price sits against the guide. */
export function position(price: Dec, g: NonNullable<MarketGuide>) {
  if (!g.suggested) return null;
  const { low, mid, high } = g.suggested;
  const vsMid = mid.isZero() ? null : price.minus(mid).div(mid);
  const zone = price.lt(low) ? "below" : price.gt(high) ? "above" : "within";
  const belowFloor = g.floor ? price.lt(g.floor) : false;
  return { zone, vsMid, belowFloor } as const;
}
