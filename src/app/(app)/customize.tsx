"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUp, ArrowDown, Eye, EyeOff, LayoutGrid, Maximize2, Minimize2, RotateCcw } from "lucide-react";
import { Modal } from "@/components/forms";
import { Button, cx } from "@/components/ui";
import { WIDGETS, WIDGET_IDS, type Prefs, type WidgetId } from "@/lib/prefs";
import { patchPreferences } from "@/server/actions/prefs";

type Layout = Prefs["overview"];

export function OverviewCustomizer({ layout, available }: { layout: Layout; available: Record<string, boolean> }) {
  return (
    <Modal title="Customize Overview" trigger={(open) => <Button variant="secondary" size="sm" onClick={open}><LayoutGrid size={14} /> Customize</Button>}>
      {(close) => <Editor initial={layout} available={available} close={close} />}
    </Modal>
  );
}

function Editor({ initial, available, close }: { initial: Layout; available: Record<string, boolean>; close: () => void }) {
  const [l, setL] = useState<Layout>(initial);
  const [busy, start] = useTransition();
  const router = useRouter();
  const move = (i: number, d: -1 | 1) => setL((x) => { const o = [...x.order]; const j = i + d; if (j < 0 || j >= o.length) return x; [o[i], o[j]] = [o[j], o[i]]; return { ...x, order: o }; });
  const toggle = (k: "hidden" | "wide", w: WidgetId) => setL((x) => ({ ...x, [k]: x[k].includes(w) ? x[k].filter((v) => v !== w) : [...x[k], w] }));
  const save = (next: Layout) => start(async () => { await patchPreferences({ overview: next }); toast.success("Overview layout saved."); close(); router.refresh(); });

  return (
    <div>
      <p className="mb-3 text-sm text-fg-2">Choose which sections appear, their order, and which span two columns.</p>
      <ul className="space-y-1.5">
        {l.order.map((w, i) => {
          const off = l.hidden.includes(w), na = !available[w];
          return (
            <li key={w} className={cx("flex items-center gap-2 rounded-xl border border-line px-3 py-2 transition", off && "opacity-55")}>
              <span className="w-5 text-center text-xs font-semibold text-fg-3">{i + 1}</span>
              <span className="min-w-0 flex-1 text-sm font-medium">{WIDGETS[w]}{na && <span className="ml-2 text-xs font-normal text-fg-3">(not available for your role)</span>}</span>
              {w !== "pipeline" && <IconBtn label={l.wide.includes(w) ? "Make normal width" : "Make wide"} on={l.wide.includes(w)} onClick={() => toggle("wide", w)}>{l.wide.includes(w) ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</IconBtn>}
              <IconBtn label={off ? "Show" : "Hide"} on={!off} onClick={() => toggle("hidden", w)}>{off ? <EyeOff size={14} /> : <Eye size={14} />}</IconBtn>
              <IconBtn label="Move up" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp size={14} /></IconBtn>
              <IconBtn label="Move down" onClick={() => move(i, 1)} disabled={i === l.order.length - 1}><ArrowDown size={14} /></IconBtn>
            </li>
          );
        })}
      </ul>
      <div className="mt-5 flex items-center gap-2">
        <Button onClick={() => save(l)} disabled={busy}>Save layout</Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <Button variant="ghost" className="ml-auto" disabled={busy} onClick={() => save({ order: WIDGET_IDS, hidden: [], wide: ["financial"] })}><RotateCcw size={14} /> Reset</Button>
      </div>
    </div>
  );
}

const IconBtn = ({ children, label, onClick, on, disabled }: { children: React.ReactNode; label: string; onClick: () => void; on?: boolean; disabled?: boolean }) => (
  <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} className={cx("rounded-lg p-1.5 transition hover:bg-surface-2 disabled:opacity-30", on ? "text-accent" : "text-fg-3")}>{children}</button>
);
