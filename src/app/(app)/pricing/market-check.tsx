"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { LineChart, ShieldAlert, ArrowRight, Loader2 } from "lucide-react";
import { D, dec, fmtMoney, fmtPct, type Dec } from "@/lib/decimal";
import { cx } from "@/components/ui";

type Guide = { unit: string; confidence: "high" | "medium" | "low" | "none"; ageDays: number | null; trend: string | null; suggested: { low: string; mid: string; high: string; source: "market" | "sales" } | null; marketCount: number; salesMedian: string | null; floor: string | null };

/** Compares the price on screen with the market-rate guide and offers to match it. */
export function MarketCheck({ productId, price, landed, onUse }: { productId: string; price: string | null; landed: string | null; onUse: (price: string) => void }) {
  const [g, setG] = useState<Guide | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!productId) { setG(null); return; }
    const ctl = new AbortController(); setLoading(true);
    fetch(`/api/market-guide?product=${encodeURIComponent(productId)}`, { signal: ctl.signal }).then((r) => (r.ok ? r.json() : null)).then((j) => setG(j)).catch(() => {}).finally(() => setLoading(false));
    return () => ctl.abort();
  }, [productId]);

  if (!productId) return null;
  const head = <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-3"><LineChart size={13} className="text-gold" /> Market check {loading && <Loader2 size={12} className="animate-spin" />}<Link href={`/market?product=${productId}`} className="ml-auto normal-case tracking-normal text-accent">Market rates →</Link></div>;
  if (!g?.suggested) return <section className="card rise p-5">{head}<p className="text-sm text-fg-2">{loading ? "Loading…" : "No market prices recorded for this product yet."} <Link href={`/market?product=${productId}`} className="font-medium text-accent">Record one</Link> to see what the market pays.</p></section>;

  const low = dec(g.suggested.low), mid = dec(g.suggested.mid), high = dec(g.suggested.high);
  const p = price ? dec(price) : null;
  const lo = D.min(low, p ?? low, g.floor ? dec(g.floor) : low).times(0.92), hi = D.max(high, p ?? high).times(1.08);
  const pct = (v: Dec) => `${Math.max(0, Math.min(100, v.minus(lo).div(hi.minus(lo)).times(100).toNumber()))}%`;
  const vs = p && !mid.isZero() ? p.minus(mid).div(mid) : null;
  const zone = !p ? null : p.lt(low) ? "below" : p.gt(high) ? "above" : "within";
  const msg = { below: "Below the market range: you may be leaving money on the table.", within: "Within the market range.", above: "Above the market range: expect pushback unless there's a service or quality premium." } as const;
  const tone = { below: "text-warn", within: "text-pos", above: "text-warn" } as const;
  const marginAtMid = landed && !mid.isZero() ? mid.minus(dec(landed)).div(mid) : null;

  return (
    <section className="card rise p-5">
      {head}
      <div className="relative mb-2 mt-6 h-2.5 rounded-full bg-surface-2">
        <div className="absolute inset-y-0 rounded-full bg-gold/50" style={{ left: pct(low), width: `calc(${pct(high)} - ${pct(low)})` }} />
        <div className="absolute top-1/2 h-4 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded bg-gold" style={{ left: pct(mid) }} title="Market rate" />
        {g.floor && <div className="absolute top-1/2 h-4 w-[2px] -translate-x-1/2 -translate-y-1/2 bg-crit" style={{ left: pct(dec(g.floor)) }} title="Minimum-margin floor" />}
        {p && <div className="range-mark absolute top-1/2 -translate-x-1/2" style={{ left: pct(p) }}><div className="h-4 w-4 -translate-y-1/2 rounded-full border-2 border-surface bg-accent shadow" /><div className="num absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-semibold text-accent">You {fmtMoney(p, "USD", 0)}</div></div>}
      </div>
      <div className="flex justify-between text-[11px] text-fg-3"><span className="num">Low {fmtMoney(low, "USD", 0)}</span><span className="num font-medium text-gold">Market {fmtMoney(mid, "USD", 2)}</span><span className="num">High {fmtMoney(high, "USD", 0)}</span></div>
      {zone && <p className={cx("mt-3 text-sm font-medium", tone[zone])}>{vs && `${vs.gt(0) ? "+" : "−"}${fmtPct(vs.abs())} vs market. `}{msg[zone]}</p>}
      <div className="mt-2 space-y-0.5 text-xs text-fg-3">
        <div>Per {g.unit} · {g.suggested.source === "market" ? `${g.marketCount} market price${g.marketCount === 1 ? "" : "s"}` : "from your own sales (no market prices yet)"}{g.ageDays !== null && `, newest ${g.ageDays}d old`}{g.trend && ` · trend ${dec(g.trend).gt(0) ? "▲" : "▼"} ${fmtPct(dec(g.trend).abs())}`}</div>
        {marginAtMid && <div>At the market rate your margin would be <b className={marginAtMid.lt(0) ? "text-crit" : "text-fg-2"}>{fmtPct(marginAtMid)}</b>.</div>}
        {g.confidence === "low" && <div className="flex items-center gap-1 text-warn"><ShieldAlert size={12} /> Low confidence: few or old prices.</div>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {[["Match low", low], ["Match market", mid], ["Match high", high]].map(([l, v]) => <button key={l as string} type="button" onClick={() => onUse((v as Dec).toFixed(2))} className={cx("inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition hover:border-accent hover:text-accent", l === "Match market" ? "border-gold/60 text-fg" : "border-line text-fg-2")}>{l as string} <ArrowRight size={11} /></button>)}
      </div>
    </section>
  );
}
