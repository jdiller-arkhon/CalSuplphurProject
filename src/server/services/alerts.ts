import { dec } from "@/lib/decimal";
import { db } from "../db";
import { getSettingTyped } from "./settings";
import { inventorySnapshot } from "./metrics";
import { reconcileLots } from "./inventory";

let lastRun = 0;

/**
 * Derive in-app notifications from current data. Each alert has a dedupe key, so a condition
 * notifies once; it is not re-created until the condition clears and recurs.
 * Runs at most every 5 minutes per server instance.
 */
export async function refreshAlerts(force = false) {
  if (!force && Date.now() - lastRun < 5 * 60_000) return;
  lastRun = Date.now();
  const t = await getSettingTyped("alerts.thresholds");
  const active = new Map<string, { kind: string; severity: string; title: string; body?: string; href?: string }>();
  const now = new Date();

  const snap = await inventorySnapshot();
  for (const r of snap.reorder) active.set(`low:${r.id}`, { kind: "low_inventory", severity: "critical", title: `Low inventory: ${r.name}`, body: `${r.available.toDecimalPlaces(2)} ${r.unit} available (reorder point ${r.reorderPoint!.toDecimalPlaces(2)}).`, href: "/inventory" });

  for (const d of await reconcileLots(db as never)) active.set(`disc:${d.id}`, { kind: "discrepancy", severity: "critical", title: "Inventory discrepancy detected", body: `A lot balance (${d.onHand}) differs from its ledger total (${d.ledger}).`, href: "/inventory" });

  const pending = await db.quote.findMany({ where: { status: "PENDING_APPROVAL" } });
  for (const q of pending) active.set(`approve:${q.id}`, { kind: "approval", severity: "warning", title: `Quote ${q.number} needs approval`, body: "Priced below the minimum margin policy.", href: `/sales/quotes/${q.id}` });

  const soon = new Date(now.getTime() + Number(t.quoteExpiryDays) * 864e5);
  for (const q of await db.quote.findMany({ where: { status: { in: ["APPROVED", "DRAFT"] }, validUntil: { gte: now, lte: soon } } }))
    active.set(`expiring:${q.id}`, { kind: "quote_expiring", severity: "info", title: `Quote ${q.number} expires ${q.validUntil.toLocaleDateString("en-US")}`, href: `/sales/quotes/${q.id}` });

  const late = new Date(now.getTime() - Number(t.overdueShipmentDays) * 864e5);
  for (const s of await db.shipment.findMany({ where: { status: "PLANNED", scheduledAt: { lt: late } } }))
    active.set(`ship:${s.id}`, { kind: "overdue_shipment", severity: "warning", title: `Shipment ${s.number} is overdue`, body: `Scheduled ${s.scheduledAt!.toLocaleDateString("en-US")} but not dispatched.`, href: `/logistics/${s.id}` });

  for (const p of await db.purchaseOrder.findMany({ where: { status: { in: ["ISSUED", "PARTIALLY_RECEIVED"] }, expectedAt: { lt: now } }, include: { supplier: true } }))
    active.set(`po:${p.id}`, { kind: "po_receipt", severity: "warning", title: `${p.number} awaiting receipt`, body: `Expected from ${p.supplier.name} on ${p.expectedAt!.toLocaleDateString("en-US")}.`, href: `/purchasing/${p.id}` });

  const min = dec(await getSettingTyped("pricing.defaultMinMarginPct"));
  for (const q of await db.quote.findMany({ where: { status: { in: ["DRAFT", "APPROVED"] }, belowMinMargin: true } }))
    active.set(`margin:${q.id}`, { kind: "low_margin", severity: "warning", title: `Quote ${q.number} is below minimum margin`, body: `Policy floor ${min.times(100).toFixed(1)}% unless overridden per product.`, href: `/sales/quotes/${q.id}` });

  const sdsCat = await db.product.findMany({ where: { active: true, documents: { none: { category: "SDS", archived: false } } } });
  for (const p of sdsCat) active.set(`sds:${p.id}`, { kind: "missing_document", severity: "info", title: `No Safety Data Sheet on file for ${p.name}`, href: `/products/${p.id}` });

  const existing = await db.notification.findMany({ where: { dedupeKey: { not: null } } });
  const existingKeys = new Set(existing.map((n) => n.dedupeKey!));
  // Clear resolved conditions (only if unread — read history is kept).
  const resolved = existing.filter((n) => !active.has(n.dedupeKey!)).map((n) => n.id);
  if (resolved.length) await db.notification.deleteMany({ where: { id: { in: resolved }, readAt: null } });
  await db.notification.updateMany({ where: { id: { in: resolved }, readAt: { not: null } }, data: { dedupeKey: null } });
  const create = [...active.entries()].filter(([k]) => !existingKeys.has(k));
  if (create.length) await db.notification.createMany({ data: create.map(([k, v]) => ({ dedupeKey: k, ...v })), skipDuplicates: true });
}
