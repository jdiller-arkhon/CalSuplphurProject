import Link from "next/link";
import { clsx } from "clsx";
import type { ComponentProps, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export const cx = clsx;

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "gold";
const btn: Record<BtnVariant, string> = {
  primary: "btn-shine bg-gradient-to-b from-[#4573a0] to-accent text-white shadow-[0_6px_16px_-6px_rgba(54,93,131,.7)] hover:brightness-110",
  secondary: "bg-surface text-fg border border-line hover:bg-surface-2",
  ghost: "text-fg-2 hover:bg-surface-2 hover:text-fg",
  danger: "bg-crit text-white hover:brightness-110",
  gold: "btn-shine bg-gradient-to-b from-[#e2bd78] to-gold text-[#101d2e] shadow-[0_6px_18px_-6px_rgba(196,154,82,.8)] hover:brightness-105",
};
export function buttonClass(variant: BtnVariant = "primary", size: "sm" | "md" = "md") {
  return cx(
    "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap",
    size === "sm" ? "h-8 px-2.5 text-[13px]" : "h-9 px-3.5 text-sm",
    btn[variant],
  );
}
export function Button({ variant = "primary", size = "md", className, ...p }: ComponentProps<"button"> & { variant?: BtnVariant; size?: "sm" | "md" }) {
  return <button {...p} className={cx(buttonClass(variant, size), className)} />;
}
export function LinkButton({ variant = "primary", size = "md", className, ...p }: ComponentProps<typeof Link> & { variant?: BtnVariant; size?: "sm" | "md" }) {
  return <Link {...p} className={cx(buttonClass(variant, size), className)} />;
}

export function Card({ className, children, title, action, pad = true }: { className?: string; children: ReactNode; title?: ReactNode; action?: ReactNode; pad?: boolean }) {
  return (
    <section className={cx("card rise", className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
          <h2 className="text-[13.5px] font-semibold tracking-tight text-fg">{title}</h2>
          {action}
        </div>
      )}
      <div className={pad ? "p-5" : ""}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, description, actions, crumbs }: { title: string; description?: ReactNode; actions?: ReactNode; crumbs?: { label: string; href?: string }[] }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {crumbs && (
          <nav aria-label="Breadcrumb" className="mb-1.5 flex items-center gap-1.5 text-xs text-fg-3">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <span aria-hidden>/</span>}
                {c.href ? <Link className="hover:text-fg" href={c.href}>{c.label}</Link> : <span className="text-fg-2">{c.label}</span>}
              </span>
            ))}
          </nav>
        )}
        <h1 className="truncate text-[24px] font-semibold tracking-tight text-fg">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-fg-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const tones = {
  neutral: "bg-surface-2 text-fg-2 border-line",
  accent: "bg-accent-soft text-accent border-transparent",
  pos: "bg-pos-soft text-pos border-transparent",
  warn: "bg-warn-soft text-warn border-transparent",
  crit: "bg-crit-soft text-crit border-transparent",
  gold: "bg-gold-soft text-gold border-transparent",
};
export type Tone = keyof typeof tones;
export const humanize = (v: string) => {
  const t = v.replace(/_/g, " ").toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
};
export function Badge({ tone = "neutral", children, dot }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11.5px] font-medium", tones[tone])}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" aria-hidden />}
      {typeof children === "string" && (children.includes("_") || /[a-z]/.test(children) || children.length > 4) ? humanize(children) : children}
    </span>
  );
}

export function statusTone(s: string): Tone {
  if (["APPROVED", "COMPLETED", "DELIVERED", "RECEIVED", "ACTIVE", "CONVERTED"].includes(s)) return "pos";
  if (["PENDING_APPROVAL", "PARTIALLY_SHIPPED", "PARTIALLY_RECEIVED", "IN_TRANSIT", "ALLOCATED", "ISSUED"].includes(s)) return "warn";
  if (["REJECTED", "CANCELLED", "EXPIRED"].includes(s)) return "crit";
  if (["SHIPPED", "OPEN", "PLANNED"].includes(s)) return "accent";
  return "neutral";
}
export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTone(status)} dot>{status}</Badge>;
}

export function Kpi({ label, value, sub, href, tone, icon: Icon }: { label: string; value: ReactNode; sub?: ReactNode; href?: string; tone?: Tone; icon?: LucideIcon }) {
  const body = (
    <div className="card rise group h-full p-5 transition hover:border-line-strong hover:shadow-[var(--shadow-lg)]">
      <div className="flex items-center gap-2 text-[12.5px] font-medium text-fg-2">
        {Icon && <Icon size={14} className="text-fg-3 group-hover:text-accent" aria-hidden />}
        <span>{label}</span>
      </div>
      <div className={cx("num mt-3 text-[26px] font-semibold tracking-tight", tone === "crit" ? "text-crit" : tone === "warn" ? "text-warn" : tone === "pos" ? "text-pos" : "text-fg")}>{value}</div>
      {sub && <div className="mt-1 text-xs text-fg-3">{sub}</div>}
    </div>
  );
  return href ? <Link href={href} className="block rounded-xl">{body}</Link> : body;
}

export function Empty({ icon: Icon, title, children, action }: { icon?: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {Icon && (
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-surface-2">
          <Icon size={20} className="text-accent" aria-hidden />
        </div>
      )}
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      {children && <p className="mt-1.5 max-w-md text-sm text-fg-2">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-y border-line bg-surface-2/60 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-3">
            {head.map((h, i) => (
              <th key={i} scope="col" className="whitespace-nowrap px-3.5 py-2.5 first:pl-5 last:pr-5">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr]:border-b [&>tr]:border-line [&>tr:last-child]:border-0 [&>tr]:transition-colors [&>tr:hover]:bg-accent-soft/40 [&_td]:whitespace-nowrap [&_td]:px-3.5 [&_td]:py-3 [&_td:first-child]:pl-5 [&_td:last-child]:pr-5">{children}</tbody>
      </table>
      {empty}
    </div>
  );
}

export const inputClass =
  "h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm text-fg placeholder:text-fg-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-60";

export function Field({ label, name, error, hint, children, className }: { label: string; name?: string; error?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)} htmlFor={name}>
      <span className="mb-1.5 block text-[12px] font-medium text-fg-2">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-crit">{error}</span> : hint ? <span className="mt-1 block text-xs text-fg-3">{hint}</span> : null}
    </label>
  );
}
export function Input(p: ComponentProps<"input">) {
  return <input id={p.name} {...p} className={cx(inputClass, p.type === "number" && "num", p.className)} />;
}
export function Select({ children, ...p }: ComponentProps<"select">) {
  return (
    <select id={p.name} {...p} className={cx(inputClass, "pr-8", p.className)}>
      {children}
    </select>
  );
}
export function Textarea(p: ComponentProps<"textarea">) {
  return <textarea id={p.name} rows={3} {...p} className={cx(inputClass, "h-auto py-2", p.className)} />;
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: Tone }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line/70 py-2.5 text-sm last:border-0">
      <span className="text-fg-2">{label}</span>
      <span className={cx("num font-medium", tone === "crit" ? "text-crit" : tone === "pos" ? "text-pos" : tone === "warn" ? "text-warn" : "text-fg")}>{value}</span>
    </div>
  );
}
