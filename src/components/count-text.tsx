"use client";

import { useEffect, useRef, useState } from "react";

/** Counts up the first number inside a formatted string ("$713,589", "8,987.5 MT", "25.0%"), keeping its format. */
export function CountText({ text }: { text: string }) {
  const m = text.match(/-?[\d,]*\.?\d+/);
  const [shown, setShown] = useState(text);
  const ran = useRef(false);
  useEffect(() => {
    if (!m || ran.current || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    ran.current = true;
    const raw = m[0], target = Number(raw.replace(/,/g, ""));
    if (!Number.isFinite(target) || target === 0) return;
    const dp = raw.includes(".") ? raw.split(".")[1].length : 0, commas = raw.includes(",");
    const fmt = (v: number) => (commas ? v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp }) : v.toFixed(dp));
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 900);
      setShown(text.replace(raw, fmt(target * (1 - Math.pow(1 - k, 4)))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  return <>{shown}</>;
}
