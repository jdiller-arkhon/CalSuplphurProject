/**
 * Single source of truth for business figures. The dashboard, analytics, exports, presentations
 * and CSC Insights all call these functions, so every surface reconciles to the same records.
 *
 * Definitions (operational, not accounting — see BUSINESS_ASSUMPTIONS.md):
 *  - Revenue: recognized when sales-order product is dispatched (posted shipment line), at the order line price.
 *  - COGS: posted shipment quantity × the lot's unit cost at dispatch (from the inventory ledger).
 *  - Direct freight: freight costs recorded on shipments dispatched in the period.
 *  - Gross profit: Revenue − COGS − Direct freight.  Net profit is NOT computed (requires operating expenses).
 */
import { D, dec, money, type Dec } from "@/lib/decimal";
import { db } from "../db";

export type Period = { from: Date; to: Date };

export function parsePeriod(sp: { from?: string; to?: string; range?: string }): Period & { label: string; key: string } {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const range = sp.range ?? (sp.from || sp.to ? "custom" : "ytd");
  let from: Date, to: Date = new Date(startOfDay(now).getTime() + 864e5 - 1), label: string;
  switch (range) {
    case "30d": from = new Date(startOfDay(now).getTime() - 29 * 864e5); label = "Last 30 days"; break;
    case "90d": from = new Date(startOfDay(now).getTime() - 89 * 864e5); label = "Last 90 days"; break;
    case "mtd": from = new Date(now.getFullYear(), now.getMonth(), 1); label = "Month to date"; break;
    case "qtd": from = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1); label = "Quarter to date"; break;
    case "12m": from = new Date(now.getFullYear(), now.getMonth() - 11, 1); label = "Last 12 months"; break;
    case "lm": from = new Date(now.getFullYear(), now.getMonth() - 1, 1); to = new Date(new Date(now.getFullYear(), now.getMonth(), 1).getTime() - 1); label = "Last month"; break;
    case "custom": {
      from = sp.from && !isNaN(Date.parse(sp.from)) ? new Date(sp.from) : new Date(now.getFullYear(), 0, 1);
      to = sp.to && !isNaN(Date.parse(sp.to)) ? new Date(new Date(sp.to).getTime() + 864e5 - 1) : to;
      if (to < from) [from, to] = [to, from];
      label = `${from.toLocaleDateString("en-US", { dateStyle: "medium" })} – ${to.toLocaleDateString("en-US", { dateStyle: "medium" })}`;
      break;
    }
    default: from = new Date(now.getFullYear(), 0, 1); label = "Year to date";
  }
  return { from, to, label, key: range };
}

export function previousPeriod(p: Period): Period {
  const len = p.to.getTime() - p.from.getTime();
  return { from: new Date(p.from.getTime() - len - 1), to: new Date(p.from.getTime() - 1) };
}

export type SaleFact = {
  shipmentId: string; shipmentNumber: string; at: Date; orderId: string; orderNumber: string;
  productId: string; productName: string; unit: string; customerId: string; customerName: string;
  quantity: Dec; revenue: Dec; cogs: Dec; unitPrice: Dec; minMargin: Dec | null;
};

export async function saleFacts(p: Period): Promise<SaleFact[]> {
  const lines = await db.shipmentLine.findMany({
    where: { posted: true, salesOrderLineId: { not: null }, shipment: { shippedAt: { gte: p.from, lte: p.to }, status: { not: "CANCELLED" } } },
    include: { shipment: true, salesOrderLine: { include: { product: true, order: { include: { customer: true } } } } },
  });
  return lines.map((l) => {
    const sol = l.salesOrderLine!;
    const q = dec(l.quantity);
    return {
      shipmentId: l.shipmentId, shipmentNumber: l.shipment.number, at: l.shipment.shippedAt!, orderId: sol.orderId, orderNumber: sol.order.number,
      productId: sol.productId, productName: sol.product.name, unit: sol.product.unitCode, customerId: sol.order.customerId, customerName: sol.order.customer.name,
      quantity: q, revenue: q.times(dec(sol.unitPrice)), cogs: q.times(dec(l.unitCost)), unitPrice: dec(sol.unitPrice), minMargin: sol.product.minMarginPct ? dec(sol.product.minMarginPct) : null,
    };
  });
}

export async function freightIn(p: Period) {
  const rows = await db.freightCost.findMany({ where: { shipment: { shippedAt: { gte: p.from, lte: p.to }, status: { not: "CANCELLED" } } }, include: { shipment: { include: { lines: true } } } });
  return rows;
}

type Agg = { key: string; label: string; quantity: Dec; revenue: Dec; cogs: Dec; freight: Dec };
const blank = (key: string, label: string): Agg => ({ key, label, quantity: new D(0), revenue: new D(0), cogs: new D(0), freight: new D(0) });
export const gp = (a: { revenue: Dec; cogs: Dec; freight: Dec }) => a.revenue.minus(a.cogs).minus(a.freight);
export const margin = (a: { revenue: Dec; cogs: Dec; freight: Dec }) => (a.revenue.isZero() ? null : gp(a).div(a.revenue));

export async function financials(p: Period) {
  const [facts, freight] = await Promise.all([saleFacts(p), freightIn(p)]);
  const totals = blank("total", "Total");
  const byMonth = new Map<string, Agg>();
  const byProduct = new Map<string, Agg>();
  const byCustomer = new Map<string, Agg>();
  const byOrder = new Map<string, Agg>();
  const shipmentQty = new Map<string, Dec>();
  for (const f of facts) shipmentQty.set(f.shipmentId, (shipmentQty.get(f.shipmentId) ?? new D(0)).plus(f.quantity));
  // Allocate each shipment's freight across its sales lines by quantity so product/customer views reconcile to the total.
  const freightByShipment = new Map<string, Dec>();
  for (const fr of freight) freightByShipment.set(fr.shipmentId, (freightByShipment.get(fr.shipmentId) ?? new D(0)).plus(dec(fr.amount)));
  let unallocatedFreight = new D(0);
  for (const [sid, amt] of freightByShipment) if (!shipmentQty.has(sid)) unallocatedFreight = unallocatedFreight.plus(amt);

  const add = (m: Map<string, Agg>, key: string, label: string, f: SaleFact, fr: Dec) => {
    const a = m.get(key) ?? blank(key, label);
    a.quantity = a.quantity.plus(f.quantity);
    a.revenue = a.revenue.plus(f.revenue);
    a.cogs = a.cogs.plus(f.cogs);
    a.freight = a.freight.plus(fr);
    m.set(key, a);
  };
  for (const f of facts) {
    const sq = shipmentQty.get(f.shipmentId)!;
    const fr = sq.isZero() ? new D(0) : (freightByShipment.get(f.shipmentId) ?? new D(0)).times(f.quantity).div(sq);
    totals.quantity = totals.quantity.plus(f.quantity);
    totals.revenue = totals.revenue.plus(f.revenue);
    totals.cogs = totals.cogs.plus(f.cogs);
    totals.freight = totals.freight.plus(fr);
    const mk = `${f.at.getFullYear()}-${String(f.at.getMonth() + 1).padStart(2, "0")}`;
    add(byMonth, mk, mk, f, fr);
    add(byProduct, f.productId, f.productName, f, fr);
    add(byCustomer, f.customerId, f.customerName, f, fr);
    add(byOrder, f.orderId, `${f.orderNumber} · ${f.customerName}`, f, fr);
  }
  totals.freight = totals.freight.plus(unallocatedFreight);
  const months: Agg[] = [];
  for (let d = new Date(p.from.getFullYear(), p.from.getMonth(), 1); d <= p.to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    months.push(byMonth.get(k) ?? blank(k, k));
  }
  const sortRev = (m: Map<string, Agg>) => [...m.values()].sort((a, b) => b.revenue.cmp(a.revenue));
  const lowMargin = facts.filter((f) => f.minMargin && !f.revenue.isZero() && f.revenue.minus(f.cogs).div(f.revenue).lt(f.minMargin));
  return { facts, totals, unallocatedFreight, months, byProduct: sortRev(byProduct), byCustomer: sortRev(byCustomer), byOrder: sortRev(byOrder), lowMargin, freightRows: freight };
}

export async function inventorySnapshot() {
  const lots = await db.inventoryLot.findMany({ where: { OR: [{ onHand: { not: 0 } }, { reserved: { not: 0 } }] }, include: { product: true, location: true }, orderBy: [{ product: { name: "asc" } }, { receivedAt: "asc" }] });
  const rows = lots.map((l) => ({ ...l, available: dec(l.onHand).minus(dec(l.reserved)), value: dec(l.onHand).times(dec(l.unitCost)) }));
  const byProduct = new Map<string, { id: string; name: string; unit: string; reorderPoint: Dec | null; onHand: Dec; reserved: Dec; available: Dec; value: Dec }>();
  const byLocation = new Map<string, { id: string; name: string; code: string; capacity: Dec | null; onHand: Dec; value: Dec }>();
  for (const r of rows) {
    const p = byProduct.get(r.productId) ?? { id: r.productId, name: r.product.name, unit: r.product.unitCode, reorderPoint: r.product.reorderPoint ? dec(r.product.reorderPoint) : null, onHand: new D(0), reserved: new D(0), available: new D(0), value: new D(0) };
    p.onHand = p.onHand.plus(dec(r.onHand)); p.reserved = p.reserved.plus(dec(r.reserved)); p.available = p.available.plus(r.available); p.value = p.value.plus(r.value);
    byProduct.set(r.productId, p);
    const l = byLocation.get(r.locationId) ?? { id: r.locationId, name: r.location.name, code: r.location.code, capacity: r.location.capacity ? dec(r.location.capacity) : null, onHand: new D(0), value: new D(0) };
    l.onHand = l.onHand.plus(dec(r.onHand)); l.value = l.value.plus(r.value);
    byLocation.set(r.locationId, l);
  }
  // Products with reorder points but no stock still need a row so the warning appears.
  const watch = await db.product.findMany({ where: { active: true, reorderPoint: { not: null } } });
  for (const w of watch) if (!byProduct.has(w.id)) byProduct.set(w.id, { id: w.id, name: w.name, unit: w.unitCode, reorderPoint: dec(w.reorderPoint), onHand: new D(0), reserved: new D(0), available: new D(0), value: new D(0) });
  const products = [...byProduct.values()];
  const totals = products.reduce((t, p) => ({ onHand: t.onHand.plus(p.onHand), reserved: t.reserved.plus(p.reserved), available: t.available.plus(p.available), value: t.value.plus(p.value) }), { onHand: new D(0), reserved: new D(0), available: new D(0), value: new D(0) });
  const units = new Set(products.map((p) => p.unit));
  return { lots: rows, products, locations: [...byLocation.values()], totals, mixedUnits: units.size > 1, unit: [...units][0] ?? "MT", reorder: products.filter((p) => p.reorderPoint && p.available.lt(p.reorderPoint)) };
}

export async function pipeline() {
  const [quotes, orders, shipments, pos] = await Promise.all([
    db.quote.findMany({ where: { status: { in: ["DRAFT", "PENDING_APPROVAL", "APPROVED"] } }, include: { lines: true, customer: true } }),
    db.salesOrder.findMany({ where: { status: { in: ["OPEN", "ALLOCATED", "PARTIALLY_SHIPPED"] } }, include: { lines: true, customer: true } }),
    db.shipment.findMany({ where: { status: { in: ["PLANNED", "IN_TRANSIT"] } }, include: { order: { include: { customer: true } } }, orderBy: { scheduledAt: "asc" } }),
    db.purchaseOrder.findMany({ where: { status: { in: ["ISSUED", "PARTIALLY_RECEIVED"] } }, include: { lines: true, supplier: true }, orderBy: { expectedAt: "asc" } }),
  ]);
  const qv = (ls: { quantity: unknown; unitPrice: unknown }[]) => ls.reduce((s, l) => s.plus(dec(l.quantity as string).times(dec(l.unitPrice as string))), new D(0));
  return {
    quotes, orders, shipments, pos,
    openQuoteValue: quotes.reduce((s, q) => s.plus(qv(q.lines)), new D(0)),
    pendingApproval: quotes.filter((q) => q.status === "PENDING_APPROVAL"),
    openOrderValue: orders.reduce((s, o) => s.plus(o.lines.reduce((x, l) => x.plus(dec(l.quantity).minus(dec(l.shippedQty)).times(dec(l.unitPrice))), new D(0))), new D(0)),
    poOutstandingValue: pos.reduce((s, p) => s.plus(p.lines.reduce((x, l) => x.plus(D.max(0, dec(l.quantity).minus(dec(l.receivedQty))).times(dec(l.unitCost))), new D(0))), new D(0)),
  };
}

/** Velocity, days of inventory and slow movers, from shipments in the trailing window. */
export async function inventoryIntelligence(days = 90) {
  const since = new Date(Date.now() - days * 864e5);
  const [snap, shipped, lastMove] = await Promise.all([
    inventorySnapshot(),
    db.inventoryMovement.groupBy({ by: ["productId"], where: { type: "SHIPMENT", at: { gte: since } }, _sum: { quantity: true, value: true } }),
    db.inventoryMovement.groupBy({ by: ["productId"], where: { type: { in: ["SHIPMENT", "RECEIPT"] } }, _max: { at: true } }),
  ]);
  const ship = new Map(shipped.map((s) => [s.productId, { qty: dec(s._sum.quantity).abs(), cogs: dec(s._sum.value).abs() }]));
  const last = new Map(lastMove.map((m) => [m.productId, m._max.at]));
  const rows = snap.products.map((p) => {
    const s = ship.get(p.id);
    const daily = s ? s.qty.div(days) : new D(0);
    const annualCogs = s ? s.cogs.times(365).div(days) : new D(0);
    return {
      ...p,
      shippedQty: s?.qty ?? new D(0),
      dailyVelocity: daily,
      daysOfInventory: daily.isZero() ? null : p.onHand.div(daily),
      turnover: p.value.isZero() ? null : annualCogs.div(p.value),
      lastMovement: last.get(p.id) ?? null,
      slowMoving: p.onHand.gt(0) && (!s || s.qty.isZero()),
      averageCost: p.onHand.isZero() ? null : p.value.div(p.onHand),
    };
  });
  return { rows, days, snap };
}

/** Lot aging buckets by receipt date. */
export async function inventoryAging() {
  const lots = await db.inventoryLot.findMany({ where: { onHand: { gt: 0 } }, include: { product: true } });
  const buckets = [{ label: "0–30 days", max: 30 }, { label: "31–90 days", max: 90 }, { label: "91–180 days", max: 180 }, { label: "Over 180 days", max: Infinity }].map((b) => ({ ...b, qty: new D(0), value: new D(0) }));
  for (const l of lots) {
    const age = (Date.now() - l.receivedAt.getTime()) / 864e5;
    const b = buckets.find((x) => age <= x.max)!;
    b.qty = b.qty.plus(dec(l.onHand));
    b.value = b.value.plus(dec(l.onHand).times(dec(l.unitCost)));
  }
  return buckets;
}

export type Insight = { tone: "pos" | "warn" | "crit" | "accent"; title: string; detail: string; href?: string; source: string };

/** Rule-based, explainable insights. Every statement cites the records and arithmetic behind it. */
export async function insights(p: Period): Promise<Insight[]> {
  const out: Insight[] = [];
  const [cur, prev, snap, pipe] = await Promise.all([financials(p), financials(previousPeriod(p)), inventorySnapshot(), pipeline()]);
  if (!cur.totals.revenue.isZero() && !prev.totals.revenue.isZero()) {
    const ch = cur.totals.revenue.minus(prev.totals.revenue).div(prev.totals.revenue);
    if (ch.abs().gte(0.1))
      out.push({ tone: ch.gt(0) ? "pos" : "warn", title: `Revenue ${ch.gt(0) ? "up" : "down"} ${ch.abs().times(100).toFixed(1)}% vs prior period`, detail: `$${money(cur.totals.revenue).toNumber().toLocaleString()} vs $${money(prev.totals.revenue).toNumber().toLocaleString()} in the equal-length prior period.`, href: "/analytics", source: `${cur.facts.length} vs ${prev.facts.length} posted shipment lines` });
    const mc = margin(cur.totals), mp = margin(prev.totals);
    if (mc && mp && mc.minus(mp).abs().gte(0.02))
      out.push({ tone: mc.gt(mp) ? "pos" : "warn", title: `Gross margin ${mc.gt(mp) ? "improved" : "declined"} ${mc.minus(mp).abs().times(100).toFixed(1)} pts`, detail: `${mc.times(100).toFixed(1)}% this period vs ${mp.times(100).toFixed(1)}% prior (after direct freight).`, href: "/analytics", source: "Revenue, COGS and freight on posted shipments" });
  }
  if (cur.lowMargin.length) {
    const orders = new Set(cur.lowMargin.map((f) => f.orderNumber));
    out.push({ tone: "warn", title: `${cur.lowMargin.length} shipment line(s) below minimum margin`, detail: `Orders ${[...orders].slice(0, 4).join(", ")}${orders.size > 4 ? "…" : ""} shipped below the product's configured minimum margin (before freight).`, href: "/analytics?tab=orders", source: "Order line price vs actual lot cost" });
  }
  for (const r of snap.reorder.slice(0, 3))
    out.push({ tone: "crit", title: `${r.name} below reorder point`, detail: `${r.available.toDecimalPlaces(2)} ${r.unit} available vs reorder point ${r.reorderPoint!.toDecimalPlaces(2)} ${r.unit}.`, href: "/inventory", source: "Inventory lots and product reorder point" });
  if (pipe.pendingApproval.length) out.push({ tone: "accent", title: `${pipe.pendingApproval.length} quote(s) awaiting approval`, detail: pipe.pendingApproval.map((q) => q.number).slice(0, 4).join(", "), href: "/sales?status=PENDING_APPROVAL", source: "Quotes" });
  const overdue = pipe.pos.filter((x) => x.expectedAt && x.expectedAt < new Date());
  if (overdue.length) out.push({ tone: "warn", title: `${overdue.length} purchase order(s) past expected delivery`, detail: overdue.map((x) => `${x.number} (${x.supplier.name})`).slice(0, 3).join(", "), href: "/purchasing", source: "Purchase orders" });
  // Cost increases: latest receipt cost vs the product's prior average receipt cost.
  const recent = await db.inventoryMovement.findMany({ where: { type: "RECEIPT", at: { gte: p.from, lte: p.to } }, include: { product: true }, orderBy: { at: "desc" } });
  const seen = new Set<string>();
  for (const r of recent) {
    if (seen.has(r.productId)) continue;
    seen.add(r.productId);
    const prior = await db.inventoryMovement.aggregate({ where: { type: "RECEIPT", productId: r.productId, at: { lt: r.at } }, _sum: { quantity: true, value: true } });
    const pq = dec(prior._sum.quantity);
    if (pq.lte(0)) continue;
    const avg = dec(prior._sum.value).div(pq);
    if (avg.isZero()) continue;
    const ch = dec(r.unitCost).minus(avg).div(avg);
    if (ch.gte(0.1)) out.push({ tone: "warn", title: `${r.product.name} cost up ${ch.times(100).toFixed(1)}%`, detail: `Latest receipt at $${dec(r.unitCost).toFixed(2)}/${r.product.unitCode} vs prior average $${avg.toFixed(2)}. Review pricing.`, href: `/pricing?product=${r.productId}`, source: "Inventory receipts" });
  }
  return out;
}

/** Ledger value of inventory as of a date (sum of signed movement values). */
export async function inventoryValueAt(at: Date) {
  const r = await db.inventoryMovement.aggregate({ where: { at: { lte: at } }, _sum: { value: true, quantity: true } });
  return { value: dec(r._sum.value), quantity: dec(r._sum.quantity) };
}
