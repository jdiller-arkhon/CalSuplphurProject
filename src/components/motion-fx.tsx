"use client";
import { useEffect } from "react";

/** One delegated pointer listener: hero parallax + spotlight, card tilt + shine. */
export function MotionFx() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !matchMedia("(pointer: fine)").matches) return;
    let raf = 0, ev: PointerEvent | null = null, lastCard: HTMLElement | null = null;
    const apply = () => {
      raf = 0; if (!ev) return;
      const t = ev.target as HTMLElement;
      const hero = t.closest?.(".page-hero") as HTMLElement | null;
      if (hero) {
        const r = hero.getBoundingClientRect();
        const x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
        hero.style.setProperty("--mx", `${x * 100}%`); hero.style.setProperty("--my", `${y * 100}%`);
        hero.style.setProperty("--px", (x - .5).toFixed(3)); hero.style.setProperty("--py", (y - .5).toFixed(3));
      }
      const card = t.closest?.("main .card") as HTMLElement | null;
      if (lastCard && lastCard !== card) { lastCard.style.removeProperty("--rx"); lastCard.style.removeProperty("--ry"); lastCard.classList.remove("is-tilt"); }
      if (card && card.offsetWidth < 560 && !card.querySelector("table, input, select, textarea")) {
        const r = card.getBoundingClientRect();
        const x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
        card.classList.add("is-tilt");
        card.style.setProperty("--rx", `${((.5 - y) * 7).toFixed(2)}deg`); card.style.setProperty("--ry", `${((x - .5) * 9).toFixed(2)}deg`);
        card.style.setProperty("--gx", `${x * 100}%`); card.style.setProperty("--gy", `${y * 100}%`);
        lastCard = card;
      } else lastCard = card && card.classList.contains("is-tilt") ? card : null;
    };
    const onMove = (e: PointerEvent) => { ev = e; if (!raf) raf = requestAnimationFrame(apply); };
    const onLeave = (e: PointerEvent) => { const h = (e.target as HTMLElement).closest?.(".page-hero") as HTMLElement | null; if (h && !h.contains(e.relatedTarget as Node)) { h.style.setProperty("--px", "0"); h.style.setProperty("--py", "0"); } };
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerout", onLeave, { passive: true });
    return () => { document.removeEventListener("pointermove", onMove); document.removeEventListener("pointerout", onLeave); cancelAnimationFrame(raf); };
  }, []);
  return null;
}
