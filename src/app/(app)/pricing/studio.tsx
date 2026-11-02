"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Save, FileSignature, Pin, X, AlertTriangle, Info } from "lucide-react";
import { calculatePrice, sensitivityMatrix, PricingError, type CostBasis, type PricingMethod, type PricingResult } from "@/lib/pricing";
import { D, dec, fmtMoney, fmtPct, fmtQty } from "@/lib/decimal";
import { Button, Card, Field, Input, Select, cx, inputClass } from "@/components/ui";
import { saveScenario } from "@/server/actions/pricing";
import { MarketCheck } from "./market-check";

export type StudioProduct = { id: string; name: string; unit: string; currentCost: string | null; defaultCost: string | null; minMarginPct: string | null };
type Row = { id: string; category: string; label: string; basis: CostBasis; amount: string };
export type StudioInitial = { name?: string; productId?: string; customerId?: string; quantity: string; shipments: number; method: PricingMethod; target: string; discountPct: string; components: Omit<Row, "id">[] };

const CATEGORIES = [
  ["ACQUISITION", "Product acquisition", "PER_UNIT"],
  ["PROCESSING", "Processing / forming", "PER_UNIT"],
  ["FREIGHT", "Freight", "PER_SHIPMENT"],
  ["FUEL", "Fuel surcharge", "PER_SHIPMENT"],
  ["LOADING", "Loading", "PER_UNIT"],
  ["UNLOADING", "Unloading", "PER_UNIT"],
  ["STORAGE", "Storage", "PER_UNIT"],
  ["PACKAGING", "Packaging", "PER_UNIT"],
  ["INSURANCE", "Insurance", "PER_ORDER"],
  ["DUTIES", "Duties & tariffs", "PER_UNIT"],
  ["COMMISSION", "Commission", "PERCENT_OF_PRICE"],
  ["OVERHEAD", "Allocated overhead", "PER_UNIT"],
  ["OTHER", "Other", "PER_ORDER"],
] as const;
const BASIS: Record<CostBasis, string> = { PER_UNIT: "per unit", PER_SHIPMENT: "per shipment", PER_ORDER: "per order", PERCENT_OF_PRICE: "% of price" };
const METHODS: { k: PricingMethod; label: string; formula: string; targetLabel: string }[] = [
  { k: "MARGIN", label: "Gross margin", formula: "Price = Cost ÷ (1 − margin)", targetLabel: "Target gross margin (%)" },
  { k: "MARKUP", label: "Markup", formula: "Price = Cost × (1 + markup)", targetLabel: "Markup on cost (%)" },
  { k: "TARGET_PROFIT", label: "Target profit", formula: "Price = Cost + profit per unit", targetLabel: "Profit per unit (USD)" },
];
let seq = 0;
const rid = () => `r${++seq}`;

export function PricingStudio({ products, customers, initial, defaultMinMargin, canQuote }: { products: StudioProduct[]; customers: { id: string; name: string }[]; initial: StudioInitial; defaultMinMargin: string; canQuote: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(initial.name ?? "");
  const [productId, setProductId] = useState(initial.productId ?? "");
  const [customerId, setCustomerId] = useState(initial.customerId ?? "");
  const [quantity, setQuantity] = useState(initial.quantity);
  const [shipments, setShipments] = useState(String(initial.shipments));
  const [method, setMethod] = useState<PricingMethod>(initial.method);
  // Percent targets are edited as whole percentages (25 = 25%).
  const [target, setTarget] = useState(initial.method === "TARGET_PROFIT" ? initial.target : pctIn(initial.target));
  const [discount, setDiscount] = useState(pctIn(initial.discountPct));
  const [rows, setRows] = useState<Row[]>(() => initial.components.map((c) => ({ ...c, id: rid() })));
  const [step, setStep] = useState("5");
  const [costStep, setCostStep] = useState("5");
  const [pins, setPins] = useState<{ label: string; r: PricingResult; qty: string }[]>([]);
  const [saving, startSave] = useTransition();

  const product = products.find((p) => p.id === productId);
  const unit = product?.unit ?? "unit";
  const minMargin = product?.minMarginPct ?? defaultMinMargin;

  const input = useMemo(
    () => ({
      quantity: quantity || "0",
      shipments: Number(shipments) || 0,
      method,
      target: method === "TARGET_PROFIT" ? target || "0" : pctOut(target),
      discountPct: pctOut(discount),
      components: rows.map((r) => ({ category: r.category, label: r.label, basis: r.basis, amount: r.basis === "PERCENT_OF_PRICE" ? pctOut(r.amount) : r.amount || "0" })),
      minMarginPct: minMargin,
    }),
    [quantity, shipments, method, target, discount, rows, minMargin],
  );

  const calc = useMemo((): { r: PricingResult } | { error: string } => {
    try {
      for (const v of [input.quantity, input.target, input.discountPct, ...input.components.map((c) => c.amount)]) if (!/^-?\d*(\.\d+)?$/.test(String(v)) || String(v) === "") return { error: "Enter numbers only (no commas or symbols)." };
      return { r: calculatePrice(input) };
    } catch (e) {
      return { error: e instanceof PricingError ? e.message : "Invalid input." };
    }
  }, [input]);
  const r = "r" in calc ? calc.r : null;

  const matrix = useMemo(() => {
    if (!r) return null;
    const p = dec(r.netPrice);
    if (p.lte(0)) return null;
    const s = dec(step || "0").div(100), cs = dec(costStep || "0");
    const prices = [-2, -1, 0, 1, 2].map((k) => p.times(new D(1).plus(s.times(k))).toDecimalPlaces(2));
    const deltas = [-2, -1, 0, 1, 2].map((k) => cs.times(k));
    try { return { prices, rows: sensitivityMatrix(input, prices, deltas) }; } catch { return null; }
  }, [r, input, step, costStep]);

  const setRow = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const addRow = (cat: (typeof CATEGORIES)[number]) => setRows((rs) => [...rs, { id: rid(), category: cat[0], label: cat[1], basis: cat[2], amount: "" }]);
  const pickProduct = (id: string) => {
    setProductId(id);
    const p = products.find((x) => x.id === id);
    const cost = p?.currentCost ?? p?.defaultCost;
    if (cost) {
      const acq = rows.find((x) => x.category === "ACQUISITION");
      if (acq) setRow(acq.id, { amount: dec(cost).toDecimalPlaces(4).toString() });
      else setRows((rs) => [{ id: rid(), category: "ACQUISITION", label: "Product acquisition", basis: "PER_UNIT", amount: dec(cost).toDecimalPlaces(4).toString() }, ...rs]);
      toast.message(`Acquisition cost set to ${fmtMoney(cost)}/${p!.unit}`, { description: p!.currentCost ? "Weighted average of current stock" : "Product default cost" });
    }
  };

  const save = (thenQuote: boolean) =>
    startSave(async () => {
      if (!r) return;
      const res = await saveScenario({ name: name || `${product?.name ?? "Scenario"} — ${fmtQty(quantity)} ${unit}`, productId: productId || null, customerId: customerId || null, quantity: input.quantity, shipments: input.shipments, method, target: String(input.target), discountPct: String(input.discountPct), components: input.components.map((c) => ({ ...c, amount: String(c.amount) })) });
      if (!res.ok) return void toast.error(res.error);
      toast.success("Scenario saved to pricing history.");
      if (thenQuote) router.push(`/sales/quotes/new?scenario=${res.id}`);
      else router.refresh();
    });

  const methodMeta = METHODS.find((m) => m.k === method)!;

  return (
    <div className="space-y-6">
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <div className="space-y-6">
        <Card title="Order & target">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Product" name="product">
              <Select name="product" value={productId} onChange={(e) => pickProduct(e.target.value)}>
                <option value="">— Generic calculation —</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="Customer (optional)" name="customer">
              <Select name="customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">— None —</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label={`Order quantity (${unit})`} name="qty"><Input name="qty" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value.trim())} className="num" /></Field>
            <Field label="Number of shipments" name="shipments" hint="Per-shipment costs are multiplied by this."><Input name="shipments" inputMode="numeric" value={shipments} onChange={(e) => setShipments(e.target.value.trim())} className="num" /></Field>
          </div>
          <div className="mt-5">
            <div className="mb-1.5 text-[12px] font-medium text-fg-2">Profit target method</div>
            <div className="grid grid-cols-3 gap-1 rounded-lg border border-line bg-surface-2 p-1" role="radiogroup" aria-label="Pricing method">
              {METHODS.map((m) => (
                <button key={m.k} role="radio" aria-checked={method === m.k} onClick={() => { if ((method === "TARGET_PROFIT") !== (m.k === "TARGET_PROFIT")) setTarget(""); setMethod(m.k); }} className={cx("rounded-md px-2 py-1.5 text-[13px] font-medium transition", method === m.k ? "bg-surface text-fg shadow-sm" : "text-fg-2 hover:text-fg")}>
                  {m.label}
                </button>
              ))}
            </div>
            <div className="mt-2 font-mono text-[11.5px] text-fg-3">{methodMeta.formula}</div>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label={methodMeta.targetLabel} name="target" hint={method === "MARGIN" ? "Must be below 100%." : undefined}><Input name="target" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value.trim())} className="num" /></Field>
            <Field label="Customer discount (%)" name="discount" hint="Applied to the recommended price."><Input name="discount" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value.trim())} className="num" /></Field>
          </div>
        </Card>

        <Card title="Cost build-up" action={<span className="text-xs text-fg-3">USD · allocated to {unit}</span>} pad={false}>
          <div className="divide-y divide-line">
            {rows.map((x) => (
              <div key={x.id} className="grid grid-cols-[1fr_120px_110px_28px] items-center gap-2 px-5 py-2">
                <input aria-label="Cost label" value={x.label} onChange={(e) => setRow(x.id, { label: e.target.value })} className={cx(inputClass, "h-8")} />
                <select aria-label="Cost basis" value={x.basis} onChange={(e) => setRow(x.id, { basis: e.target.value as CostBasis })} className={cx(inputClass, "h-8 px-2 text-xs")}>
                  {Object.entries(BASIS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <div className="relative">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-fg-3">{x.basis === "PERCENT_OF_PRICE" ? "%" : "$"}</span>
                  <input aria-label={`${x.label} amount`} inputMode="decimal" value={x.amount} onChange={(e) => setRow(x.id, { amount: e.target.value.trim() })} className={cx(inputClass, "num h-8 pl-6 text-right")} placeholder="0.00" />
                </div>
                <button onClick={() => setRows((rs) => rs.filter((y) => y.id !== x.id))} className="rounded p-1 text-fg-3 hover:bg-crit-soft hover:text-crit" aria-label={`Remove ${x.label}`}><Trash2 size={14} /></button>
              </div>
            ))}
            {!rows.length && <p className="px-5 py-4 text-sm text-fg-2">Add the costs that apply to this sale.</p>}
          </div>
          <div className="flex items-center gap-2 border-t border-line px-5 py-3">
            <Plus size={14} className="text-accent" aria-hidden />
            <select aria-label="Add a cost" value="" onChange={(e) => { const c = CATEGORIES.find((x) => x[0] === e.target.value); if (c) addRow(c); }} className="cursor-pointer bg-transparent text-[13px] font-medium text-accent outline-none">
              <option value="">Add a cost…</option>
              {CATEGORIES.map((c) => <option key={c[0]} value={c[0]}>{c[1]}</option>)}
            </select>
            <span className="ml-auto num text-xs text-fg-3">{r ? `${fmtMoney(r.landedUnitCost)} landed / ${unit}` : ""}</span>
          </div>
        </Card>
      </div>

      <div className="space-y-6 xl:sticky xl:top-20 xl:self-start">
        <section className="card rise overflow-hidden" aria-live="polite">
          <div className="bg-sidebar px-6 py-5 text-white">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold">Recommended selling price</div>
            {r ? (
              <>
                <div className="num mt-1 text-[38px] font-semibold leading-none tracking-tight">{fmtMoney(r.netPrice, "USD", 2)}<span className="ml-1.5 text-base font-normal text-sidebar-fg">/ {unit}</span></div>
                {dec(input.discountPct).gt(0) && <div className="mt-1 text-xs text-sidebar-fg">List {fmtMoney(r.recommendedPrice)} less {discount}% discount</div>}
              </>
            ) : (
              <div className="mt-2 flex items-center gap-2 text-sm text-[#f3b0b0]"><AlertTriangle size={16} />{"error" in calc && calc.error}</div>
            )}
          </div>
          {r && (
            <div className="p-5">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
                <Metric label="Landed cost" value={`${fmtMoney(r.landedUnitCost)}`} />
                <Metric label="Gross profit / unit" value={fmtMoney(r.grossProfitPerUnit)} tone={dec(r.grossProfitPerUnit).lt(0) ? "crit" : "pos"} />
                <Metric label="Gross margin" value={fmtPct(r.grossMarginPct)} tone={r.belowMinimumMargin ? "warn" : undefined} />
                <Metric label="Markup" value={fmtPct(r.markupPct)} />
                <Metric label="Break-even price" value={fmtMoney(r.breakEvenPrice)} />
                <Metric label={`Min. price (${fmtPct(minMargin, 0)} margin)`} value={r.minAcceptablePrice ? fmtMoney(r.minAcceptablePrice) : "—"} />
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3 rounded-lg bg-surface-2 p-3">
                <Metric label="Order revenue" value={fmtMoney(r.orderRevenue, "USD", 0)} />
                <Metric label="Order cost" value={fmtMoney(r.orderCost, "USD", 0)} />
                <Metric label="Est. order profit" value={fmtMoney(r.orderProfit, "USD", 0)} tone={dec(r.orderProfit).lt(0) ? "crit" : "pos"} />
              </div>
              {r.warnings.length > 0 && (
                <ul className="mt-4 space-y-1.5">
                  {r.warnings.map((w) => <li key={w} className="flex gap-2 rounded-md bg-warn-soft px-3 py-2 text-xs text-warn"><AlertTriangle size={13} className="mt-px shrink-0" />{w}</li>)}
                </ul>
              )}
              <Waterfall r={r} />
              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
                <input aria-label="Scenario name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Scenario name" className={cx(inputClass, "h-9 min-w-0 flex-1")} />
                <Button variant="secondary" onClick={() => setPins((p) => [...p.slice(-3), { label: name || `Scenario ${p.length + 1}`, r, qty: quantity }])}><Pin size={14} />Compare</Button>
                <Button variant="secondary" disabled={saving} onClick={() => save(false)}><Save size={14} />Save</Button>
                {canQuote && <Button variant="gold" disabled={saving || !productId || !customerId} title={!productId || !customerId ? "Select a product and customer to quote" : undefined} onClick={() => save(true)}><FileSignature size={14} />Create quote</Button>}
              </div>
            </div>
          )}
        </section>
        <MarketCheck productId={productId} price={r ? r.netPrice.toString() : null} landed={r ? r.landedUnitCost.toString() : null} onUse={(p) => {
          if (!r) return;
          // Hit the chosen price exactly: switch to target profit per unit and clear any discount.
          setMethod("TARGET_PROFIT"); setDiscount("0");
          setTarget(dec(p).minus(dec(r.landedUnitCost)).toDecimalPlaces(4).toString());
          toast.success(`Priced at ${fmtMoney(p)} per ${unit}`, { description: "Switched to target profit per unit so the price matches exactly." });
        }} />
      </div>
      </div>

      {matrix && r && (
        <Card className="xl:col-span-2" title="Sensitivity — order profit" action={
          <div className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-fg-3">
            <span>Steps:</span>
            <input aria-label="Price step percent" value={step} onChange={(e) => setStep(e.target.value)} className="num h-7 !w-12 rounded-md border border-line bg-surface px-1.5 text-right text-fg" />
            <span>% price ·</span>
            <input aria-label="Cost step" value={costStep} onChange={(e) => setCostStep(e.target.value)} className="num h-7 !w-12 rounded-md border border-line bg-surface px-1.5 text-right text-fg" />
            <span>$ cost</span>
          </div>
        } pad={false}>
          <div className="overflow-x-auto p-4">
            <table className="w-full min-w-[640px] border-separate border-spacing-1 text-sm">
              <thead>
                <tr>
                  <th className="px-2 text-left text-[11px] font-semibold uppercase tracking-wider text-fg-3">Unit cost Δ ↓ · Price →</th>
                  {matrix.prices.map((p, i) => <th key={i} className={cx("num px-2 py-1 text-right text-xs font-semibold", i === 2 ? "text-accent" : "text-fg-2")}>{fmtMoney(p)}</th>)}
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((row, ri) => (
                  <tr key={ri}>
                    <td className="num px-2 text-xs font-medium text-fg-2">{dec(row.costDelta).gt(0) ? "+" : ""}{fmtMoney(row.costDelta)}</td>
                    {row.cells.map((c, ci) => {
                      const m = c.margin ? Number(c.margin) : -1;
                      const tone = m < 0 ? "bg-crit-soft text-crit" : m < Number(minMargin) ? "bg-warn-soft text-warn" : "bg-pos-soft text-pos";
                      return (
                        <td key={ci} className={cx("num rounded-md px-2 py-2 text-right", tone, ri === 2 && ci === 2 && "ring-2 ring-accent")}>
                          <div className="font-semibold">{fmtMoney(c.orderProfit, "USD", 0)}</div>
                          <div className="text-[10.5px] opacity-80">{fmtPct(c.margin)}</div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-fg-3"><Info size={12} />Green meets the {fmtPct(minMargin, 0)} minimum margin, amber is profitable but below policy, red loses money. Centre cell = current inputs.</p>
          </div>
        </Card>
      )}

      {pins.length > 0 && (
        <Card className="xl:col-span-2" title="Scenario comparison" action={<button onClick={() => setPins([])} className="text-xs text-fg-3 hover:text-fg">Clear</button>} pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-fg-3"><th className="px-5 py-2">Metric</th>{pins.map((p, i) => <th key={i} className="px-4 py-2 text-right"><span className="inline-flex items-center gap-1">{p.label}<button aria-label="Remove" onClick={() => setPins((x) => x.filter((_, j) => j !== i))}><X size={12} /></button></span></th>)}</tr></thead>
              <tbody className="[&_td]:px-4 [&_td]:py-2 [&_td:first-child]:pl-5 [&_tr]:border-b [&_tr]:border-line">
                {([["Quantity", (p) => fmtQty(p.qty)], ["Landed cost", (p) => fmtMoney(p.r.landedUnitCost)], ["Net price", (p) => fmtMoney(p.r.netPrice)], ["Gross margin", (p) => fmtPct(p.r.grossMarginPct)], ["Markup", (p) => fmtPct(p.r.markupPct)], ["Order profit", (p) => fmtMoney(p.r.orderProfit, "USD", 0)]] as [string, (p: (typeof pins)[number]) => string][]).map(([l, f]) => (
                  <tr key={l}><td className="text-fg-2">{l}</td>{pins.map((p, i) => <td key={i} className="num text-right font-medium">{f(p)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "pos" | "crit" | "warn" }) {
  return (
    <div>
      <div className="text-[11.5px] text-fg-2">{label}</div>
      <div className={cx("num mt-0.5 text-[15px] font-semibold", tone === "pos" ? "text-pos" : tone === "crit" ? "text-crit" : tone === "warn" ? "text-warn" : "text-fg")}>{value}</div>
    </div>
  );
}

function Waterfall({ r }: { r: PricingResult }) {
  const price = Number(r.netPrice);
  if (!(price > 0)) return null;
  const items = r.breakdown.filter((b) => Number(b.perUnit) > 0);
  return (
    <div className="mt-5">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-fg-3">Where each {fmtMoney(r.netPrice)} goes</div>
      <div className="flex h-3 overflow-hidden rounded-full bg-surface-2">
        {items.map((b, i) => <div key={i} title={`${b.label}: ${fmtMoney(b.perUnit)}`} style={{ width: `${(Number(b.perUnit) / price) * 100}%`, background: `color-mix(in srgb, var(--accent) ${100 - i * 9}%, var(--surface-2))` }} />)}
        {Number(r.grossProfitPerUnit) > 0 && <div title="Gross profit" className="bg-sulphur" style={{ width: `${(Number(r.grossProfitPerUnit) / price) * 100}%` }} />}
      </div>
      <ul className="mt-3 space-y-1 text-xs">
        {items.map((b, i) => (
          <li key={i} className="flex justify-between gap-2 text-fg-2"><span className="truncate">{b.label} <span className="text-fg-3">({BASIS[b.basis]})</span></span><span className="num">{fmtMoney(b.perUnit)} · {((Number(b.perUnit) / price) * 100).toFixed(1)}%</span></li>
        ))}
        <li className="flex justify-between gap-2 font-medium text-gold"><span>Gross profit</span><span className="num">{fmtMoney(r.grossProfitPerUnit)} · {fmtPct(r.grossMarginPct)}</span></li>
      </ul>
    </div>
  );
}

function pctIn(fraction: string) {
  if (!fraction) return "";
  return dec(fraction).times(100).toDecimalPlaces(4).toString();
}
function pctOut(pct: string) {
  if (!pct) return "0";
  if (!/^-?\d*(\.\d+)?$/.test(pct)) return pct; // let validation surface the error
  return dec(pct).div(100).toString();
}
