"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cx } from "./ui";

const RANGES = [
  ["30d", "30D"],
  ["90d", "90D"],
  ["mtd", "MTD"],
  ["qtd", "QTD"],
  ["ytd", "YTD"],
  ["12m", "12M"],
] as const;

export function PeriodPicker({ current }: { current: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const go = (params: Record<string, string | undefined>) => {
    const n = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(params)) v ? n.set(k, v) : n.delete(k);
    router.push(`${path}?${n.toString()}`);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-lg border border-line bg-surface p-0.5" role="group" aria-label="Date range">
        {RANGES.map(([k, l]) => (
          <button key={k} onClick={() => go({ range: k, from: undefined, to: undefined })} aria-pressed={current === k} className={cx("rounded-md px-2.5 py-1 text-xs font-medium transition", current === k ? "bg-accent text-white" : "text-fg-2 hover:text-fg")}>
            {l}
          </button>
        ))}
      </div>
      <input type="date" aria-label="From" defaultValue={sp.get("from") ?? ""} onChange={(e) => go({ range: "custom", from: e.target.value })} className="h-8 rounded-lg border border-line bg-surface px-2 text-xs text-fg" />
      <input type="date" aria-label="To" defaultValue={sp.get("to") ?? ""} onChange={(e) => go({ range: "custom", to: e.target.value })} className="h-8 rounded-lg border border-line bg-surface px-2 text-xs text-fg" />
    </div>
  );
}
