"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button, cx } from "./ui";

export type ActionState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string>; message?: string; redirect?: string; data?: unknown } | null;
export type ActionFn = (prev: ActionState, fd: FormData) => Promise<ActionState>;

export function ActionForm({ action, children, className, onSuccess, resetOnSuccess, confirm }: { action: ActionFn; children: ReactNode | ((s: ActionState) => ReactNode); className?: string; onSuccess?: (s: ActionState) => void; resetOnSuccess?: boolean; confirm?: string }) {
  const [state, run] = useActionState(action, null);
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state) return;
    if (state.error) toast.error(state.error);
    if (state.ok) {
      if (state.message) toast.success(state.message);
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.(state);
      if (state.redirect) router.push(state.redirect);
      else router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <form
      ref={ref}
      action={run}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      <IdempotencyKey />
      {typeof children === "function" ? children(state) : children}
    </form>
  );
}

/** A per-render key so a double-click or retried submit is processed once by idempotent services. */
function IdempotencyKey() {
  const [k] = useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random())));
  return <input type="hidden" name="idempotencyKey" value={k} />;
}

export function Submit({ children, variant = "primary", size = "md", className }: { children: ReactNode; variant?: "primary" | "secondary" | "danger" | "gold" | "ghost"; size?: "sm" | "md"; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} disabled={pending} className={className} aria-busy={pending}>
      {pending && <Loader2 size={14} className="animate-spin" aria-hidden />}
      {children}
    </Button>
  );
}

export function FieldError({ state, name }: { state: ActionState; name: string }) {
  const e = state?.fieldErrors?.[name];
  return e ? <span className="mt-1 block text-xs text-crit">{e}</span> : null;
}

/** Native <dialog> with accessible focus handling. */
export function Modal({ trigger, title, children, wide }: { trigger: (open: () => void) => ReactNode; title: string; children: (close: () => void) => ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const show = () => {
    setOpen(true);
    requestAnimationFrame(() => ref.current?.showModal());
  };
  const close = () => {
    ref.current?.close();
    setOpen(false);
  };
  return (
    <>
      {trigger(show)}
      <dialog ref={ref} onClose={() => setOpen(false)} className={cx("card m-auto w-[calc(100%-2rem)] p-0 text-fg shadow-[var(--shadow-lg)]", wide ? "max-w-3xl" : "max-w-lg")} aria-label={title}>
        {open && (
          <div>
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <h2 className="text-sm font-semibold">{title}</h2>
              <button type="button" onClick={close} className="rounded-md px-2 py-1 text-fg-3 hover:bg-surface-2 hover:text-fg" aria-label="Close">
                ✕
              </button>
            </div>
            <div className="max-h-[75vh] overflow-y-auto p-5">{children(close)}</div>
          </div>
        )}
      </dialog>
    </>
  );
}
