import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { AppFrame } from "@/components/shell";
import { getSettingTyped } from "@/server/services/settings";
import { refreshAlerts } from "@/server/services/alerts";
import { log } from "@/server/audit";
import { enabledModules } from "@/server/modules";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser();
  await refreshAlerts().catch((e) => log("warn", "alert refresh failed", { err: String(e) }));
  const [unread, company, modules] = await Promise.all([
    db.notification.count({ where: { readAt: null, OR: [{ userId: null }, { userId: u.id }] } }),
    getSettingTyped("company.profile"),
    enabledModules(),
  ]);
  return (
    <AppFrame perms={[...u.permissions]} user={{ name: u.name, email: u.email, role: u.role }} unread={unread} company={company.name} modules={modules}>
      {children}
    </AppFrame>
  );
}
