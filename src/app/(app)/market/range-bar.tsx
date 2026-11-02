import type { Dec } from "@/lib/decimal";

type Mark = { label: string; value: Dec; tone: "gold" | "accent" | "crit" | "muted" };
/** Horizontal price scale with the suggested range shaded and reference markers. */
export function RangeBar({ low, mid, high, marks, fmt }: { low: Dec; mid: Dec; high: Dec; marks: Mark[]; fmt: (v: Dec) => string }) {
  const vals = [low, high, ...marks.map((m) => m.value)].map((v) => v.toNumber());
  const min = Math.min(...vals), max = Math.max(...vals);
  const pad = (max - min) * 0.12 || max * 0.1 || 1;
  const lo = min - pad, hi = max + pad;
  const pct = (v: Dec) => `${((v.toNumber() - lo) / (hi - lo)) * 100}%`;
  const color = { gold: "var(--gold)", accent: "var(--accent)", crit: "var(--crit)", muted: "var(--text-3)" };
  return (
    <div className="pt-9 pb-14">
      <div className="relative h-3 rounded-full bg-surface-2">
        <div className="range-band absolute inset-y-0 rounded-full" style={{ left: pct(low), width: `calc(${pct(high)} - ${pct(low)})`, background: "linear-gradient(90deg, color-mix(in srgb, var(--gold) 45%, transparent), var(--gold), color-mix(in srgb, var(--gold) 45%, transparent))" }} />
        <div className="absolute -top-7 -translate-x-1/2 whitespace-nowrap text-center" style={{ left: pct(mid) }}>
          <div className="num text-sm font-semibold text-gold">{fmt(mid)}</div>
        </div>
        <div className="absolute top-1/2 h-5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded bg-[#c9b81c] shadow" style={{ left: pct(mid) }} />
        {marks.map((m, i) => (
          <div key={m.label} className="range-mark absolute top-1/2 -translate-x-1/2" style={{ left: pct(m.value), animationDelay: `${0.3 + i * 0.12}s` }}>
            <div className="mx-auto h-4 w-4 -translate-y-1/2 rounded-full border-2 border-surface shadow" style={{ background: color[m.tone] }} />
            <div className="absolute left-1/2 top-3 -translate-x-1/2 whitespace-nowrap text-center text-[11px] leading-tight" style={{ top: i % 2 ? 26 : 8 }}>
              <div className="font-medium text-fg-2">{m.label}</div>
              <div className="num text-fg-3">{fmt(m.value)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
