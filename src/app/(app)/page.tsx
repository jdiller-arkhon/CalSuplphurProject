import Link from "next/link";
import { Boxes, DollarSign, PackageCheck, Lock, TrendingUp, Percent, FileText, ClipboardList, Truck, ShoppingCart, AlertTriangle, Sparkles, ArrowRight, Rocket } from "lucide-react";
import { requireUser, can } from "@/server/auth";
import { db } from "@/server/db";
import { financials, insights, inventorySnapshot, parsePeriod, pipeline, gp, margin } from "@/server/services/metrics";
import { getSettingTyped } from "@/server/services/settings";
import { fmtMoney, fmtPct, fmtQty } from "@/lib/decimal";
import { Card, Kpi, PageHeader, Empty, LinkButton, Badge, StatusBadge, cx } from "@/components/ui";
import { PeriodPicker } from "@/components/period";
import { RevenueTrend, HBar, StockBars } from "@/components/charts";

export const metadata = { title: "Overview" };

export default async function Overview({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const period = parsePeriod(sp);
  const fin = can(u, "finance.view");
  const val = can(u, "inventory.value");
  const [snap, pipe, f, ins, setupDone, productCount, recent, audits] = await Promise.all([
    inventorySnapshot(),
    pipeline(),
    fin ? financials(period) : null,
    fin ? insights(period) : Promise.resolve([]),
    getSettingTyped("setup.completed"),
    db.product.count(),
    db.inventoryMovement.findMany({ take: 8, orderBy: { at: "desc" }, include: { product: true, lot: { include: { location: true } } } }),
    can(u, "audit.view") ? db.auditEvent.findMany({ take: 6, orderBy: { at: "desc" }, include: { user: true } }) : [],
  ]);
  const unit = snap.unit;
  const attention = snap.reorder.length + pipe.pendingApproval.length;
  const trend = f?.months.map((m) => ({ label: new Date(`${m.key}-01T00:00:00`).toLocaleDateString("en-US", { month: "short" }), revenue: m.revenue.toNumber(), profit: gp(m).toNumber(), margin: margin(m) ? margin(m)!.times(100).toNumber() : null })) ?? [];

  return (
    <>
      <PageHeader
        title={`Good ${greeting()}, ${u.name.split(" ")[0]}`}
        description={fin ? `${period.label} · revenue recognized on dispatch · gross profit after direct freight` : "Operational overview"}
        actions={fin ? <PeriodPicker current={period.key} /> : undefined}
      />

      {!setupDone && u.role === "OWNER" && (
        <div className="card rise mb-6 flex flex-wrap items-center gap-4 border-gold/40 bg-gold-soft/40 p-4">
          <Rocket className="text-gold" size={20} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Finish setting up CSC Command</div>
            <div className="text-sm text-fg-2">Company profile, products, locations, beginning inventory, costs, customers and users — about 15 minutes.</div>
          </div>
          <LinkButton href="/setup" variant="gold">Continue setup <ArrowRight size={14} /></LinkButton>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Inventory on hand" icon={Boxes} href="/inventory" value={snap.mixedUnits ? fmtQty(snap.totals.onHand) : `${fmtQty(snap.totals.onHand)} ${unit}`} sub={snap.mixedUnits ? "Mixed units — see Inventory" : `${snap.lots.length} active lots`} />
        <Kpi label="Available" icon={PackageCheck} href="/inventory" value={fmtQty(snap.totals.available)} sub={`${unit} unreserved`} />
        <Kpi label="Committed" icon={Lock} href="/inventory?view=reservations" value={fmtQty(snap.totals.reserved)} sub={`${unit} reserved to orders`} />
        {val && <Kpi label="Inventory valuation" icon={DollarSign} href="/analytics?tab=inventory" value={fmtMoney(snap.totals.value, "USD", 0)} sub="Lot cost basis" />}
        {f && <Kpi label="Revenue" icon={TrendingUp} href="/analytics" value={fmtMoney(f.totals.revenue, "USD", 0)} sub={`${fmtQty(f.totals.quantity)} ${unit} shipped`} />}
        {f && <Kpi label="Gross profit" icon={DollarSign} href="/analytics" value={fmtMoney(gp(f.totals), "USD", 0)} tone={gp(f.totals).lt(0) ? "crit" : undefined} sub="After COGS & direct freight" />}
        {f && <Kpi label="Gross margin" icon={Percent} href="/analytics" value={fmtPct(margin(f.totals))} sub="On recognized revenue" />}
        <Kpi label="Open quotes" icon={FileText} href="/sales?tab=quotes" value={pipe.quotes.length} sub={fin ? fmtMoney(pipe.openQuoteValue, "USD", 0) : undefined} />
        <Kpi label="Open sales orders" icon={ClipboardList} href="/sales?tab=orders" value={pipe.orders.length} sub={fin ? `${fmtMoney(pipe.openOrderValue, "USD", 0)} unshipped` : undefined} />
        <Kpi label="Pending shipments" icon={Truck} href="/logistics" value={pipe.shipments.length} sub={`${pipe.shipments.filter((s) => s.status === "IN_TRANSIT").length} in transit`} />
        <Kpi label="Outstanding POs" icon={ShoppingCart} href="/purchasing" value={pipe.pos.length} sub={val ? fmtMoney(pipe.poOutstandingValue, "USD", 0) : undefined} />
        <Kpi label="Needs attention" icon={AlertTriangle} href="/notifications" value={attention} tone={attention ? "warn" : "pos"} sub={attention ? "Reorders & approvals" : "All clear"} />
      </div>

      {productCount === 0 ? (
        <Card className="mt-6">
          <Empty icon={Boxes} title="No business data yet" action={<LinkButton href="/setup">Start guided setup</LinkButton>}>
            Charts and KPIs populate from real records as you add products, receive inventory and ship orders. CSC Command never displays sample figures.
          </Empty>
        </Card>
      ) : (
        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          {f && (
            <Card className="xl:col-span-2" title="Financial performance" action={<Link href="/analytics" className="text-xs font-medium text-accent">Analytics →</Link>}>
              {f.facts.length ? <RevenueTrend data={trend} /> : <Empty icon={TrendingUp} title="No shipments in this period">Revenue is recognized when sales-order product is dispatched. Try a wider date range.</Empty>}
            </Card>
          )}
          {f && (
            <Card title="Executive insights" action={<Sparkles size={14} className="text-gold" />}>
              {ins.length ? (
                <ul className="space-y-3">
                  {ins.slice(0, 6).map((i, k) => (
                    <li key={k}>
                      <Link href={i.href ?? "#"} className="group block rounded-lg border border-line p-3 hover:border-line-strong">
                        <div className="flex items-start gap-2">
                          <span className={cx("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", { pos: "bg-pos", warn: "bg-warn", crit: "bg-crit", accent: "bg-accent" }[i.tone])} />
                          <div className="min-w-0">
                            <div className="text-[13px] font-medium text-fg">{i.title}</div>
                            <div className="mt-0.5 text-xs text-fg-2">{i.detail}</div>
                            <div className="mt-1 text-[10.5px] uppercase tracking-wide text-fg-3">Source: {i.source}</div>
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-fg-2">No significant changes, cost increases, margin exceptions or stock warnings for this period.</p>
              )}
            </Card>
          )}
          <Card title="Stock by product" action={<Badge>{unit}</Badge>}>
            {snap.products.length ? <StockBars data={snap.products.slice(0, 8).map((p) => ({ label: p.name, available: p.available.toNumber(), reserved: p.reserved.toNumber(), href: `/products/${p.id}` }))} /> : <p className="text-sm text-fg-2">No stock on hand.</p>}
            {snap.reorder.length > 0 && (
              <div className="mt-3 rounded-lg bg-crit-soft px-3 py-2 text-xs text-crit">
                Below reorder point: {snap.reorder.map((r) => r.name).join(", ")}
              </div>
            )}
          </Card>
          <Card title="Stock by location">
            {snap.locations.length ? (
              <ul className="space-y-3">
                {snap.locations.map((l) => {
                  const pct = l.capacity && !l.capacity.isZero() ? Math.min(100, l.onHand.div(l.capacity).times(100).toNumber()) : null;
                  return (
                    <li key={l.id}>
                      <div className="flex justify-between text-sm">
                        <Link href={`/inventory?location=${l.id}`} className="font-medium hover:text-accent">{l.name}</Link>
                        <span className="num text-fg-2">{fmtQty(l.onHand)} {unit}{pct !== null && ` · ${pct.toFixed(0)}%`}</span>
                      </div>
                      {pct !== null && (
                        <div className="mt-1.5 h-1.5 rounded-full bg-surface-2">
                          <div className={cx("h-1.5 rounded-full", pct > 90 ? "bg-crit" : pct > 75 ? "bg-warn" : "bg-accent")} style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-fg-2">No stock on hand.</p>
            )}
          </Card>
          {f && (
            <Card title="Profit by customer">
              {f.byCustomer.length ? <HBar color="gold" data={f.byCustomer.slice(0, 6).map((c) => ({ label: c.label, value: gp(c).toNumber(), href: `/customers/${c.key}` }))} /> : <p className="text-sm text-fg-2">No shipped sales in this period.</p>}
            </Card>
          )}
          <Card title="Upcoming deliveries" action={<Link href="/logistics" className="text-xs font-medium text-accent">Logistics →</Link>} pad={false}>
            {pipe.shipments.length ? (
              <ul className="divide-y divide-line">
                {pipe.shipments.slice(0, 6).map((s) => (
                  <li key={s.id}>
                    <Link href={`/logistics/${s.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-surface-2">
                      <span className="num text-[13px] font-medium">{s.number}</span>
                      <span className="truncate text-xs text-fg-2">{s.order?.customer.name ?? s.destination ?? s.mode}</span>
                      <span className="ml-auto text-xs text-fg-3">{s.scheduledAt?.toLocaleDateString("en-US", { month: "short", day: "numeric" }) ?? "Unscheduled"}</span>
                      <StatusBadge status={s.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-5 text-sm text-fg-2">No planned or in-transit shipments.</p>
            )}
          </Card>
          <Card title="Recent inventory movements" action={<Link href="/inventory?view=ledger" className="text-xs font-medium text-accent">Ledger →</Link>} pad={false}>
            {recent.length ? (
              <ul className="divide-y divide-line">
                {recent.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 px-5 py-2.5 text-[13px]">
                    <Badge tone={Number(m.quantity) >= 0 ? "pos" : "warn"}>{m.type.replace("_", " ").toLowerCase()}</Badge>
                    <span className="truncate">{m.product.name}</span>
                    <span className="truncate text-xs text-fg-3">{m.lot.location.code}/{m.lot.lotNumber}</span>
                    <span className="num ml-auto font-medium">{Number(m.quantity) > 0 ? "+" : ""}{fmtQty(m.quantity)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-5 text-sm text-fg-2">No movements yet.</p>
            )}
          </Card>
          {audits.length > 0 && (
            <Card title="Recent changes" action={<Link href="/settings/audit" className="text-xs font-medium text-accent">Audit log →</Link>} pad={false}>
              <ul className="divide-y divide-line">
                {audits.map((a) => (
                  <li key={a.id} className="px-5 py-2.5 text-[13px]">
                    <div className="truncate">{a.summary}</div>
                    <div className="text-xs text-fg-3">{a.user?.name ?? "System"} · {a.at.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
}
