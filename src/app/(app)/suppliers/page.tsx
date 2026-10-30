import Link from "next/link";
import { Factory, Plus } from "lucide-react";
import { requireUser, can } from "@/server/auth";
import { db } from "@/server/db";
import { D, dec, fmtMoney } from "@/lib/decimal";
import { Card, PageHeader, LinkButton, Table, Empty, Badge } from "@/components/ui";

export const metadata = { title: "Suppliers" };

export default async function Suppliers() {
  const u = await requireUser("suppliers.manage");
  const suppliers = await db.supplier.findMany({ include: { purchaseOrders: { where: { status: { not: "CANCELLED" } }, include: { lines: true } }, products: true }, orderBy: [{ active: "desc" }, { name: "asc" }] });
  const val = can(u, "inventory.value");
  return (
    <>
      <PageHeader title="Suppliers" description="Sources of product and services, with purchase history and pricing." actions={<LinkButton href="/suppliers/new"><Plus size={14} /> Add supplier</LinkButton>} />
      <Card pad={false}>
        {suppliers.length ? (
          <Table head={["Supplier", "Contact", "Terms", "Products", "POs", ...(val ? ["Purchased value"] : [])]}>
            {suppliers.map((s) => (
              <tr key={s.id}>
                <td><Link href={`/suppliers/${s.id}`} className="font-medium hover:text-accent">{s.name}</Link>{!s.active && <span className="ml-2"><Badge>inactive</Badge></span>}</td>
                <td className="text-fg-2">{s.contactName ?? s.email ?? "—"}</td>
                <td className="text-fg-2">{s.paymentTerms ?? "—"}</td>
                <td className="text-fg-2">{s.products.map((p) => p.name).join(", ") || "—"}</td>
                <td className="num">{s.purchaseOrders.length}</td>
                {val && <td className="num">{fmtMoney(s.purchaseOrders.reduce((t, p) => t.plus(p.lines.reduce((x, l) => x.plus(dec(l.receivedQty).times(dec(l.unitCost))), new D(0))), new D(0)), "USD", 0)}</td>}
              </tr>
            ))}
          </Table>
        ) : (
          <Empty icon={Factory} title="No suppliers yet" action={<LinkButton href="/suppliers/new">Add supplier</LinkButton>}>Add the refineries and vendors you source sulphur and services from. Purchase orders and receipts build their history.</Empty>
        )}
      </Card>
    </>
  );
}
