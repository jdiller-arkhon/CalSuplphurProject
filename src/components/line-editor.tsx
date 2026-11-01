"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { D, dec, fmtMoney, fmtPct } from "@/lib/decimal";
import { cx, inputClass } from "./ui";

export type LineProduct = { id: string; name: string; unit: string; cost: string | null; price: string | null; minMargin: string };
export type LineInit = { productId: string; quantity: string; unitPrice: string; unitCost?: string; description?: string };

/** Editable document lines posting as lines.N.field. Shows live extension and margin vs the product's floor. */
/** `agreedPrices`: productId → the selected customer's agreed price, used before the standard price. */
export function LineEditor({ products, initial, priceLabel = "Unit price", showMargin = true, costField = false, agreedPrices }: { products: LineProduct[]; initial?: LineInit[]; priceLabel?: string; showMargin?: boolean; costField?: boolean; agreedPrices?: Record<string, string> }) {
  const [rows, setRows] = useState<(LineInit & { k: number })[]>(() => (initial?.length ? initial : [{ productId: "", quantity: "", unitPrice: "" }]).map((r, k) => ({ ...r, k })));
  const set = (k: number, p: Partial<LineInit>) => setRows((rs) => rs.map((r) => (r.k === k ? { ...r, ...p } : r)));
  const isNum = (v: string) => /^\d+(\.\d+)?$/.test(v);
  const total = useMemo(() => rows.reduce((s, r) => (isNum(r.quantity) && isNum(r.unitPrice) ? s.plus(dec(r.quantity).times(dec(r.unitPrice))) : s), new D(0)), [rows]);
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-line bg-surface-2 text-left text-[11px] font-semibold uppercase tracking-wider text-fg-3">
            <th className="px-3 py-2">Product</th>
            <th className="w-32 px-3 py-2 text-right">Quantity</th>
            <th className="w-36 px-3 py-2 text-right">{priceLabel}</th>
            <th className="w-36 px-3 py-2 text-right">Extended</th>
            {showMargin && <th className="w-24 px-3 py-2 text-right">Margin</th>}
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const p = products.find((x) => x.id === r.productId);
            const ext = isNum(r.quantity) && isNum(r.unitPrice) ? dec(r.quantity).times(dec(r.unitPrice)) : null;
            const cost = r.unitCost ?? p?.cost;
            const m = cost && isNum(r.unitPrice) && dec(r.unitPrice).gt(0) ? dec(r.unitPrice).minus(dec(cost)).div(dec(r.unitPrice)) : null;
            const low = m && p && m.lt(dec(p.minMargin));
            return (
              <tr key={r.k} className="border-b border-line last:border-0">
                <td className="px-3 py-2">
                  <select name={`lines.${i}.productId`} required value={r.productId} aria-label="Product" onChange={(e) => { const np = products.find((x) => x.id === e.target.value); set(r.k, { productId: e.target.value, unitPrice: r.unitPrice || (costField ? np?.cost : agreedPrices?.[e.target.value] ?? np?.price) || "" }); }} className={cx(inputClass, "h-8")}>
                    <option value="">Select product…</option>
                    {products.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                  {r.unitCost && <input type="hidden" name={`lines.${i}.unitCost`} value={r.unitCost} />}
                </td>
                <td className="px-3 py-2"><div className="relative"><input name={`lines.${i}.quantity`} required inputMode="decimal" aria-label="Quantity" value={r.quantity} onChange={(e) => set(r.k, { quantity: e.target.value.trim() })} className={cx(inputClass, "num h-8 pr-9 text-right")} /><span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-fg-3">{p?.unit}</span></div></td>
                <td className="px-3 py-2">{!costField && agreedPrices?.[r.productId] && <div className="mb-0.5 text-right text-[10px] font-medium text-gold">Agreed {fmtMoney(agreedPrices[r.productId])}</div>}<input name={costField ? `lines.${i}.unitCost` : `lines.${i}.unitPrice`} required inputMode="decimal" aria-label={priceLabel} value={r.unitPrice} onChange={(e) => set(r.k, { unitPrice: e.target.value.trim() })} className={cx(inputClass, "num h-8 text-right")} /></td>
                <td className="num px-3 py-2 text-right font-medium">{ext ? fmtMoney(ext) : "—"}</td>
                {showMargin && <td className={cx("num px-3 py-2 text-right", low ? "font-semibold text-warn" : "text-fg-2")} title={p ? `Minimum ${fmtPct(p.minMargin)}` : undefined}>{m ? fmtPct(m) : "—"}</td>}
                <td className="px-2"><button type="button" onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.k !== r.k) : rs))} className="rounded p-1 text-fg-3 hover:text-crit" aria-label="Remove line"><Trash2 size={14} /></button></td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-line bg-surface-2">
            <td className="px-3 py-2"><button type="button" onClick={() => setRows((rs) => [...rs, { k: Math.max(...rs.map((x) => x.k)) + 1, productId: "", quantity: "", unitPrice: "" }])} className="inline-flex items-center gap-1 text-xs font-medium text-accent"><Plus size={13} />Add line</button></td>
            <td colSpan={2} className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-fg-3">Total</td>
            <td className="num px-3 py-2 text-right font-semibold">{fmtMoney(total)}</td>
            <td colSpan={showMargin ? 2 : 1} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
