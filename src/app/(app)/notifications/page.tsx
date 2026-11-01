import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { Card, PageHeader, Empty, Badge, cx } from "@/components/ui";
import { ActionButton } from "@/components/form-modal";
import { markRead, refreshNow } from "@/server/actions/admin";

export const metadata = { title: "Notifications" };
const tone = { critical: "crit", warning: "warn", info: "accent" } as const;

export default async function Notifications() {
  const u = await requireUser();
  const items = await db.notification.findMany({ where: { OR: [{ userId: null }, { userId: u.id }] }, orderBy: [{ readAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }], take: 100 });
  const unread = items.filter((n) => !n.readAt).length;
  return (
    <>
      <PageHeader title="Notifications" description="Alerts are created from your records: low stock, approvals, expiring quotes, late shipments and POs, low-margin quotes and missing safety data sheets. Nothing is emailed." actions={<><ActionButton action={refreshNow} hidden={{}} size="md">Check now</ActionButton>{unread > 0 && <ActionButton action={markRead} hidden={{}} size="md" variant="primary"><CheckCheck size={14} /> Mark all read</ActionButton>}</>} />
      <Card pad={false}>
        {items.length ? (
          <ul className="divide-y divide-line">
            {items.map((n) => (
              <li key={n.id} className={cx("flex items-start gap-4 px-5 py-4", n.readAt && "opacity-60")}>
                <span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.readAt ? "bg-line-strong" : { critical: "bg-crit", warning: "bg-warn", info: "bg-accent" }[n.severity as "critical"] ?? "bg-accent")} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {n.href ? <Link href={n.href} className="font-medium hover:text-accent">{n.title}</Link> : <span className="font-medium">{n.title}</span>}
                    <Badge tone={tone[n.severity as keyof typeof tone] ?? "neutral"}>{n.severity}</Badge>
                  </div>
                  {n.body && <p className="mt-0.5 text-sm text-fg-2">{n.body}</p>}
                  <p className="mt-1 text-xs text-fg-3">{n.createdAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</p>
                </div>
                {!n.readAt && <ActionButton action={markRead} hidden={{ id: n.id }} variant="ghost">Mark read</ActionButton>}
              </li>
            ))}
          </ul>
        ) : (
          <Empty icon={Bell} title="You're all caught up">Alerts appear here when something needs attention.</Empty>
        )}
      </Card>
    </>
  );
}
