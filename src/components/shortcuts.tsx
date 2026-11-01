"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { NAV, SETTINGS_ITEM } from "./nav";

/** Second key after "g" → destination. */
const GO: Record<string, string> = { o: "/", i: "/inventory", p: "/products", r: "/operations", l: "/logistics", c: "/pricing", s: "/sales", u: "/customers", v: "/suppliers", b: "/purchasing", a: "/analytics", e: "/reports", d: "/documents", n: "/notifications", ",": "/settings/preferences" };
const label = (href: string) => [...NAV.flatMap((g) => g.items), SETTINGS_ITEM, { href: "/notifications", label: "Notifications" }, { href: "/settings/preferences", label: "Preferences" }].find((i) => i.href === href)?.label ?? href;

export function Shortcuts({ perms, hidden, onToggleSidebar }: { perms: string[]; hidden: string[]; onToggleSidebar: () => void }) {
  const router = useRouter();
  const [help, setHelp] = useState(false);
  const [pending, setPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const allowedHref = (href: string) => { const i = NAV.flatMap((g) => g.items).find((x) => x.href === href); return !i?.perm || perms.includes(i.perm); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (pending) {
        setPending(false); clearTimeout(timer.current);
        const href = GO[e.key.toLowerCase()];
        if (href && allowedHref(href)) { e.preventDefault(); router.push(href); }
        return;
      }
      if (e.key === "g") { setPending(true); timer.current = setTimeout(() => setPending(false), 1200); return; }
      if (e.key === "?") { e.preventDefault(); setHelp((h) => !h); return; }
      if (e.key === "Escape") { setHelp(false); return; }
      if (e.key === "[") { e.preventDefault(); onToggleSidebar(); return; }
      if (e.key === "/") { e.preventDefault(); window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true })); return; }
      if (e.key === "t") {
        const h = document.documentElement; const next = h.getAttribute("data-theme") === "dark" ? "light" : "dark";
        h.setAttribute("data-theme", next); document.cookie = `theme=${next};path=/;max-age=31536000;samesite=lax`;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <>
      {pending && <div className="kbd-toast" role="status">g → …</div>}
      {help && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => setHelp(false)}>
          <div className="card pop w-full max-w-2xl p-6" role="dialog" aria-label="Keyboard shortcuts" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">Keyboard shortcuts</h2><kbd className="kbd">Esc</kbd></div>
            <div className="grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
              {[["⌘K or /", "Search & commands"], ["?", "Show this help"], ["[", "Collapse / expand sidebar"], ["t", "Toggle light / dark"]].map(([k, v]) => <Row key={k} k={k} v={v} />)}
              {Object.entries(GO).filter(([, h]) => allowedHref(h) && !hidden.includes(h)).map(([k, h]) => <Row key={k} k={`g ${k}`} v={label(h)} />)}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
const Row = ({ k, v }: { k: string; v: string }) => <div className="flex items-center justify-between border-b border-line/60 py-1.5"><span className="text-fg-2">{v}</span><span className="flex gap-1">{k.split(" ").map((x, i) => <kbd key={i} className="kbd">{x}</kbd>)}</span></div>;
