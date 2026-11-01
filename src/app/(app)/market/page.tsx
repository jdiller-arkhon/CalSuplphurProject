import Link from "next/link";
import { Plus, Trash2, TrendingUp, TrendingDown, Minus, Info, ShieldCheck, ShieldAlert, Calculator } from "lucide-react";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { lookups, today } from "@/server/lookups";
import { marketGuide } from "@/server/services/market";
import { convertUnitRate } from "@/lib/units";
import { dec, fmtMoney, fmtPct, type Dec } from "@/lib/decimal";
import { PageHeader, Card, Table, Badge, Empty, LinkButton, humanize, cx } from "@/components/ui";
import { FormModal, ActionButton } from "@/components/form-modal";
import { MarketChart } from "@/components/charts";
import { saveMarketRate, deleteMarketRate } from "@/server/actions/market";
import { RangeBar } from "./range-bar";

export const metadata = { title: "Market rates" };
const SOURCES = [["PUBLISHED_INDEX", "Published index / trade press"], ["COMPETITOR_QUOTE", "Competitor quote"], ["CUSTOMER_FEEDBACK", "Customer feedback"], ["BROKER", "Broker"], ["LOST_DEAL", "Lost deal (winning price)"], ["OTHER", "Other"]] as const;
const BASES = ["FOB", "FCA", "EXW", "CFR", "CIF", "DAP", "DELIVERED"];
const CONF = { high: { tone: "pos", icon: ShieldCheck, text: "High confidence — 5+ market prices, newest within 30 days" }, medium: { tone: "accent", icon: ShieldCheck, text: "Medium confidence — a few recent market prices" }, low: { tone: "warn", icon: ShieldAlert, text: "Low confidence — few or old prices; record more" }, none: { tone: "neutral", icon: ShieldAlert, text: "No data yet" } } as const;

export default async function MarketPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("pricing.use");
  const sp = await searchParams;
  const l = await lookups();
  const massUnits = l.units.filter((u) => u.dimension === "mass");
  const priceUnits = massUnits.filter((u) => Number(u.toKg) >= 0.4).sort((a, b) => Number(b.toKg) - Number(a.toKg));
  const productId = l.products.some((p) => p.id === sp.product) ? sp.product : l.products[0]?.id;
  const days = [90, 180, 365].includes(Number(sp.days)) ? Number(sp.days) : 180;
  const basis = BASES.includes(sp.basis) ? sp.basis : undefined;
  const [guide, rates, summaries] = await Promise.all([
    productId ? marketGuide(productId, { days, basis }) : null,
    db.marketRate.findMany({ where: productId ? { OR: [{ productId }, { productId: null }] } : {}, orderBy: { observedAt: "desc" }, take: 200, include: { product: true } }),
    Promise.all(l.products.map((p) => marketGuide(p.id, { days }))),
  ]);
  const basesUsed = [...new Set(rates.filter((r) => r.productId === productId).map((r) => r.basis))].sort();
  const baseUnit = guide?.product.unit ?? "MT";
  const unit = massUnits.some((u) => u.code === sp.unit) ? sp.unit : baseUnit;
  const cv = (v: Dec) => convertUnitRate(v, baseUnit, unit, l.units);
  const money = (v: Dec) => fmtMoney(cv(v), "USD", 2);
  const q = (o: Record<string, string>) => `?${new URLSearchParams({ ...(productId ? { product: productId } : {}), unit, days: String(days), ...(basis ? { basis } : {}), ...o })}`.replace(/&?basis=(&|$)/, "$1");
  const conf = CONF[guide?.confidence ?? "none"];
  const ConfIcon = conf.icon;

  const addBtn = (
    <FormModal title="Record a market price" trigger={<><Plus size={14} /> Record market price</>} triggerVariant="gold" triggerSize="md" wide action={saveMarketRate} submit="Save price"
      intro="Log any price you hear about — an index you subscribe to, a competitor's quote, what a customer says they can buy at, a deal you lost. Enter it in whatever unit it was quoted in; it's converted for comparison."
      fields={[
        { name: "productId", label: "Product", type: "select", options: l.productOpts, defaultValue: productId, placeholder: "Not one of ours (describe grade below)" },
        { name: "grade", label: "Grade / description (optional)", placeholder: "e.g. Granular 99.5%, molten, prilled" },
        { name: "price", label: "Price", type: "number", step: "any", required: true },
        { name: "unitCode", label: "Per", type: "select", required: true, options: massUnits.map((u) => ({ value: u.code, label: `${u.name} (${u.code})` })), defaultValue: baseUnit },
        { name: "currency", label: "Currency", defaultValue: "USD", hint: "Non-USD prices are stored but left out of the guide (no exchange rates)." },
        { name: "basis", label: "Price basis", type: "select", required: true, options: BASES.map((b) => ({ value: b, label: b })), defaultValue: "FOB" },
        { name: "sourceType", label: "Type of source", type: "select", required: true, options: SOURCES.map(([v, label]) => ({ value: v, label })), defaultValue: "COMPETITOR_QUOTE" },
        { name: "source", label: "Source", required: true, placeholder: "e.g. Customer A buyer, broker name, publication + date" },
        { name: "region", label: "Region / port (optional)", placeholder: "e.g. US Gulf, LA/Long Beach, Central Valley delivered" },
        { name: "observedAt", label: "Date of the price", type: "date", required: true, defaultValue: today() },
        { name: "validUntil", label: "Valid until (optional)", type: "date" },
        { name: "note", label: "Notes (optional)", type: "textarea", span: 2 },
      ]} />
  );

  return (
    <>
      <PageHeader title="Market rates" description="What the market is paying, from the prices you record, compared with your own recent sales and costs, so you know what to charge." actions={<>{addBtn}<LinkButton href={productId ? `/pricing?product=${productId}` : "/pricing"} variant="secondary"><Calculator size={14} /> Price a deal</LinkButton></>} />

      {!l.products.length ? <Card><Empty title="Add products first">Market rates are tracked per product.</Empty></Card> : (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-2 text-sm">
            {l.products.map((p) => <Link key={p.id} href={q({ product: p.id })} className={cx("rounded-full border px-3 py-1", p.id === productId ? "border-accent bg-accent-soft font-medium text-accent" : "border-line text-fg-2 hover:text-fg")}>{p.name}</Link>)}
          </div>

          {guide && (
            <div className="grid items-start gap-6 xl:grid-cols-3">
              <Card className="xl:col-span-2" title={<span className="flex items-center gap-2">What to charge <Badge tone={conf.tone}><ConfIcon size={11} /> {guide.confidence === "none" ? "No data" : `${humanize(guide.confidence)} confidence`}</Badge></span>}
>
                <div className="-mt-1 mb-5 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line pb-4 text-xs">
                  <span className="text-fg-3">Per</span>{priceUnits.map((u) => <Link key={u.code} href={q({ unit: u.code })} className={cx("rounded-md px-1.5 py-0.5", u.code === unit ? "bg-accent-soft font-semibold text-accent" : "text-fg-2 hover:text-fg")}>{u.code}</Link>)}
                  <span className="ml-2 text-fg-3">Last</span>{[90, 180, 365].map((d) => <Link key={d} href={q({ days: String(d) })} className={cx("rounded-md px-1.5 py-0.5", d === days ? "bg-accent-soft font-semibold text-accent" : "text-fg-2 hover:text-fg")}>{d}d</Link>)}
                  {basesUsed.length > 1 && <><span className="ml-2 text-fg-3">Basis</span>{["", ...basesUsed].map((b) => <Link key={b || "all"} href={q({ basis: b })} className={cx("rounded-md px-1.5 py-0.5", (basis ?? "") === b ? "bg-accent-soft font-semibold text-accent" : "text-fg-2 hover:text-fg")}>{b || "All"}</Link>)}</>}
                </div>
                {guide.suggested ? (
                  <>
                    <div className="grid gap-4 sm:grid-cols-3">
                      {([["Low end", guide.suggested.low, "Competitive / volume deals"], ["Market rate", guide.suggested.mid, "Typical price right now"], ["High end", guide.suggested.high, "Premium, urgent or small lots"]] as const).map(([label, v, hint], i) => (
                        <div key={label} className={cx("rounded-xl border p-4", i === 1 ? "border-gold/60 bg-gold-soft/40" : "border-line")}>
                          <div className="text-xs font-medium text-fg-3">{label}</div>
                          <div className={cx("num mt-1 text-[26px] font-semibold leading-none tracking-tight", i === 1 && "text-gold")}>{money(v)}</div>
                          <div className="mt-1 text-[11px] text-fg-3">per {unit} · {hint}</div>
                        </div>
                      ))}
                    </div>
                    <RangeBar low={cv(guide.suggested.low)} mid={cv(guide.suggested.mid)} high={cv(guide.suggested.high)} fmt={(v) => fmtMoney(v, "USD", 0)}
                      marks={[
                        ...(guide.floor ? [{ label: "Your floor", value: cv(guide.floor), tone: "crit" as const }] : []),
                        ...(guide.cost ? [{ label: "Your cost", value: cv(guide.cost), tone: "muted" as const }] : []),
                        ...(guide.sales && guide.suggested.source === "market" ? [{ label: "Your avg sale", value: cv(guide.sales.median), tone: "accent" as const }] : []),
                      ]} />
                    <ul className="space-y-1.5 text-sm text-fg-2">
                      <li>• Based on <b className="text-fg">{guide.suggested.source === "market" ? `${guide.market!.count} market price${guide.market!.count === 1 ? "" : "s"}` : `${guide.sales!.count} of your own sales (no market prices recorded yet)`}</b> from the last {days} days{basis ? ` (${basis} only)` : ""}; newer prices count more.</li>
                      {guide.trend && <li className="flex items-center gap-1">• Market is {guide.trend.gt(0.01) ? <><TrendingUp size={14} className="text-pos" /> up</> : guide.trend.lt(-0.01) ? <><TrendingDown size={14} className="text-warn" /> down</> : <><Minus size={14} /> flat</>} <b className="text-fg">{fmtPct(guide.trend.abs())}</b> over the last 60 days vs the 60 before.</li>}
                      {guide.floor && <li>• Quotes below <b className="text-fg">{money(guide.floor)}</b> miss your {fmtPct(guide.minMargin!)} minimum margin and need owner approval.{guide.floor.gt(guide.suggested.mid) && <span className="text-crit"> The market rate is below your floor — check costs before matching it.</span>}</li>}
                      {guide.sales && guide.suggested.source === "market" && <li>• Your recent sales average <b className="text-fg">{money(guide.sales.median)}</b>, {(() => { const d = guide.sales.median.minus(guide.suggested.mid).div(guide.suggested.mid); return d.abs().lt(0.01) ? "in line with the market" : <><b className={d.gt(0) ? "text-pos" : "text-warn"}>{fmtPct(d.abs())} {d.gt(0) ? "above" : "below"}</b> the market rate{d.lt(0) ? " — room to raise prices" : ""}</>; })()}.</li>}
                      {guide.ageDays !== null && guide.ageDays > 45 && <li className="text-warn">• Newest market price is {guide.ageDays} days old. Record a fresh one before relying on this.</li>}
                      {(guide.excluded.currency > 0 || guide.excluded.unit > 0) && <li className="text-fg-3">• Left out: {guide.excluded.currency > 0 && `${guide.excluded.currency} non-USD`} {guide.excluded.unit > 0 && `${guide.excluded.unit} in non-weight units`}.</li>}
                    </ul>
                  </>
                ) : (
                  <Empty icon={Info} title="No prices to go on yet" action={addBtn}>Record what you hear in the market — competitor quotes, index prices, customer feedback, lost deals. Once there are a few, this shows a low / typical / high price to charge, and Pricing Studio checks every quote against it.</Empty>
                )}
              </Card>

              <Card title="Your numbers" >
                <dl className="space-y-3 text-sm">
                  {[
                    ["Market prices recorded", guide.market ? `${guide.market.count} · ${money(guide.market.low)}–${money(guide.market.high)}` : "None"],
                    ["Your sales", guide.sales ? `${guide.sales.count} · median ${money(guide.sales.median)}` : "None in period"],
                    ["Your purchase costs", guide.purchases ? `${guide.purchases.count} · median ${money(guide.purchases.median)}` : "None in period"],
                    ["Cost of stock on hand", guide.cost ? money(guide.cost) : "—"],
                    ["Minimum-margin floor", guide.floor ? money(guide.floor) : "No minimum set"],
                    ["Newest market price", guide.ageDays !== null ? `${guide.ageDays} day${guide.ageDays === 1 ? "" : "s"} ago` : "—"],
                  ].map(([k, v]) => <div key={k} className="flex justify-between gap-3 border-b border-line/60 pb-2 last:border-0"><dt className="text-fg-3">{k}</dt><dd className="num text-right font-medium">{v}</dd></div>)}
                </dl>
                <p className="mt-4 flex gap-1.5 text-xs text-fg-3"><ConfIcon size={13} className="mt-0.5 shrink-0" />{conf.text}.</p>
              </Card>

              {guide.observations.length > 0 && (
                <Card className="xl:col-span-3" title={`Prices over time (per ${unit})`}>
                  <MarketChart unit={unit} points={guide.observations.map((o) => ({ t: o.date.getTime(), price: Number(cv(o.price).toFixed(2)), kind: o.kind, source: o.source }))} band={guide.suggested ? { low: cv(guide.suggested.low).toNumber(), mid: cv(guide.suggested.mid).toNumber(), high: cv(guide.suggested.high).toNumber() } : null} floor={guide.floor ? cv(guide.floor).toNumber() : null} />
                </Card>
              )}
            </div>
          )}

          <Card className="mt-6" title="All products at a glance" pad={false}>
            <Table head={["Product", `Market rate`, "Range", "Your avg sale", "vs market", "Trend", "Confidence", "Newest"]}>
              {summaries.filter(Boolean).map((g) => {
                const s = g!.suggested, d = s && g!.sales && s.source === "market" ? g!.sales.median.minus(s.mid).div(s.mid) : null;
                return (
                  <tr key={g!.product.id}>
                    <td><Link className="font-medium hover:text-accent" href={q({ product: g!.product.id })}>{g!.product.name}</Link></td>
                    <td className="num font-semibold">{s ? `${fmtMoney(s.mid, "USD", 2)}/${g!.product.unit}` : "—"}</td>
                    <td className="num text-fg-2">{s ? `${fmtMoney(s.low, "USD", 0)}–${fmtMoney(s.high, "USD", 0)}` : "—"}</td>
                    <td className="num">{g!.sales ? fmtMoney(g!.sales.median, "USD", 2) : "—"}</td>
                    <td className={cx("num", d && (d.gt(0) ? "text-pos" : "text-warn"))}>{d ? `${d.gt(0) ? "+" : "−"}${fmtPct(d.abs())}` : "—"}</td>
                    <td>{g!.trend ? <span className={cx("num", g!.trend.gt(0) ? "text-pos" : "text-warn")}>{g!.trend.gt(0) ? "▲" : "▼"} {fmtPct(g!.trend.abs())}</span> : "—"}</td>
                    <td><Badge tone={CONF[g!.confidence].tone}>{g!.confidence === "none" ? "No data" : humanize(g!.confidence)}</Badge></td>
                    <td className="text-fg-3">{g!.ageDays !== null ? `${g!.ageDays}d ago` : "—"}</td>
                  </tr>
                );
              })}
            </Table>
          </Card>

          <Card className="mt-6" title={`Recorded market prices${guide ? ` — ${guide.product.name} and unassigned` : ""}`} pad={false}>
            <Table head={["Date", "Product / grade", "Price", `Per ${unit}`, "Basis", "Source", "Region", ""]} empty={!rates.length && <p className="p-5 text-sm text-fg-3">No market prices recorded yet.</p>}>
              {rates.map((r) => {
                let per: string = "—";
                try { if (r.currency === "USD") per = fmtMoney(convertUnitRate(r.price.toString(), r.unitCode, unit, l.units), "USD", 2); } catch { /* non-weight unit */ }
                return (
                  <tr key={r.id}>
                    <td>{r.observedAt.toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" })}</td>
                    <td>{r.product?.name ?? <span className="text-fg-3">—</span>}{r.grade && <span className="ml-1 text-xs text-fg-3">{r.grade}</span>}</td>
                    <td className="num">{r.currency} {dec(r.price).toFixed(2)} / {r.unitCode}</td>
                    <td className="num font-medium">{per}</td>
                    <td><Badge>{r.basis}</Badge></td>
                    <td className="max-w-[240px] truncate"><span className="text-xs text-fg-3">{SOURCES.find((s) => s[0] === r.sourceType)?.[1]}</span><br />{r.source}</td>
                    <td className="text-fg-2">{r.region}</td>
                    <td className="text-right"><ActionButton action={deleteMarketRate} hidden={{ id: r.id }} variant="ghost" confirm="Delete this market price?"><Trash2 size={13} /></ActionButton></td>
                  </tr>
                );
              })}
            </Table>
          </Card>
        </>
      )}
    </>
  );
}
