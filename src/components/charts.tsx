"use client";

import { useRouter } from "next/navigation";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";

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
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.accent} stopOpacity={0.22} />
              <stop offset="100%" stopColor={C.accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: C.text, fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis yAxisId="l" tick={{ fill: C.text, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={compact} width={48} />
          <YAxis yAxisId="r" orientation="right" tick={{ fill: C.text, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} width={40} />
          <Tooltip content={<Tip />} />
          <Area yAxisId="l" type="monotone" dataKey="revenue" name="Revenue" stroke={C.accent} strokeWidth={2} fill="url(#rev)" />
          <Bar yAxisId="l" dataKey="profit" name="Gross profit" fill={C.gold} radius={[3, 3, 0, 0]} maxBarSize={22} />
          <Line yAxisId="r" type="monotone" dataKey="margin" name="Margin" stroke={C.pos} strokeWidth={1.5} dot={false} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
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
          <YAxis type="category" dataKey="label" width={140} tick={{ fill: "var(--text-2)", fontSize: 12 }} tickLine={false} axisLine={false} />
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
          <YAxis type="category" dataKey="label" width={140} tick={{ fill: "var(--text-2)", fontSize: 12 }} tickLine={false} axisLine={false} />
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
