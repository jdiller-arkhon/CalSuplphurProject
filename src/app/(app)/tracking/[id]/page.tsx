import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, Pencil, Archive, ArchiveRestore, Trash2, Download, Target } from "lucide-react";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { lookups } from "@/server/lookups";
import { allUnits, summarize } from "@/server/services/tracking";
import { compatible, convertUnits, dimensionLabel } from "@/lib/units";
import { D, dec, fmtPct } from "@/lib/decimal";
import { PageHeader, Card, Table, Badge, Empty, cx } from "@/components/ui";
import { FormModal, ActionButton } from "@/components/form-modal";
import { TrackerChart } from "@/components/charts";
import { saveTracker, logTrackerEntry, archiveTracker, deleteTrackerEntry } from "@/server/actions/tracking";
import { trackerFields, logFields } from "../fields";

export const metadata = { title: "Tracker" };
const nf = (v: { toNumber: () => number } | null | undefined, d: number) => (v ? new Intl.NumberFormat("en-US", { maximumFractionDigits: d }).format(v.toNumber()) : "—");
const RANGES = { DAILY: [14, 30, 90], WEEKLY: [8, 13, 26, 52], MONTHLY: [6, 12, 24], AS_NEEDED: [6, 12, 24] } as const;
const NOUN = { DAILY: "days", WEEKLY: "weeks", MONTHLY: "months", AS_NEEDED: "months" } as const;

export default async function TrackerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  await requireUser("tracking.use");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [t, units, l] = await Promise.all([
    db.tracker.findUnique({ where: { id }, include: { entries: { orderBy: [{ at: "desc" }, { createdAt: "desc" }] }, product: true, location: true, unit: true } }),
    allUnits(),
    lookups(),
  ]);
  if (!t) notFound();
  const compat = units.filter((u) => compatible(u.code, t.unitCode, units));
  const display = compat.some((u) => u.code === sp.unit) ? sp.unit : t.unitCode;
  const periods = Number(sp.n) || RANGES[t.frequency][1];
  const s = summarize(t, t.entries, units, display, periods);
  const filled = s.buckets.filter((b) => b.value);
  const avg = filled.length ? filled.reduce((a, b) => a.plus(b.value!), new D(0)).div(filled.length) : null;
  const best = filled.length ? filled.reduce((a, b) => ((t.targetDirection === "AT_MOST" ? b.value!.lt(a.value!) : b.value!.gt(a.value!)) ? b : a)) : null;
  const hits = s.target ? filled.filter((b) => (t.targetDirection === "AT_MOST" ? b.value!.lte(s.target!) : b.value!.gte(s.target!))).length : null;
  const conv = (v: unknown) => convertUnits(dec(v as string), t.unitCode, display, units);
  const unitOpts = compat.map((u) => ({ value: u.code, label: `${u.name} (${u.code})` }));
  const q = (o: Record<string, string | number>) => `?${new URLSearchParams({ unit: display, n: String(periods), ...Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v)])) })}`;

  return (
    <>
      <PageHeader
        title={t.name}
        crumbs={[{ label: "Tracking", href: "/tracking" }, { label: t.name }]}
        description={t.description ?? `${dimensionLabel(t.unit.dimension)} in ${t.unit.name}, ${t.aggregation === "SUM" ? "added up" : t.aggregation === "AVERAGE" ? "averaged" : "latest reading"} per ${NOUN[t.frequency].slice(0, -1)}.`}
        actions={<>
          {!t.archived && <FormModal title={`Log — ${t.name}`} trigger={<><Plus size={14} /> Log value</>} triggerVariant="gold" triggerSize="md" action={logTrackerEntry} hidden={{ trackerId: t.id }} submit="Log value" fields={logFields(unitOpts, display)} />}
          <FormModal title="Edit tracker" trigger={<><Pencil size={14} /> Edit</>} triggerSize="md" wide action={saveTracker} hidden={{ id: t.id }} submit="Save" fields={trackerFields(units, l.productOpts, l.locationOpts, { ...t, target: t.target?.toString() ?? null })} />
          <a className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 text-sm font-medium text-white hover:bg-white/10" href={`/api/export/tracker/${t.id}?unit=${display}`}><Download size={14} /> CSV</a>
          <ActionButton action={archiveTracker} hidden={{ id: t.id, archived: String(!t.archived) }} size="md" confirm={t.archived ? undefined : "Archive this tracker? Its history is kept and it can be restored."}>{t.archived ? <><ArchiveRestore size={14} /> Restore</> : <><Archive size={14} /> Archive</>}</ActionButton>
        </>}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Card><div className="text-xs text-fg-3">{t.aggregation === "LATEST" ? "Latest reading" : t.frequency === "DAILY" ? "Today" : `This ${NOUN[t.frequency].slice(0, -1)}`}</div><div className="mt-1 flex items-baseline gap-1"><span className="num text-2xl font-semibold">{nf(s.headline, t.decimals)}</span><span className="text-xs text-fg-3">{display}</span></div>{s.change && <div className={cx("mt-0.5 text-xs font-medium", s.change.gt(0) ? "text-pos" : "text-warn")}>{s.change.gt(0) ? "▲" : "▼"} {fmtPct(s.change.abs())} vs previous</div>}</Card>
        <Card><div className="text-xs text-fg-3">Previous</div><div className="mt-1 flex items-baseline gap-1"><span className="num text-2xl font-semibold">{nf(s.previous?.value, t.decimals)}</span><span className="text-xs text-fg-3">{display}</span></div></Card>
        <Card><div className="text-xs text-fg-3">Average per {NOUN[t.frequency].slice(0, -1)}</div><div className="mt-1 flex items-baseline gap-1"><span className="num text-2xl font-semibold">{nf(avg, t.decimals)}</span><span className="text-xs text-fg-3">{display}</span></div><div className="mt-0.5 text-xs text-fg-3">{filled.length} of {periods} {NOUN[t.frequency]} with data</div></Card>
        <Card><div className="text-xs text-fg-3">{s.total ? `Total, last ${periods} ${NOUN[t.frequency]}` : "Best period"}</div><div className="mt-1 flex items-baseline gap-1"><span className="num text-2xl font-semibold">{s.total ? nf(s.total, t.decimals) : nf(best?.value, t.decimals)}</span><span className="text-xs text-fg-3">{display}</span></div>{!s.total && best && <div className="mt-0.5 text-xs text-fg-3">{best.label}</div>}</Card>
        <Card><div className="flex items-center gap-1 text-xs text-fg-3"><Target size={12} /> Target</div>{s.target ? <><div className="mt-1 flex items-baseline gap-1"><span className="num text-2xl font-semibold">{t.targetDirection === "AT_MOST" ? "≤" : "≥"} {nf(s.target, t.decimals)}</span><span className="text-xs text-fg-3">{display}</span></div><div className="mt-0.5 text-xs text-fg-3">Hit in {hits} of {filled.length} {NOUN[t.frequency]}</div></> : <div className="mt-2 text-sm text-fg-3">No target set</div>}</Card>
      </div>

      <Card
        title="History"
        action={
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-1">{RANGES[t.frequency].map((n) => <Link key={n} href={q({ n })} className={cx("rounded-md px-2 py-1", n === periods ? "bg-accent-soft font-semibold text-accent" : "text-fg-2 hover:text-fg")}>{n}{NOUN[t.frequency][0]}</Link>)}</div>
            {compat.length > 1 && <div className="flex items-center gap-1"><span className="text-fg-3">Show in</span>{[...compat].sort((a, b) => Number(b.toKg) - Number(a.toKg)).map((u) => <Link key={u.code} href={q({ unit: u.code })} className={cx("rounded-md px-2 py-1", u.code === display ? "bg-accent-soft font-semibold text-accent" : "text-fg-2 hover:text-fg")}>{u.code}</Link>)}</div>}
          </div>
        }
      >
        {filled.length ? <TrackerChart data={s.buckets.map((b) => ({ label: b.label, value: b.value ? Number(b.value.toFixed(6)) : null }))} unit={display} target={s.target ? s.target.toNumber() : null} kind={t.aggregation === "SUM" ? "bar" : "line"} decimals={t.decimals} /> : <Empty title="No values in this range">Log a value to start the chart.</Empty>}
      </Card>

      <Card className="mt-6" title={`Logged values (${t.entries.length})`} pad={false}>
        <Table head={["Date", `Value (${display})`, "As entered", "Note", ""]} empty={!t.entries.length && <p className="p-5 text-sm text-fg-3">Nothing logged yet.</p>}>
          {t.entries.slice(0, 200).map((e) => (
            <tr key={e.id}>
              <td>{e.at.toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" })}</td>
              <td className="num font-medium">{nf(conv(e.value), t.decimals)}</td>
              <td className="num text-fg-3">{e.enteredUnit !== display ? `${nf(dec(e.enteredValue), 6)} ${e.enteredUnit}` : ""}</td>
              <td className="max-w-[320px] truncate text-fg-2">{e.note}</td>
              <td className="text-right"><ActionButton action={deleteTrackerEntry} hidden={{ id: e.id }} variant="ghost" confirm="Delete this value?"><Trash2 size={13} /></ActionButton></td>
            </tr>
          ))}
        </Table>
      </Card>
      {(t.product || t.location) && <div className="mt-4 flex gap-2 text-xs text-fg-3">{t.product && <Badge><Link href={`/products/${t.product.id}`}>{t.product.name}</Link></Badge>}{t.location && <Badge>{t.location.name}</Badge>}</div>}
    </>
  );
}
