import Link from "next/link";
import { PowerOff } from "lucide-react";
import { requireUser, can } from "@/server/auth";
import { MODULES, type ModuleKey } from "@/lib/modules";
import { Card, Empty, LinkButton } from "@/components/ui";

export const metadata = { title: "Section switched off" };

export default async function SectionOff({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const u = await requireUser();
  const { m } = await searchParams;
  const mod = m && m in MODULES ? MODULES[m as ModuleKey] : null;
  return (
    <Card className="mx-auto mt-10 max-w-xl">
      <Empty icon={PowerOff} title={`${mod?.label ?? "This section"} is switched off`} action={can(u, "settings.manage") ? <LinkButton href="/settings/sections">Turn it on in Settings</LinkButton> : <Link href="/" className="text-sm font-medium text-accent">Back to Overview</Link>}>
        Your company has this part of CSC Command turned off. Nothing has been deleted.{!can(u, "settings.manage") && " Ask the owner if you need it."}
      </Empty>
    </Card>
  );
}
