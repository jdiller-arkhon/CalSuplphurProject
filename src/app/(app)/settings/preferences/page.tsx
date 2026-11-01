import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { parsePrefs } from "@/lib/prefs";
import { NAV } from "@/components/nav";
import { PreferencesForm } from "./form";

export const metadata = { title: "Preferences" };

export default async function PreferencesPage() {
  const u = await requireUser();
  const row = await db.user.findUnique({ where: { id: u.id }, select: { preferences: true } });
  const pages = NAV.flatMap((g) => g.items.map((i) => ({ href: i.href, label: i.label, group: g.label || "General" }))).filter((i) => {
    const item = NAV.flatMap((g) => g.items).find((x) => x.href === i.href)!;
    return !item.perm || u.permissions.has(item.perm);
  });
  return <PreferencesForm prefs={parsePrefs(row?.preferences)} pages={pages} />;
}
