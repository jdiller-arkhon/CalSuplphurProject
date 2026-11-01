"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

export function SettingsTabs({ tabs }: { tabs: [string, string][] }) {
  const path = usePathname();
  return (
    <nav className="mb-6 flex flex-wrap gap-1 border-b border-line" aria-label="Settings sections">
      {tabs.map(([href, label]) => {
        const on = href === "/settings" ? path === "/settings" : path.startsWith(href);
        return <Link key={href} href={href} aria-current={on ? "page" : undefined} className={cx("-mb-px border-b-2 px-3 py-2 text-sm font-medium", on ? "border-accent text-fg" : "border-transparent text-fg-2 hover:text-fg")}>{label}</Link>;
      })}
    </nav>
  );
}
