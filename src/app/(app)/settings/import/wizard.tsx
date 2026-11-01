"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, FileSpreadsheet, CheckCircle2, AlertTriangle } from "lucide-react";
import type { ActionFn } from "@/components/forms";
import { Button, Card, Field, Select, Badge, cx, inputClass } from "@/components/ui";

type Spec = Record<string, { label: string; note: string; fields: { key: string; label: string; required?: boolean }[] }>;
type Row = { line: number; values: Record<string, string>; errors: string[]; duplicate?: string };
type Preview = { headers: string[]; mapping: Record<string, number>; rows: Row[]; fileName: string };

export function ImportWizard({ kinds, preview, run }: { kinds: Spec; preview: ActionFn; run: ActionFn }) {
  const router = useRouter();
  const [kind, setKind] = useState(Object.keys(kinds)[0]);
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<Preview | null>(null);
  const [skip, setSkip] = useState(false);
  const [busy, start] = useTransition();
  const spec = kinds[kind];

  const doPreview = (mapping?: Record<string, number>) =>
    start(async () => {
      if (!file) return void toast.error("Choose a file first.");
      const fd = new FormData();
      fd.set("kind", kind);
      fd.set("file", file);
      if (mapping) fd.set("mapping", JSON.stringify(mapping));
      const r = await preview(null, fd);
      if (r?.error) return void toast.error(r.error);
      setData(r?.data as Preview);
    });
  const doImport = () =>
    start(async () => {
      if (!file || !data) return;
      const fd = new FormData();
      fd.set("kind", kind);
      fd.set("file", file);
      fd.set("mapping", JSON.stringify(data.mapping));
      if (skip) fd.set("skip", "on");
      const r = await run(null, fd);
      if (r?.error) return void toast.error(r.error);
      toast.success(r?.message ?? "Imported.");
      setData(null);
      setFile(null);
      router.refresh();
    });

  const bad = data?.rows.filter((r) => r.errors.length || r.duplicate) ?? [];
  const good = (data?.rows.length ?? 0) - bad.length;

  return (
    <div className="space-y-6">
      <Card title="1 · Choose what to import">
        <div className="grid items-end gap-4 md:grid-cols-[220px_1fr_auto]">
          <Field label="Import type" name="kind"><Select name="kind" value={kind} onChange={(e) => { setKind(e.target.value); setData(null); }}>{Object.entries(kinds).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
          <Field label="Spreadsheet (.xlsx or .csv, up to 5,000 rows)" name="file"><input id="file" type="file" accept=".xlsx,.csv" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setData(null); }} className={cx(inputClass, "py-1.5")} /></Field>
          <Button disabled={!file || busy} onClick={() => doPreview()}><FileSpreadsheet size={14} /> Check file</Button>
        </div>
        <p className="mt-3 text-sm text-fg-2">{spec.note} <a href={`/api/import-template/${kind}`} className="inline-flex items-center gap-1 font-medium text-accent"><Download size={13} /> Download template</a></p>
      </Card>

      {data && (
        <>
          <Card title="2 · Match columns" action={<Button size="sm" variant="secondary" disabled={busy} onClick={() => doPreview(data.mapping)}>Re-check</Button>}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {spec.fields.map((f) => (
                <label key={f.key} className="block text-sm">
                  <span className="mb-1 block text-[12px] font-medium text-fg-2">{f.label}{f.required && " *"}</span>
                  <select className={cx(inputClass, "h-8")} value={data.mapping[f.key] ?? ""} onChange={(e) => setData({ ...data, mapping: { ...data.mapping, [f.key]: e.target.value === "" ? undefined! : Number(e.target.value) } })}>
                    <option value="">— Not in file —</option>
                    {data.headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </Card>
          <Card title={`3 · Review ${data.rows.length} row(s) from ${data.fileName}`} pad={false} action={<div className="flex gap-2"><Badge tone="pos">{good} ready</Badge>{bad.length > 0 && <Badge tone="warn">{bad.length} need attention</Badge>}</div>}>
            <div className="max-h-[440px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-2"><tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-fg-3"><th className="px-4 py-2">Row</th>{spec.fields.map((f) => <th key={f.key} className="whitespace-nowrap px-3 py-2">{f.label}</th>)}<th className="px-4 py-2">Status</th></tr></thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.line} className={cx("border-t border-line", (r.errors.length || r.duplicate) && "bg-warn-soft/40")}>
                      <td className="num px-4 py-2 text-fg-3">{r.line}</td>
                      {spec.fields.map((f) => <td key={f.key} className="max-w-[180px] truncate px-3 py-2">{r.values[f.key]}</td>)}
                      <td className="px-4 py-2">{r.errors.length ? <span className="flex items-start gap-1 text-xs text-crit"><AlertTriangle size={13} className="mt-px shrink-0" />{r.errors.join("; ")}</span> : r.duplicate ? <span className="text-xs text-warn">{r.duplicate}</span> : <span className="flex items-center gap-1 text-xs text-pos"><CheckCircle2 size={13} />Ready</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4">
              {bad.length > 0 ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} className="accent-[var(--accent)]" />Skip the {bad.length} row(s) with problems (they'll be listed in import history)</label> : <span className="text-sm text-fg-2">All rows are valid. The import runs as one step — all rows or none.</span>}
              <Button disabled={busy || good === 0 || (bad.length > 0 && !skip)} onClick={doImport}>Import {good} row(s)</Button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
