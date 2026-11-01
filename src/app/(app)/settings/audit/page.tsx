import Link from "next/link";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { Card, Table, Badge, Input, Select } from "@/components/ui";

export const metadata = { title: "Audit log" };

export default async function Audit({ searchParams }: { searchParams: Promise<{ q?: string; user?: string; page?: string }> }) {
  await requireUser("audit.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where = { ...(sp.user ? { userId: sp.user } : {}), ...(sp.q ? { OR: [{ summary: { contains: sp.q, mode: "insensitive" as const } }, { action: { contains: sp.q, mode: "insensitive" as const } }] } : {}) };
  const [rows, total, users] = await Promise.all([db.auditEvent.findMany({ where, include: { user: true }, orderBy: { at: "desc" }, take: 100, skip: (page - 1) * 100 }), db.auditEvent.count({ where }), db.user.findMany({ select: { id: true, name: true } })]);
  const q = (p: number) => `/settings/audit?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.user ? { user: sp.user } : {}), page: String(p) })}`;
  return (
    <Card pad={false}>
      <form className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
        <Input name="q" defaultValue={sp.q} placeholder="Search actions…" className="max-w-xs" aria-label="Search audit log" />
        <Select name="user" defaultValue={sp.user ?? ""} className="max-w-[200px]" aria-label="Filter by user"><option value="">Everyone</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>
        <button className="text-sm font-medium text-accent">Filter</button>
        <span className="ml-auto text-xs text-fg-3">{total.toLocaleString()} events · append-only</span>
      </form>
      <Table head={["When", "Who", "Action", "What happened"]}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="text-fg-2">{r.at.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "medium" })}</td>
            <td>{r.user?.name ?? "System"}</td>
            <td><Badge>{r.action}</Badge></td>
            <td className="max-w-[640px] truncate" title={r.summary}>{r.summary}</td>
          </tr>
        ))}
      </Table>
      <div className="flex justify-between border-t border-line px-5 py-3 text-sm">
        {page > 1 ? <Link className="text-accent" href={q(page - 1)}>← Newer</Link> : <span />}
        {page * 100 < total ? <Link className="text-accent" href={q(page + 1)}>Older →</Link> : <span />}
      </div>
    </Card>
  );
}
