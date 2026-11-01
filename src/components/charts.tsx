"use client";

import { useRouter } from "next/navigation";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell, ReferenceLine, ReferenceArea, ScatterChart, Scatter, ZAxis, Legend, ComposedChart, Line } from "recharts";

const C = { accent: "var(--accent)", gold: "var(--gold)", pos: "var(--pos)", grid: "var(--border)", text: "var(--text-3)" };
const compact = (v: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v);
const usd = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);

function Tip({ active, payload, label, money = true }: { active?: boolean; payload?: { name: string; value: number; color: string; dataKey: string }[]; label?: string; money?: boolean }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card px-3 py-2 text-xs shadow-[var(--shadow-lg)]">
      <div className="mb-1 font-medium text-fg">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-fg-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span>{p.name}</span>
          <span className="num ml-auto pl-4 font-medium text-fg">{p.dataKey === "margin" ? `${p.value.toFixed(1)}%` : money ? usd(p.value) : compact(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export type TrendPoint = { label: string; revenue: number; profit: number; margin: number | null };

export function RevenueTrend({ data, height = 260 }: { data: TrendPoint[]; height?: number }) {
  return (
    <div style={{ height }} role="img" aria-label="Revenue and gross profit by month">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={3}>
          <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: C.text, fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: C.text, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={compact} width={48} />
          <Tooltip content={<Tip />} cursor={{ fill: "var(--surface-2)" }} />
          <Bar dataKey="revenue" name="Revenue" fill={C.accent} radius={[4, 4, 0, 0]} maxBarSize={26} />
          <Bar dataKey="profit" name="Gross profit" fill={C.gold} radius={[4, 4, 0, 0]} maxBarSize={26} />
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-2 flex gap-4 text-xs text-fg-2" aria-hidden>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-accent" />Revenue</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-gold" />Gross profit</span>
      </div>
    </div>
  );
}

export function HBar({ data, money = true, height, color = "accent" }: { data: { label: string; value: number; href?: string }[]; money?: boolean; height?: number; color?: "accent" | "gold" | "pos" }) {
  const router = useRouter();
  const h = height ?? Math.max(120, data.length * 34 + 16);
  return (
    <div style={{ height: h }} role="img" aria-label="Bar chart">
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="label" width={168} tick={{ fill: "var(--text-2)", fontSize: 12 }} tickLine={false} axisLine={false} />
          <Tooltip content={<Tip money={money} />} cursor={{ fill: "var(--surface-2)" }} />
          <Bar dataKey="value" name={money ? "Value" : "Quantity"} radius={[0, 4, 4, 0]} maxBarSize={18} onClick={(d: { payload?: { href?: string } }) => d.payload?.href && router.push(d.payload.href)} className="cursor-pointer">
            {data.map((_, i) => (
              <Cell key={i} fill={C[color]} fillOpacity={1 - i * 0.06} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StockBars({ data }: { data: { label: string; reserved: number; available: number; href?: string }[] }) {
  const router = useRouter();
  return (
    <div style={{ height: Math.max(120, data.length * 36 + 30) }} role="img" aria-label="Available versus reserved stock by product">
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="label" width={168} tick={{ fill: "var(--text-2)", fontSize: 12 }} tickLine={false} axisLine={false} />
          <Tooltip content={<Tip money={false} />} cursor={{ fill: "var(--surface-2)" }} />
          <Bar dataKey="available" name="Available" stackId="s" fill={C.accent} maxBarSize={18} onClick={(d: { payload?: { href?: string } }) => d.payload?.href && router.push(d.payload.href)} />
          <Bar dataKey="reserved" name="Reserved" stackId="s" fill={C.gold} radius={[0, 4, 4, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Spark({ data, height = 40 }: { data: number[]; height?: number }) {
  return (
    <div style={{ height }} aria-hidden>
      <ResponsiveContainer>
        <AreaChart data={data.map((v, i) => ({ i, v }))}>
          <Area type="monotone" dataKey="v" stroke={C.accent} fill={C.accent} fillOpacity={0.1} strokeWidth={1.5} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}


const num = (v: number, d = 2) => new Intl.NumberFormat("en-US", { maximumFractionDigits: d }).format(v);

/** Period values for a tracker, with an optional target line. */
export function TrackerChart({ data, unit, target, kind = "bar", decimals = 2, height = 260 }: { data: { label: string; value: number | null }[]; unit: string; target?: number | null; kind?: "bar" | "line"; decimals?: number; height?: number }) {
  const tip = ({ active, payload, label }: { active?: boolean; payload?: readonly { value?: unknown }[]; label?: unknown }) =>
    active && payload?.length && payload[0].value != null ? <div className="card px-3 py-2 text-xs shadow-[var(--shadow-lg)]"><div className="font-medium text-fg">{String(label)}</div><div className="num text-fg-2">{num(Number(payload[0].value), decimals)} {unit}</div></div> : null;
  return (
    <div style={{ height }} role="img" aria-label={`Tracked values in ${unit}`}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <defs><linearGradient id="trk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.accent} stopOpacity={0.9} /><stop offset="1" stopColor={C.accent} stopOpacity={0.45} /></linearGradient></defs>
          <CartesianGrid vertical={false} stroke={C.grid} strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={{ fill: C.text, fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: C.text, fontSize: 11 }} axisLine={false} tickLine={false} width={56} tickFormatter={(v) => compact(v)} />
          <Tooltip content={tip} cursor={{ fill: "var(--accent-soft)", opacity: 0.4 }} />
          {kind === "bar" ? <Bar dataKey="value" fill="url(#trk)" radius={[5, 5, 0, 0]} maxBarSize={44} animationDuration={900} /> : <Line type="monotone" dataKey="value" stroke={C.accent} strokeWidth={2.5} dot={{ r: 3, fill: C.accent }} connectNulls animationDuration={900} />}
          {target != null && <ReferenceLine y={target} stroke={C.gold} strokeDasharray="5 4" strokeWidth={1.5} label={{ value: `Target ${num(target, decimals)}`, position: "insideTopRight", fill: C.gold, fontSize: 11 }} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Market observations over time vs own sales and supplier costs, with the suggested range shaded. */
export function MarketChart({ points, band, floor, unit, height = 300 }: { points: { t: number; price: number; kind: "market" | "sale" | "purchase"; source: string }[]; band?: { low: number; mid: number; high: number } | null; floor?: number | null; unit: string; height?: number }) {
  const series = [
    { k: "market", name: "Market prices", color: C.gold },
    { k: "sale", name: "Our sales", color: C.accent },
    { k: "purchase", name: "Our purchase costs", color: "var(--text-3)" },
  ] as const;
  const date = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const tip = ({ active, payload }: { active?: boolean; payload?: readonly { payload?: unknown }[] }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload as { t: number; price: number; source: string; kind: string };
    return <div className="card px-3 py-2 text-xs shadow-[var(--shadow-lg)]"><div className="font-medium text-fg">{usd2(p.price)} / {unit}</div><div className="text-fg-2">{p.source}</div><div className="text-fg-3">{date(p.t)} · {series.find((s) => s.k === p.kind)?.name}</div></div>;
  };
  return (
    <div style={{ height }} role="img" aria-label="Market price observations over time">
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 10, right: 16, left: 4, bottom: 0 }}>
          <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
          <XAxis type="number" dataKey="t" domain={["dataMin - 86400000", "dataMax + 86400000"]} tickFormatter={date} tick={{ fill: C.text, fontSize: 11 }} axisLine={false} tickLine={false} scale="time" />
          <YAxis type="number" dataKey="price" tick={{ fill: C.text, fontSize: 11 }} axisLine={false} tickLine={false} width={60} tickFormatter={(v) => usd(v)} domain={["auto", "auto"]} />
          <ZAxis range={[70, 70]} />
          {band && <ReferenceArea y1={band.low} y2={band.high} fill={C.gold} fillOpacity={0.1} stroke="none" />}
          {band && <ReferenceLine y={band.mid} stroke={C.gold} strokeDasharray="5 4" label={{ value: `Market mid ${usd2(band.mid)}`, position: "insideTopLeft", fill: C.gold, fontSize: 11 }} />}
          {floor != null && <ReferenceLine y={floor} stroke="var(--crit)" strokeDasharray="2 4" label={{ value: `Min-margin floor ${usd2(floor)}`, position: "insideBottomLeft", fill: "var(--crit)", fontSize: 11 }} />}
          <Tooltip content={tip} cursor={{ strokeDasharray: "3 3" }} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: "var(--text-2)" }} />
          {series.map((s) => <Scatter key={s.k} name={s.name} data={points.filter((p) => p.kind === s.k)} fill={s.color} animationDuration={700} />)}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
const usd2 = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
