"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, Sparkles, ShieldCheck, Loader2, Database, Info } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, cx, inputClass } from "@/components/ui";
import type { InsightAnswer } from "@/server/services/insights";

type Msg = { q: string; a?: InsightAnswer; error?: string };
const EXAMPLES = ["What is our current available inventory?", "Which products have the highest gross margins?", "What price should we charge to achieve a 30% margin on prill?", "Which customers purchased the most product this quarter?", "What inventory is committed to pending orders?", "How much profit would we make on a 500 ton order of prill?", "Which shipments are most expensive per ton?", "What changed in revenue compared with last month?"];

export function InsightsChat({ ask, toggle, status, canToggle }: { ask: (q: string) => Promise<InsightAnswer | { error: string }>; toggle: (on: boolean) => Promise<{ ok: boolean; error?: string }>; status: { ready: boolean; enabled: boolean; model?: string; reason?: string }; canToggle: boolean }) {
  const router = useRouter();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const send = (text: string) => {
    if (!text.trim() || busy) return;
    setQ("");
    setMsgs((m) => [...m, { q: text }]);
    start(async () => {
      const r = await ask(text);
      setMsgs((m) => m.map((x, i) => (i === m.length - 1 ? ("error" in r ? { ...x, error: r.error } : { ...x, a: r }) : x)));
      requestAnimationFrame(() => end.current?.scrollIntoView({ behavior: "smooth" }));
    });
  };
  const usable = status.enabled && status.ready;
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card pad={false}>
        <div className="min-h-[420px] space-y-6 p-6">
          {!msgs.length && (
            <div className="py-6 text-center">
              <Sparkles className="mx-auto mb-3 text-gold" size={26} />
              <p className="font-medium">Ask about your inventory, sales, margins, pricing or freight.</p>
              <p className="mt-1 text-sm text-fg-2">Answers come from your records. The figures are calculated by CSC Command, not by the model.</p>
              <div className="mx-auto mt-6 flex max-w-2xl flex-wrap justify-center gap-2">
                {EXAMPLES.map((e) => <button key={e} disabled={!usable} onClick={() => send(e)} className="rounded-full border border-line px-3 py-1.5 text-xs text-fg-2 hover:border-accent hover:text-accent disabled:opacity-50">{e}</button>)}
              </div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className="space-y-3">
              <div className="flex justify-end"><div className="max-w-[80%] rounded-2xl rounded-br-sm bg-accent px-4 py-2.5 text-sm text-white">{m.q}</div></div>
              {!m.a && !m.error && <div className="flex items-center gap-2 text-sm text-fg-3"><Loader2 size={14} className="animate-spin" />Looking it up… (a local model on a CPU can take 10–30 seconds)</div>}
              {m.error && <div className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">{m.error}</div>}
              {m.a && (
                <div className="space-y-3">
                  <div className="max-w-[90%] rounded-2xl rounded-bl-sm border border-line bg-surface px-4 py-3 text-[14.5px] leading-relaxed">{m.a.answer}</div>
                  {m.a.note && <p className="flex items-center gap-1.5 text-xs text-fg-3"><Info size={12} />{m.a.note}</p>}
                  {m.a.result && (
                    <details className="rounded-xl border border-line bg-surface-2/50 text-sm" open={!!m.a.result.table && m.a.result.table.rows.length <= 8}>
                      <summary className="flex cursor-pointer items-center gap-2 px-4 py-2.5 text-xs font-medium text-fg-2"><Database size={13} />Source: {m.a.result.source} · {m.a.result.title}</summary>
                      <div className="border-t border-line px-4 py-3">
                        {m.a.result.table && m.a.result.table.rows.length > 0 && (
                          <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-left text-fg-3">{m.a.result.table.head.map((h) => <th key={h} className="py-1 pr-4 font-semibold">{h}</th>)}</tr></thead><tbody>{m.a.result.table.rows.map((r, ri) => <tr key={ri} className="border-t border-line">{r.map((c, ci) => <td key={ci} className={cx("py-1.5 pr-4", ci > 0 && "num")}>{c}</td>)}</tr>)}</tbody></table></div>
                        )}
                        {m.a.result.assumptions?.map((x) => <p key={x} className="mt-2 text-xs text-fg-3">Assumption: {x}</p>)}
                      </div>
                    </details>
                  )}
                </div>
              )}
            </div>
          ))}
          <div ref={end} />
        </div>
        <form onSubmit={(e) => { e.preventDefault(); send(q); }} className="flex gap-2 border-t border-line p-4">
          <input value={q} onChange={(e) => setQ(e.target.value)} disabled={!usable || busy} placeholder={usable ? "Ask a question…" : "The assistant is not available"} aria-label="Question" className={cx(inputClass, "h-11 flex-1")} maxLength={500} />
          <Button type="submit" disabled={!usable || busy || !q.trim()} className="h-11"><Send size={14} />Ask</Button>
        </form>
      </Card>
      <Card title="About this assistant">
        <div className="space-y-3 text-sm text-fg-2">
          <p className="flex items-start gap-2"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-pos" />Runs on a model hosted on your own server. Questions and data are not sent to any outside AI company.</p>
          <p>Read-only: it can't change anything. It only sees data your role allows.</p>
          <p>Every number in an answer is checked against your records. If the model's wording includes a number that isn't in the data, the verified figures are shown instead.</p>
          <div className="rounded-lg bg-surface-2 p-3 text-xs">
            <div>Status: {status.ready ? <span className="font-medium text-pos">model connected</span> : <span className="font-medium text-warn">{status.reason}</span>}</div>
            {status.model && <div className="mt-1 break-all text-fg-3">Model: {status.model}</div>}
            <div className="mt-1">Assistant: {status.enabled ? "on" : "off"}</div>
          </div>
          {canToggle && <Button variant={status.enabled ? "secondary" : "gold"} onClick={async () => { const r = await toggle(!status.enabled); if (!r.ok) toast.error(r.error ?? "Failed"); else { toast.success(status.enabled ? "Assistant turned off." : "Assistant turned on."); router.refresh(); } }}>{status.enabled ? "Turn off" : "Turn on assistant"}</Button>}
        </div>
      </Card>
    </div>
  );
}
