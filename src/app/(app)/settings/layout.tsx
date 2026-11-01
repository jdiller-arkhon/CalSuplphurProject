import { requireUser, can } from "@/server/auth";
import { PageHeader } from "@/components/ui";
import { SettingsTabs } from "./tabs";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser();
  const tabs: [string, string][] = [
    ...(can(u, "settings.manage") ? ([["/settings", "Company & policies"]] as [string, string][]) : []),
    ...(can(u, "users.manage") ? ([["/settings/users", "Users"], ["/settings/roles", "Roles & permissions"]] as [string, string][]) : []),
    ["/settings/preferences", "Preferences"],
    ["/settings/security", "My security"],
    ...(can(u, "import.run") ? ([["/settings/import", "Import data"]] as [string, string][]) : []),
    ...(can(u, "audit.view") ? ([["/settings/audit", "Audit log"]] as [string, string][]) : []),
  ];
  return (
    <>
      <PageHeader title="Settings" description="Company configuration, access and security." />
      <SettingsTabs tabs={tabs} />
      {children}
    </>
  );
}
