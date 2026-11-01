import Link from "next/link";
import { Plus, Target, TrendingUp, TrendingDown, Gauge, Archive } from "lucide-react";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { lookups } from "@/server/lookups";
import { allUnits, summarize } from "@/server/services/tracking";
import { compatible } from "@/lib/units";
import { fmtPct } from "@/lib/decimal";
import { PageHeader, Card, Empty, Badge, cx } from "@/components/ui";
import { FormModal } from "@/components/form-modal";
import { Spark } from "@/components/charts";
import { saveTracker, logTrackerEntry } from "@/server/actions/tracking";
import { trackerFields, logFields } from "./fields";

export const metadata = { title: "Tracking" };
const fmt = (v: { toFixed: (n: number) => string; toNumber: () => number } | null, d: number) => (v ? new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: d }).format(v.toNumber()) : "—");
const PERIOD = { DAILY: "today", WEEKLY: "this week", MONTHLY: "this month", AS_NEEDED: "this month" } as const;

export default async function TrackingPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("tracking.use");
  const sp = await searchParams;
  const archived = sp.archived === "1";
  const since = new Date(Date.now() - 400 * 86400000);
  const [trackers, units, l] = await Promise.all([
    db.tracker.findMany({ where: { archived }, orderBy: [{ category: "asc" }, { name: "asc" }], include: { entries: { where: { at: { gte: since } } }, product: true, location: true, unit: true } }),
    allUnits(),
    lookups(),
  ]);
  const categories = [...new Set(trackers.map((t) => t.category).filter(Boolean))] as string[];
  const shown = sp.category ? trackers.filter((t) => t.category === sp.category) : trackers;
  const cards = shown.map((t) => ({ t, s: summarize(t, t.entries, units, t.unitCode, 14) }));
  const onTarget = cards.filter((c) => c.s.onTarget === true).length, offTarget = cards.filter((c) => c.s.onTarget === false).length;
  const newBtn = <FormModal title="New tracker" trigger={<><Plus size={14} /> New tracker</>} triggerVariant="gold" triggerSize="md" wide action={saveTracker} submit="Create tracker" intro="Track anything that matters to the business, in the unit you think in. Values entered in other units of the same kind are converted automatically." fields={trackerFields(units, l.productOpts, l.locationOpts)} />;

  return (
    <>
      <PageHeader title="Tracking" description="Your own measures, in your own units: production, loading, energy, quality, safety — anything you want to watch over time." actions={newBtn} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card><div className="text-xs text-fg-3">Active trackers</div><div className="num mt-1 text-2xl font-semibold">{archived ? "—" : trackers.length}</div></Card>
        <Card><div className="text-xs text-fg-3">On target</div><div className="num mt-1 text-2xl font-semibold text-pos">{onTarget}</div></Card>
        <Card><div className="text-xs text-fg-3">Off target</div><div className={cx("num mt-1 text-2xl font-semibold", offTarget ? "text-warn" : "")}>{offTarget}</div></Card>
        <Card><div className="text-xs text-fg-3">Values logged (13 mo.)</div><div className="num mt-1 text-2xl font-semibold">{trackers.reduce((s, t) => s + t.entries.length, 0)}</div></Card>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2 text-sm">
        <Link href="/tracking" className={cx("rounded-full border px-3 py-1", !sp.category && !archived ? "border-accent bg-accent-soft text-accent" : "border-line text-fg-2 hover:text-fg")}>All</Link>
        {categories.map((c) => <Link key={c} href={`/tracking?category=${encodeURIComponent(c)}${archived ? "&archived=1" : ""}`} className={cx("rounded-full border px-3 py-1", sp.category === c ? "border-accent bg-accent-soft text-accent" : "border-line text-fg-2 hover:text-fg")}>{c}</Link>)}
        <Link href={archived ? "/tracking" : "/tracking?archived=1"} className="ml-auto flex items-center gap-1.5 text-xs text-fg-3 hover:text-fg"><Archive size={13} /> {archived ? "Back to active" : "Archived"}</Link>
      </div>

      {cards.length === 0 ? (
        <Card><Empty icon={Gauge} title={archived ? "No archived trackers" : "Nothing tracked yet"} action={!archived && newBtn}>Create a tracker for anything you measure — tons loaded per day, pelletizer moisture %, diesel gallons, truck turnaround hours, near-misses — in whatever unit you use.</Empty></Card>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {cards.map(({ t, s }) => {
            const unitOpts = units.filter((u) => compatible(u.code, t.unitCode, units)).map((u) => ({ value: u.code, label: `${u.name} (${u.code})` }));
            const up = s.change?.gt(0);
            return (
              <div key={t.id} className="card lift flex flex-col p-5">
                <div className="flex items-start gap-2">
                  <Link href={`/tracking/${t.id}`} className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-semibold hover:text-accent">{t.name}</div>
                    <div className="mt-0.5 truncate text-xs text-fg-3">{[t.category, t.product?.name, t.location?.code].filter(Boolean).join(" · ") || t.unit.name}</div>
                  </Link>
                  {s.onTarget !== null && <Badge tone={s.onTarget ? "pos" : "warn"}><Target size={11} /> {s.onTarget ? "On target" : "Off target"}</Badge>}
                </div>
                <Link href={`/tracking/${t.id}`} className="mt-4 block">
                  <div className="flex items-baseline gap-1.5">
                    <span className="num text-[30px] font-semibold leading-none tracking-tight">{fmt(s.headline, t.decimals)}</span>
                    <span className="text-sm text-fg-3">{t.unitCode}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 text-xs text-fg-3">
                    <span>{t.aggregation === "LATEST" ? "latest reading" : `${t.aggregation === "SUM" ? "total" : "average"} ${PERIOD[t.frequency]}`}</span>
                    {s.change && <span className={cx("flex items-center gap-0.5 font-medium", up ? "text-pos" : "text-warn")}>{up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{fmtPct(s.change.abs())}</span>}
                    {s.target && <span className="ml-auto">target {t.targetDirection === "AT_MOST" ? "≤" : "≥"} {fmt(s.target, t.decimals)}</span>}
                  </div>
                  <div className="mt-3"><Spark data={s.buckets.map((b) => b.value?.toNumber() ?? 0)} height={44} /></div>
                </Link>
                <div className="mt-auto flex items-center gap-2 border-t border-line pt-3">
                  <span className="text-xs text-fg-3">{s.latestEntry ? `Last logged ${s.latestEntry.at.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}` : "No values yet"}</span>
                  {!archived && <span className="ml-auto"><FormModal title={`Log — ${t.name}`} trigger={<><Plus size={13} /> Log value</>} action={logTrackerEntry} hidden={{ trackerId: t.id }} submit="Log value" fields={logFields(unitOpts, t.unitCode)} /></span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
