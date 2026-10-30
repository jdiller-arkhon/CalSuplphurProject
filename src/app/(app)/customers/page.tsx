import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import { requireUser, can } from "@/server/auth";
import { db } from "@/server/db";
import { D, dec, fmtMoney } from "@/lib/decimal";
import { Card, PageHeader, LinkButton, Table, Empty, Badge, Input } from "@/components/ui";

export const metadata = { title: "Customers" };

export default async function Customers({ searchParams }: { searchParams: Promise<{ q?: string; inactive?: string }> }) {
  const u = await requireUser("customers.view");
  const sp = await searchParams;
  const q = sp.q?.trim();
  const fin = can(u, "finance.view");
  const customers = await db.customer.findMany({
    where: { active: !sp.inactive, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {}) },
    include: { orders: { where: { status: { not: "CANCELLED" } }, include: { lines: true } }, contacts: { where: { primary: true } } },
    orderBy: { name: "asc" },
  });
  return (
    <>
      <PageHeader title="Customers" description="Accounts, contacts, terms and purchase history." actions={can(u, "customers.manage") ? <LinkButton href="/customers/new"><Plus size={14} /> Add customer</LinkButton> : undefined} />
      <Card pad={false}>
        <form className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
          <Input name="q" defaultValue={q} placeholder="Search name, code or email…" className="max-w-xs" aria-label="Search customers" />
          <label className="flex items-center gap-2 text-sm text-fg-2"><input type="checkbox" name="inactive" value="1" defaultChecked={!!sp.inactive} className="accent-[var(--accent)]" />Inactive</label>
          <button className="text-sm font-medium text-accent">Apply</button>
        </form>
        {customers.length ? (
          <Table head={["Customer", "Primary contact", "Terms", "Orders", ...(fin ? ["Lifetime order value"] : []), "Last order"]}>
            {customers.map((c) => {
              const val = c.orders.reduce((s, o) => s.plus(o.lines.reduce((x, l) => x.plus(dec(l.quantity).times(dec(l.unitPrice))), new D(0))), new D(0));
              const last = c.orders.map((o) => o.orderDate).sort((a, b) => b.getTime() - a.getTime())[0];
              return (
                <tr key={c.id}>
                  <td><Link href={`/customers/${c.id}`} className="font-medium hover:text-accent">{c.name}</Link>{c.code && <span className="ml-2 font-mono text-xs text-fg-3">{c.code}</span>}{!c.active && <span className="ml-2"><Badge>inactive</Badge></span>}</td>
                  <td className="text-fg-2">{c.contacts[0]?.name ?? c.email ?? "—"}</td>
                  <td className="text-fg-2">{c.paymentTerms ?? "—"}</td>
                  <td className="num">{c.orders.length}</td>
                  {fin && <td className="num">{fmtMoney(val, c.currency, 0)}</td>}
                  <td className="text-fg-2">{last?.toLocaleDateString("en-US") ?? "—"}</td>
                </tr>
              );
            })}
          </Table>
        ) : (
          <Empty icon={Building2} title={q ? "No customers match" : "No customers yet"} action={!q && can(u, "customers.manage") ? <LinkButton href="/customers/new">Add customer</LinkButton> : undefined}>
            {q ? "Try another search." : "Add the refineries, distributors and end users you sell to. Their order history and profitability build automatically."}
          </Empty>
        )}
      </Card>
    </>
  );
}
