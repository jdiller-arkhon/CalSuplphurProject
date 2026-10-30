"use client";

import { useEffect, useRef, useState } from "react";

/** Animates a number from 0 to its value once on mount; renders the final value for no-JS and reduced motion. */
export function CountUp({ value, format }: { value: number; format: "usd" | "num" | "pct" }) {
  const fmt = (v: number) =>
    format === "usd" ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v)
    : format === "pct" ? `${v.toFixed(1)}%`
    : new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(v);
  const [shown, setShown] = useState(value);
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    ran.current = true;
    const t0 = performance.now(), dur = 1100;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      setShown(value * (1 - Math.pow(1 - k, 4)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className="num">{fmt(shown)}</span>;
}
