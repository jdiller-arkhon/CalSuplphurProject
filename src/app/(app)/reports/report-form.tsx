"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Field, Select, Input, buttonClass, cx } from "@/components/ui";

type T = { value: string; label: string; sections: string[] };
const RANGES = [["mtd", "Month to date"], ["lm", "Last month"], ["qtd", "Quarter to date"], ["ytd", "Year to date"], ["12m", "Last 12 months"], ["30d", "Last 30 days"], ["90d", "Last 90 days"], ["custom", "Custom dates"]];

export function ReportForm({ kind, templates, sections }: { kind: "pptx" | "xlsx"; templates: T[]; sections: { value: string; label: string }[] }) {
  const [t, setT] = useState(templates[0]?.value ?? "");
  const [range, setRange] = useState(kind === "pptx" ? "lm" : "ytd");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [picked, setPicked] = useState<string[]>(["summary", "financial", "insights"]);
  const tpl = templates.find((x) => x.value === t);
  const qs = new URLSearchParams(kind === "pptx" ? { template: t, range } : { report: t, range });
  if (range === "custom") { if (from) qs.set("from", from); if (to) qs.set("to", to); }
  if (kind === "pptx" && t === "custom") picked.forEach((s) => qs.append("s", s));
  const href = `/api/export/${kind}?${qs}`;
  if (!templates.length) return <p className="text-sm text-fg-2">No workbooks are available for your role.</p>;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={kind === "pptx" ? "Template" : "Workbook"} name={`${kind}-t`}><Select name={`${kind}-t`} value={t} onChange={(e) => setT(e.target.value)}>{templates.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</Select></Field>
        <Field label="Reporting period" name={`${kind}-r`}><Select name={`${kind}-r`} value={range} onChange={(e) => setRange(e.target.value)}>{RANGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
        {range === "custom" && (<><Field label="From" name={`${kind}-from`}><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field><Field label="To" name={`${kind}-to`}><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field></>)}
      </div>
      {kind === "pptx" && (
        <div>
          <div className="mb-2 text-[12px] font-medium text-fg-2">{t === "custom" ? "Choose slides" : "Slides included"}</div>
          <div className="flex flex-wrap gap-1.5">
            {sections.map((s) => {
              const on = t === "custom" ? picked.includes(s.value) : tpl?.sections.includes(s.value);
              return (
                <button key={s.value} type="button" disabled={t !== "custom"} onClick={() => setPicked((p) => (p.includes(s.value) ? p.filter((x) => x !== s.value) : [...p, s.value]))} className={cx("rounded-full border px-2.5 py-1 text-xs font-medium transition", on ? "border-accent bg-accent-soft text-accent" : "border-line text-fg-3", t === "custom" && "hover:border-accent")}>
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="flex items-center justify-between border-t border-line pt-4">
        <span className="text-xs text-fg-3">{kind === "pptx" ? "16:9, editable charts and tables, page numbers on every slide." : "Frozen headers, filters, totals and live formulas."}</span>
        <a href={href} className={buttonClass(kind === "pptx" ? "gold" : "primary")}><Download size={14} /> Generate {kind === "pptx" ? "deck" : "workbook"}</a>
      </div>
    </div>
  );
}
