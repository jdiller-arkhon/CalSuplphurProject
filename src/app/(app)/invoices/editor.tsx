"use client";
import { useMemo, useState } from "react";
import { Plus, Trash2, Boxes, Send, Save } from "lucide-react";
import { D, dec, fmtMoney } from "@/lib/decimal";
import { ActionForm, Submit } from "@/components/forms";
import { Card, Field, Input, Select, Textarea, cx, inputClass } from "@/components/ui";
import { saveInvoice } from "@/server/actions/invoices";

export type EdCustomer = { id: string; name: string; paymentTerms: string | null; billingAddress: string | null; shippingAddress: string | null };
export type EdProduct = { id: string; name: string; unit: string; price: string | null };
export type EdLot = { id: string; productId: string; label: string; available: string };
type Line = { k: number; productId: string; description: string; quantity: string; unitLabel: string; unitPrice: string; lotId: string };
export type EdInitial = { id?: string; customerId: string; issueDate: string; dueDate: string; paymentTerms: string; customerPo: string; taxPct: string; billTo: string; shipTo: string; notes: string; lines: Omit<Line, "k">[] };

const termDays = (t: string) => { const m = /net\s*(\d+)/i.exec(t); return m ? Number(m[1]) : /due on receipt|cod|cia/i.test(t) ? 0 : null; };
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const isNum = (v: string) => /^\d+(\.\d+)?$/.test(v);
let seq = 1000;

export function InvoiceEditor({ customers, products, lots, agreed, initial, defaultDueDays }: { customers: EdCustomer[]; products: EdProduct[]; lots: EdLot[]; agreed: Record<string, Record<string, string>>; initial: EdInitial; defaultDueDays: number }) {
  const [c, setC] = useState(initial.customerId);
  const [issueDate, setIssueDate] = useState(initial.issueDate);
  const [dueDate, setDueDate] = useState(initial.dueDate);
  const [terms, setTerms] = useState(initial.paymentTerms);
  const [billTo, setBillTo] = useState(initial.billTo);
  const [shipTo, setShipTo] = useState(initial.shipTo);
  const [tax, setTax] = useState(initial.taxPct);
  const [lines, setLines] = useState<Line[]>(() => (initial.lines.length ? initial.lines : [{ productId: "", description: "", quantity: "", unitLabel: "", unitPrice: "", lotId: "" }]).map((l) => ({ ...l, k: seq++ })));
  const set = (k: number, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.k === k ? { ...l, ...p } : l)));

  const pickCustomer = (id: string) => {
    setC(id);
    const cu = customers.find((x) => x.id === id);
    if (!cu) return;
    if (cu.paymentTerms) { setTerms(cu.paymentTerms); const n = termDays(cu.paymentTerms); if (n !== null) setDueDate(addDays(issueDate, n)); }
    setBillTo(cu.billingAddress ?? ""); setShipTo(cu.shippingAddress ?? "");
    setLines((ls) => ls.map((l) => (l.productId && agreed[id]?.[l.productId] ? { ...l, unitPrice: dec(agreed[id][l.productId]).toDecimalPlaces(4).toString() } : l)));
  };
  const pickProduct = (k: number, id: string) => {
    const p = products.find((x) => x.id === id);
    const price = (c && agreed[c]?.[id]) || p?.price || "";
    const firstLot = lots.find((l) => l.productId === id && dec(l.available).gt(0));
    set(k, { productId: id, description: p?.name ?? "", unitLabel: p?.unit ?? "", unitPrice: price ? dec(price).toDecimalPlaces(4).toString() : "", lotId: firstLot?.id ?? "" });
  };
  const t = useMemo(() => {
    const sub = lines.reduce((s, l) => (isNum(l.quantity) && isNum(l.unitPrice) ? s.plus(dec(l.quantity).times(dec(l.unitPrice)).toDecimalPlaces(2)) : s), new D(0));
    const tx = isNum(tax) ? sub.times(dec(tax).div(100)).toDecimalPlaces(2) : new D(0);
    return { sub, tx, total: sub.plus(tx) };
  }, [lines, tax]);
  const stockLines = lines.filter((l) => l.lotId).length;

  return (
    <ActionForm action={saveInvoice} className="grid items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_300px]">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <div className="space-y-6">
        <Card title="Bill to">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Customer" name="customerId"><Select name="customerId" required value={c} onChange={(e) => pickCustomer(e.target.value)}><option value="">Choose a customer…</option>{customers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
            <Field label="Customer PO # (optional)" name="customerPo"><Input name="customerPo" defaultValue={initial.customerPo} /></Field>
            <Field label="Billing address" name="billTo"><Textarea name="billTo" rows={3} value={billTo} onChange={(e) => setBillTo(e.target.value)} /></Field>
            <Field label="Ship to (optional)" name="shipTo"><Textarea name="shipTo" rows={3} value={shipTo} onChange={(e) => setShipTo(e.target.value)} /></Field>
          </div>
        </Card>

        <Card title="Lines" pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] table-fixed text-sm">
              <thead><tr className="border-b border-line bg-surface-2 text-left text-[11px] font-semibold uppercase tracking-wider text-fg-3">
                <th className="px-3 py-2 pl-5">Product / description</th><th className="w-[150px] px-2 py-2">From stock</th><th className="w-[78px] px-2 py-2 text-right">Qty</th><th className="w-[62px] px-2 py-2">Unit</th><th className="w-[92px] px-2 py-2 text-right">Price</th><th className="w-[96px] px-2 py-2 text-right">Amount</th><th className="w-9" />
              </tr></thead>
              <tbody>
                {lines.map((l, i) => {
                  const lotOpts = lots.filter((x) => x.productId === l.productId);
                  const lot = lots.find((x) => x.id === l.lotId);
                  const over = lot && isNum(l.quantity) && dec(l.quantity).gt(dec(lot.available));
                  const amt = isNum(l.quantity) && isNum(l.unitPrice) ? dec(l.quantity).times(dec(l.unitPrice)).toDecimalPlaces(2) : null;
                  return (
                    <tr key={l.k} className="border-b border-line align-top last:border-0">
                      <td className="px-3 py-2 pl-5">
                        <select aria-label="Product" className={cx(inputClass, "mb-1.5")} value={l.productId} onChange={(e) => (e.target.value ? pickProduct(l.k, e.target.value) : set(l.k, { productId: "", lotId: "" }))} name={`lines.${i}.productId`}>
                          <option value="">Other (freight, service…)</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <input aria-label="Description" className={inputClass} name={`lines.${i}.description`} required placeholder="Description shown on the invoice" value={l.description} onChange={(e) => set(l.k, { description: e.target.value })} />
                      </td>
                      <td className="px-2 py-2">
                        {l.productId ? (
                          <>
                            <select aria-label="Stock lot" className={inputClass} name={`lines.${i}.lotId`} value={l.lotId} onChange={(e) => set(l.k, { lotId: e.target.value })}>
                              <option value="">Not from stock</option>{lotOpts.map((x) => <option key={x.id} value={x.id}>{x.label} ({Number(x.available).toLocaleString()})</option>)}
                            </select>
                            {over && <div className="mt-1 text-xs text-crit">More than this lot has available.</div>}
                          </>
                        ) : <span className="text-xs text-fg-3">—</span>}
                      </td>
                      <td className="px-2 py-2"><input aria-label="Quantity" className={cx(inputClass, "num text-right")} name={`lines.${i}.quantity`} inputMode="decimal" required value={l.quantity} onChange={(e) => set(l.k, { quantity: e.target.value.trim() })} /></td>
                      <td className="px-2 py-2"><input aria-label="Unit" className={inputClass} name={`lines.${i}.unitLabel`} placeholder="MT" value={l.unitLabel} onChange={(e) => set(l.k, { unitLabel: e.target.value })} /></td>
                      <td className="px-2 py-2"><input aria-label="Price" className={cx(inputClass, "num text-right")} name={`lines.${i}.unitPrice`} inputMode="decimal" required value={l.unitPrice} onChange={(e) => set(l.k, { unitPrice: e.target.value.trim() })} /></td>
                      <td className="num px-2 py-2 pt-4 text-right font-medium">{amt ? fmtMoney(amt) : "—"}</td>
                      <td className="px-2 py-2 pt-3"><button type="button" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((x) => x.k !== l.k))} className="rounded p-1.5 text-fg-3 hover:bg-surface-2 hover:text-crit disabled:opacity-30"><Trash2 size={14} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3">
            <button type="button" onClick={() => setLines((ls) => [...ls, { k: seq++, productId: "", description: "", quantity: "", unitLabel: "", unitPrice: "", lotId: "" }])} className="inline-flex items-center gap-1 text-sm font-medium text-accent"><Plus size={14} /> Add line</button>
            <button type="button" onClick={() => setLines((ls) => [...ls, { k: seq++, productId: "", description: "Freight", quantity: "1", unitLabel: "load", unitPrice: "", lotId: "" }])} className="inline-flex items-center gap-1 text-sm text-fg-2 hover:text-fg"><Plus size={14} /> Freight</button>
          </div>
        </Card>
        <Card title="Notes (printed on the invoice)"><Textarea name="notes" rows={3} defaultValue={initial.notes} placeholder="e.g. Thank you for your business. Remit to …" /></Card>
      </div>

      <div className="space-y-6 xl:sticky xl:top-20">
        <Card title="Details">
          <div className="space-y-4">
            <Field label="Invoice date" name="issueDate"><Input type="date" name="issueDate" required value={issueDate} onChange={(e) => { setIssueDate(e.target.value); const n = termDays(terms); setDueDate(addDays(e.target.value, n ?? defaultDueDays)); }} /></Field>
            <Field label="Payment terms" name="paymentTerms"><Input name="paymentTerms" value={terms} onChange={(e) => { setTerms(e.target.value); const n = termDays(e.target.value); if (n !== null) setDueDate(addDays(issueDate, n)); }} placeholder="Net 30" /></Field>
            <Field label="Due date" name="dueDate"><Input type="date" name="dueDate" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
            <Field label="Sales tax (%)" name="taxPct" hint="Leave 0 if exempt (e.g. agricultural use)."><Input name="taxPct" inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value.trim())} className="num" /></Field>
          </div>
        </Card>
        <section className="card overflow-hidden">
          <div className="bg-sidebar px-5 py-4 text-white">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold">Invoice total</div>
            <div className="num mt-1 text-[32px] font-semibold leading-none">{fmtMoney(t.total)}</div>
          </div>
          <dl className="space-y-1.5 p-5 text-sm">
            <div className="flex justify-between"><dt className="text-fg-3">Subtotal</dt><dd className="num">{fmtMoney(t.sub)}</dd></div>
            <div className="flex justify-between"><dt className="text-fg-3">Tax</dt><dd className="num">{fmtMoney(t.tx)}</dd></div>
            {stockLines > 0 && <div className="flex items-start gap-1.5 pt-2 text-xs text-fg-2"><Boxes size={13} className="mt-0.5 shrink-0 text-gold" />Issuing takes stock from {stockLines} lot{stockLines === 1 ? "" : "s"}. Voiding later puts it back.</div>}
          </dl>
          <div className="flex flex-col gap-2 border-t border-line p-5">
            <button type="submit" name="intent" value="issue" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-sulphur px-4 text-sm font-semibold text-sidebar shadow-sm transition hover:brightness-105"><Send size={15} /> Issue invoice</button>
            <Submit variant="secondary"><Save size={14} /> Save as draft</Submit>
            <p className="text-center text-[11px] text-fg-3">Issuing assigns the invoice number and locks it.</p>
          </div>
        </section>
      </div>
    </ActionForm>
  );
}
