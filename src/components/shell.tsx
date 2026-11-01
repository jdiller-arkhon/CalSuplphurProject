"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Command } from "cmdk";
import * as Icons from "lucide-react";
import { NAV, SETTINGS_ITEM, type NavItem } from "./nav";
import { cx } from "./ui";

type IconName = keyof typeof Icons;
const Icon = ({ name, size = 16, className }: { name: string; size?: number; className?: string }) => {
  const C = Icons[name as IconName] as Icons.LucideIcon;
  return C ? <C size={size} className={className} aria-hidden /> : null;
};

export function Sidebar({ perms, company, open, onClose }: { perms: string[]; company: string; open: boolean; onClose: () => void }) {
  const path = usePathname();
  const allowed = (i: NavItem) => !i.perm || perms.includes(i.perm);
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const link = (i: NavItem) => (
    <Link
      key={i.href}
      href={i.href}
      onClick={onClose}
      aria-current={active(i.href) ? "page" : undefined}
      className={cx(
        "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] font-medium transition",
        active(i.href) ? "nav-active text-white" : "text-sidebar-fg hover:bg-white/5 hover:text-white",
      )}
    >
      {active(i.href) && <span className="absolute -left-3 top-1.5 bottom-1.5 w-[3px] rounded-r bg-gold" aria-hidden />}
      <Icon name={i.icon} className={active(i.href) ? "text-gold" : "text-sidebar-fg/70 group-hover:text-white"} />
      {i.label}
    </Link>
  );
  return (
    <>
      <div className={cx("fixed inset-0 z-30 bg-black/40 lg:hidden", open ? "block" : "hidden")} onClick={onClose} aria-hidden />
      <aside className={cx("sidebar-bg fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col px-3 pb-3 transition-transform lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")} aria-label="Primary">
        <Link href="/" className="flex h-16 items-center gap-2.5 px-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-gold to-[#a37c3c] text-[11px] font-bold tracking-wider text-sidebar shadow-inner">S</div>
          <div className="leading-tight">
            <div className="gold-text text-[14px] font-semibold tracking-tight">CSC Command</div>
            <div className="max-w-[160px] truncate text-[11px] text-sidebar-fg/70">{company || "California Sulphur Co."}</div>
          </div>
        </Link>
        <nav className="flex-1 space-y-5 overflow-y-auto pt-2">
          {NAV.map((g) => {
            const items = g.items.filter(allowed);
            if (!items.length) return null;
            return (
              <div key={g.label || "top"}>
                {g.label && <div className="mb-1.5 px-2.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-sidebar-fg/45">{g.label}</div>}
                <div className="space-y-0.5">{items.map(link)}</div>
              </div>
            );
          })}
        </nav>
        <div className="border-t border-white/5 pt-3">{link(SETTINGS_ITEM)}</div>
      </aside>
    </>
  );
}

export function Header({ user, unread, onMenu }: { user: { name: string; email: string; role: string }; unread: number; onMenu: () => void }) {
  const [cmd, setCmd] = useState(false);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmd((v) => !v);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  return (
    <header className="glass sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line/70 px-4 md:px-8">
      <button className="rounded-lg p-2 text-fg-2 hover:bg-surface-2 lg:hidden" onClick={onMenu} aria-label="Open navigation">
        <Icons.Menu size={18} />
      </button>
      <button onClick={() => setCmd(true)} className="flex h-9 w-full max-w-md items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm text-fg-3 shadow-sm hover:border-line-strong" aria-label="Search and commands">
        <Icons.Search size={15} />
        <span className="flex-1 text-left">Search records or jump to…</span>
        <kbd className="hidden rounded border border-line bg-surface-2 px-1.5 text-[11px] font-medium text-fg-3 sm:inline">⌘K</kbd>
      </button>
      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        <Link href="/notifications" className="relative rounded-lg p-2 text-fg-2 hover:bg-surface-2 hover:text-fg" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
          <Icons.Bell size={18} />
          {unread > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-bold text-sidebar">{unread > 9 ? "9+" : unread}</span>}
        </Link>
        <UserMenu user={user} />
      </div>
      {cmd && <CommandPalette onClose={() => setCmd(false)} />}
    </header>
  );
}

function ThemeToggle() {
  const toggle = () => {
    const cur = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    document.cookie = `theme=${next};path=/;max-age=31536000;samesite=lax`;
  };
  return (
    <button onClick={toggle} className="rounded-lg p-2 text-fg-2 hover:bg-surface-2 hover:text-fg" aria-label="Toggle dark mode">
      <Icons.SunMoon size={18} />
    </button>
  );
}

function UserMenu({ user }: { user: { name: string; email: string; role: string } }) {
  const [open, setOpen] = useState(false);
  const initials = user.name.split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="ml-1 flex items-center gap-2 rounded-lg p-1 pr-2 hover:bg-surface-2" aria-haspopup="menu" aria-expanded={open}>
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-white">{initials}</span>
        <span className="hidden text-left leading-tight md:block">
          <span className="block text-[13px] font-medium text-fg">{user.name}</span>
          <span className="block text-[11px] capitalize text-fg-3">{user.role.toLowerCase()}</span>
        </span>
      </button>
      {open && (
        <div role="menu" className="card absolute right-0 mt-2 w-56 overflow-hidden p-1 shadow-[var(--shadow-lg)]" onMouseLeave={() => setOpen(false)}>
          <div className="px-3 py-2 text-xs text-fg-3">{user.email}</div>
          <Link role="menuitem" href="/settings/security" className="block rounded-md px-3 py-2 text-sm hover:bg-surface-2">Security & MFA</Link>
          <form action="/api/auth/logout" method="post">
            <button role="menuitem" className="w-full rounded-md px-3 py-2 text-left text-sm text-crit hover:bg-crit-soft">Sign out</button>
          </form>
        </div>
      )}
    </div>
  );
}

type Hit = { type: string; id: string; title: string; subtitle?: string; href: string };
const QUICK = [
  { label: "Receive inventory", href: "/inventory?action=receive", icon: "PackagePlus" },
  { label: "Scale ticket (yard mode)", href: "/yard", icon: "Scale" },
  { label: "Calculate a price", href: "/pricing", icon: "Calculator" },
  { label: "Create quote", href: "/sales/quotes/new", icon: "FilePlus2" },
  { label: "Add product", href: "/products/new", icon: "PackageOpen" },
  { label: "Add customer", href: "/customers/new", icon: "UserPlus" },
  { label: "Generate report", href: "/reports", icon: "Presentation" },
];

function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [pending, start] = useTransition();
  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      start(async () => {
        try {
          const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctl.signal });
          if (r.ok) setHits((await r.json()).results);
        } catch {}
      });
    }, 150);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q]);
  const go = (href: string) => {
    onClose();
    router.push(href);
  };
  const pages = useMemo(() => [...NAV.flatMap((g) => g.items), SETTINGS_ITEM], []);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[12vh] backdrop-blur-[2px]" onClick={onClose}>
      <Command label="Command palette" shouldFilter={false} className="card w-full max-w-xl overflow-hidden shadow-[var(--shadow-lg)]" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === "Escape" && onClose()}>
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Icons.Search size={16} className="text-fg-3" />
          <Command.Input autoFocus value={q} onValueChange={setQ} placeholder="Search products, customers, quotes, orders, lots…" className="h-12 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-3" />
          {pending && <Icons.Loader2 size={14} className="animate-spin text-fg-3" />}
        </div>
        <Command.List className="max-h-[50vh] overflow-y-auto p-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-fg-3">
          {q.trim().length >= 2 && !pending && hits.length === 0 && <Command.Empty className="px-3 py-6 text-center text-sm text-fg-3">No matching records.</Command.Empty>}
          {hits.length > 0 && (
            <Command.Group heading="Records">
              {hits.map((h) => (
                <Item key={h.type + h.id} onSelect={() => go(h.href)}>
                  <span className="w-20 shrink-0 text-[11px] uppercase tracking-wide text-fg-3">{h.type}</span>
                  <span className="truncate text-fg">{h.title}</span>
                  {h.subtitle && <span className="ml-auto truncate text-xs text-fg-3">{h.subtitle}</span>}
                </Item>
              ))}
            </Command.Group>
          )}
          {q.trim().length < 2 && (
            <>
              <Command.Group heading="Quick actions">
                {QUICK.map((a) => (
                  <Item key={a.href} onSelect={() => go(a.href)}>
                    <Icon name={a.icon} className="text-gold" />
                    {a.label}
                  </Item>
                ))}
              </Command.Group>
              <Command.Group heading="Go to">
                {pages.map((p) => (
                  <Item key={p.href} onSelect={() => go(p.href)}>
                    <Icon name={p.icon} className="text-fg-3" />
                    {p.label}
                  </Item>
                ))}
              </Command.Group>
            </>
          )}
        </Command.List>
      </Command>
    </div>
  );
}
function Item({ children, onSelect }: { children: React.ReactNode; onSelect: () => void }) {
  return (
    <Command.Item onSelect={onSelect} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-fg-2 data-[selected=true]:bg-accent-soft data-[selected=true]:text-fg">
      {children}
    </Command.Item>
  );
}

export function AppFrame({ children, perms, user, unread, company }: { children: React.ReactNode; perms: string[]; user: { name: string; email: string; role: string }; unread: number; company: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen">
      <Sidebar perms={perms} company={company} open={open} onClose={() => setOpen(false)} />
      <div className="lg:pl-[248px]">
        <Header user={user} unread={unread} onMenu={() => setOpen(true)} />
        <main className="mx-auto max-w-[1440px] px-4 py-7 md:px-8">{children}</main>
      </div>
    </div>
  );
}
