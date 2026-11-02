import Link from "next/link";
import { Boxes, TrendingUp, FileText, ClipboardList, Truck, ShoppingCart, AlertTriangle, Sparkles, ArrowRight, Rocket } from "lucide-react";
import { requireUser, can } from "@/server/auth";
import { db } from "@/server/db";
import { financials, insights, inventorySnapshot, parsePeriod, pipeline, gp, margin } from "@/server/services/metrics";
import { getSettingTyped } from "@/server/services/settings";
import { fmtMoney, fmtPct, fmtQty } from "@/lib/decimal";
import { Card, Kpi, PageHeader, Empty, LinkButton, Badge, StatusBadge, cx } from "@/components/ui";
import { PeriodPicker } from "@/components/period";
import { CountUp } from "@/components/count-up";
import { RevenueTrend, HBar, StockBars } from "@/components/charts";
import { enabledModules } from "@/server/modules";
import { receivables } from "@/server/services/invoicing";
import { Receipt } from "lucide-react";

export const metadata = { title: "Overview" };

export default async function Overview({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const period = parsePeriod(sp);
  const on = await enabledModules();
  const has = (m: string) => on.includes(m as never);
  const salesOn = has("sales"), invOn = has("invoicing") && can(u, "invoices.view");
  const fin = can(u, "finance.view") && salesOn;
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
  const [ar, invoiced] = invOn ? await Promise.all([receivables(), db.invoice.aggregate({ where: { status: { notIn: ["DRAFT", "VOID"] }, issueDate: { gte: period.from, lte: period.to } }, _sum: { total: true }, _count: true })]) : [null, null];
  const unit = snap.unit;
  const attention = snap.reorder.length + pipe.pendingApproval.length;
  const trend = f?.months.map((m) => ({ label: new Date(`${m.key}-01T00:00:00`).toLocaleDateString("en-US", { month: "short" }), revenue: m.revenue.toNumber(), profit: gp(m).toNumber(), margin: margin(m) ? margin(m)!.times(100).toNumber() : null })) ?? [];

  return (
    <>
      <section className="hero rise mb-5 p-6 md:p-8">
        <div className="relative z-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold">California Sulphur Company · Command Center</div>
            <h1 className="mt-2 text-[30px] font-semibold tracking-tight md:text-[34px]">Good {greeting()}, <span className="gold-text">{u.name.split(" ")[0]}</span></h1>
            <p className="mt-1 text-sm text-white/60">{fin ? `${period.label} · revenue recognized on dispatch · gross profit after direct freight` : invOn ? `${period.label} · inventory, pricing and invoicing` : "Operational overview"}</p>
          </div>
          {(fin || invOn) && <div data-theme="dark" className="rounded-xl bg-white/5 p-1 text-fg ring-1 ring-white/10 backdrop-blur"><PeriodPicker current={period.key} /></div>}
        </div>
        <div className="stagger relative z-10 mt-7 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {f ? (
            <>
          <Link href="/analytics" className="glass-tile block p-5">
            <div className="text-[12px] font-medium uppercase tracking-[0.12em] text-white/60">Revenue</div>
            <div className="mt-2 text-[30px] font-semibold leading-none tracking-tight"><CountUp value={f.totals.revenue.toNumber()} format="usd" /></div>
            <div className="mt-2 text-xs text-white/55">{fmtQty(f.totals.quantity)} {unit} shipped</div>
          </Link>
          <Link href="/analytics" className="glass-tile block p-5">
            <div className="text-[12px] font-medium uppercase tracking-[0.12em] text-white/60">Gross profit</div>
            <div className="mt-2 text-[30px] font-semibold leading-none tracking-tight gold-text"><CountUp value={gp(f.totals).toNumber()} format="usd" /></div>
            <div className="mt-2 text-xs text-white/55"><span className="text-gold">{fmtPct(margin(f.totals))}</span> margin after freight</div>
          </Link>
            </>
          ) : ar && invoiced ? (
            <>
          <Link href="/invoices?tab=all" className="glass-tile block p-5">
            <div className="text-[12px] font-medium uppercase tracking-[0.12em] text-white/60">Invoiced</div>
            <div className="mt-2 text-[30px] font-semibold leading-none tracking-tight"><CountUp value={Number(invoiced._sum.total ?? 0)} format="usd" /></div>
            <div className="mt-2 text-xs text-white/55">{invoiced._count} invoice{invoiced._count === 1 ? "" : "s"} · {period.label}</div>
          </Link>
          <Link href="/invoices" className="glass-tile block p-5">
            <div className="text-[12px] font-medium uppercase tracking-[0.12em] text-white/60">Owed to us</div>
            <div className="mt-2 text-[30px] font-semibold leading-none tracking-tight gold-text"><CountUp value={ar.total.toNumber()} format="usd" /></div>
            <div className={cx("mt-2 text-xs", ar.overdue.gt(0) ? "text-[#f3b0b0]" : "text-white/55")}>{ar.overdue.gt(0) ? `${fmtMoney(ar.overdue)} overdue` : "Nothing overdue"}</div>
          </Link>
            </>
          ) : (
            <>
          <Link href="/sales?tab=orders" className="glass-tile block p-5">
            <div className="text-[12px] font-medium uppercase tracking-[0.12em] text-white/60">Open sales orders</div>
            <div className="mt-2 text-[30px] font-semibold leading-none tracking-tight">{pipe.orders.length}</div>
            <div className="mt-2 text-xs text-white/55">Awaiting fulfilment</div>
          </Link>
          <Link href="/logistics" className="glass-tile block p-5">
            <div className="text-[12px] font-medium uppercase tracking-[0.12em] text-white/60">Pending shipments</div>
            <div className="mt-2 text-[30px] font-semibold leading-none tracking-tight">{pipe.shipments.length}</div>
            <div className="mt-2 text-xs text-white/55">Planned or in transit</div>
          </Link>
            </>
          )}
          <Link href="/inventory" className="glass-tile block p-5">
            <div className="text-[12px] font-medium uppercase tracking-[0.12em] text-white/60">Inventory on hand</div>
            <div className="mt-2 text-[30px] font-semibold leading-none tracking-tight"><CountUp value={snap.totals.onHand.toNumber()} format="num" /> <span className="text-lg font-medium text-white/60">{unit}</span></div>
            <div className="mt-2 text-xs text-white/55">{fmtQty(snap.totals.available)} available · {fmtQty(snap.totals.reserved)} committed</div>
          </Link>
          {val ? (
          <Link href="/analytics?tab=inventory" className="glass-tile block p-5">
            <div className="text-[12px] font-medium uppercase tracking-[0.12em] text-white/60">Inventory value</div>
            <div className="mt-2 text-[30px] font-semibold leading-none tracking-tight"><CountUp value={snap.totals.value.toNumber()} format="usd" /></div>
            <div className="mt-2 text-xs text-white/55">{snap.lots.length} active lots</div>
          </Link>
          ) : (
          <Link href="/inventory" className="glass-tile block p-5">
            <div className="text-[12px] font-medium uppercase tracking-[0.12em] text-white/60">Active lots</div>
            <div className="mt-2 text-[30px] font-semibold leading-none tracking-tight">{snap.lots.length}</div>
            <div className="mt-2 text-xs text-white/55">Across all locations</div>
          </Link>
          )}
        </div>
      </section>
      {!setupDone && u.role === "OWNER" && (
        <div className="card rise mt-5 flex flex-wrap items-center gap-4 border-gold/40 bg-gold-soft/40 p-4">
          <Rocket className="text-gold" size={20} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Finish setting up CSC Command</div>
            <div className="text-sm text-fg-2">Company profile, products, locations, beginning inventory, costs, customers and users — about 15 minutes.</div>
          </div>
          <LinkButton href="/setup" variant="gold">Continue setup <ArrowRight size={14} /></LinkButton>
        </div>
      )}

      <div className="card rise mt-5 grid grid-cols-2 divide-line sm:grid-cols-3 lg:auto-cols-fr lg:grid-flow-col lg:grid-cols-none lg:divide-x">
        {([
          ...(salesOn ? [["Open quotes", pipe.quotes.length, "/sales?tab=quotes", FileText], ["Sales orders", pipe.orders.length, "/sales?tab=orders", ClipboardList]] : []),
          ...(ar ? [["Unpaid invoices", ar.rows.length, "/invoices", Receipt], ["Overdue invoices", ar.rows.filter((r) => r.daysLate > 0).length, "/invoices?tab=overdue", AlertTriangle]] : []),
          ...(has("logistics") ? [["Shipments", pipe.shipments.length, "/logistics", Truck]] : []),
          ...(has("purchasing") ? [["Purchase orders", pipe.pos.length, "/purchasing", ShoppingCart]] : []),
          ["Needs attention", attention, "/notifications", AlertTriangle],
        ] as [string, number, string, typeof FileText][]).map(([label, n, href, Icon]) => {
          const I = Icon as typeof FileText;
          const warn = (label === "Needs attention" || label === "Overdue invoices") && Number(n) > 0;
          return (
            <Link key={label as string} href={href as string} className="group flex items-center gap-3 px-5 py-4 hover:bg-surface-2/60">
              <I size={16} className={warn ? "text-warn" : "text-fg-3 group-hover:text-accent"} aria-hidden />
              <span className="text-[13px] text-fg-2">{label as string}</span>
              <span className={cx("num ml-auto text-[15px] font-semibold", warn ? "text-warn" : "text-fg")}>{n as number}</span>
            </Link>
          );
        })}
      </div>

      {productCount === 0 ? (
        <Card className="mt-6">
          <Empty icon={Boxes} title="No business data yet" action={<LinkButton href="/setup">Start guided setup</LinkButton>}>
            Charts and KPIs populate from real records as you add products, receive inventory and ship orders. CSC Command never displays sample figures.
          </Empty>
        </Card>
      ) : (
        <div className="mt-8 grid gap-6 xl:grid-cols-3">
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
          {ar && (
            <Card title="Unpaid invoices" action={<Link href="/invoices" className="text-xs font-medium text-accent">Invoices →</Link>} pad={false}>
              {ar.rows.length ? (
                <ul className="divide-y divide-line">
                  {ar.rows.slice(0, 6).map((r) => (
                    <li key={r.invoice.id}>
                      <Link href={`/invoices/${r.invoice.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-surface-2">
                        <span className="num whitespace-nowrap text-[13px] font-medium">{r.invoice.number}</span>
                        <span className="truncate text-xs text-fg-2">{r.invoice.customer.name}</span>
                        <span className={cx("ml-auto whitespace-nowrap text-xs", r.daysLate > 0 ? "font-medium text-crit" : "text-fg-3")}>{r.daysLate > 0 ? `${r.daysLate}d late` : `due ${r.invoice.dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`}</span>
                        <span className="num w-24 text-right text-[13px] font-semibold">{fmtMoney(r.balance)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : <p className="p-5 text-sm text-fg-2">Nothing owed right now.</p>}
            </Card>
          )}
          {has("logistics") && <Card title="Upcoming deliveries" action={<Link href="/logistics" className="text-xs font-medium text-accent">Logistics →</Link>} pad={false}>
            {pipe.shipments.length ? (
              <ul className="divide-y divide-line">
                {pipe.shipments.slice(0, 6).map((s) => (
                  <li key={s.id}>
                    <Link href={`/logistics/${s.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-surface-2">
                      <span className="num whitespace-nowrap text-[13px] font-medium">{s.number}</span>
                      <span className="truncate text-xs text-fg-2">{s.order?.customer.name ?? s.destination ?? s.mode}</span>
                      <span className="ml-auto whitespace-nowrap text-xs text-fg-3">{s.scheduledAt?.toLocaleDateString("en-US", { month: "short", day: "numeric" }) ?? "Unscheduled"}</span>
                      <StatusBadge status={s.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-5 text-sm text-fg-2">No planned or in-transit shipments.</p>
            )}
          </Card>}
          <Card title="Recent inventory movements" action={<Link href="/inventory?view=ledger" className="text-xs font-medium text-accent">Ledger →</Link>} pad={false}>
            {recent.length ? (
              <ul className="divide-y divide-line">
                {recent.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 px-5 py-2.5 text-[13px]">
                    <Badge tone={Number(m.quantity) >= 0 ? "pos" : "warn"}>{m.type.replace("_", " ").toLowerCase()}</Badge>
                    <span className="min-w-0 flex-1 leading-tight"><span className="block truncate">{m.product.name}</span><span className="block truncate text-xs text-fg-3">{m.lot.location.code} / {m.lot.lotNumber}</span></span>
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
