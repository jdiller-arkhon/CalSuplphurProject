import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { requireUser, can } from "@/server/auth";
import { db } from "@/server/db";
import { D, dec, fmtMoney, fmtQty } from "@/lib/decimal";
import { Card, PageHeader, LinkButton, Table, StatusBadge, Stat, Badge } from "@/components/ui";
import { ActionButton } from "@/components/form-modal";
import { setSupplierActive } from "@/server/actions/parties";

export default async function SupplierDetail({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser("suppliers.manage");
  const s = await db.supplier.findUnique({
    where: { id: (await params).id },
    include: { purchaseOrders: { include: { lines: { include: { product: true } } }, orderBy: { orderDate: "desc" } }, products: true, documents: { where: { archived: false } } },
  });
  if (!s) notFound();
  const val = can(u, "inventory.value");
  const priceHistory = s.purchaseOrders.flatMap((p) => p.lines.map((l) => ({ po: p, l }))).sort((a, b) => b.po.orderDate.getTime() - a.po.orderDate.getTime());
  return (
    <>
      <PageHeader
        title={s.name}
        crumbs={[{ label: "Suppliers", href: "/suppliers" }, { label: s.name }]}
        description={[s.code, s.paymentTerms].filter(Boolean).join(" · ")}
        actions={
          <>
            <ActionButton action={setSupplierActive} hidden={{ id: s.id, active: s.active ? "false" : "true" }} size="md">{s.active ? "Deactivate" : "Reactivate"}</ActionButton>
            <LinkButton variant="secondary" href={`/suppliers/${s.id}/edit`}><Pencil size={14} /> Edit</LinkButton>
            {can(u, "purchasing.manage") && <LinkButton href={`/purchasing/new?supplier=${s.id}`}><Plus size={14} /> New PO</LinkButton>}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Profile">
          <Stat label="Status" value={s.active ? <Badge tone="pos">active</Badge> : <Badge>inactive</Badge>} />
          <Stat label="Contact" value={s.contactName ?? "—"} />
          <Stat label="Email" value={s.email ?? "—"} />
          <Stat label="Phone" value={s.phone ?? "—"} />
          <div className="mt-2 whitespace-pre-wrap text-sm text-fg-2">{s.address}</div>
          {s.products.length > 0 && <div className="mt-3 text-sm">Default supplier for: {s.products.map((p) => <Link key={p.id} className="mr-2 text-accent" href={`/products/${p.id}`}>{p.name}</Link>)}</div>}
          {s.notes && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-xs text-fg-2">{s.notes}</p>}
        </Card>
        <Card className="lg:col-span-2" title="Purchase orders" pad={false}>
          <Table head={["PO", "Date", "Expected", ...(val ? ["Value"] : []), "Status"]}>
            {s.purchaseOrders.map((p) => (
              <tr key={p.id}>
                <td><Link className="text-accent" href={`/purchasing/${p.id}`}>{p.number}</Link></td>
                <td className="text-fg-2">{p.orderDate.toLocaleDateString("en-US")}</td>
                <td className="text-fg-2">{p.expectedAt?.toLocaleDateString("en-US") ?? "—"}</td>
                {val && <td className="num">{fmtMoney(p.lines.reduce((t, l) => t.plus(dec(l.quantity).times(dec(l.unitCost))), new D(0)))}</td>}
                <td><StatusBadge status={p.status} /></td>
              </tr>
            ))}
          </Table>
          {!s.purchaseOrders.length && <p className="px-5 py-4 text-sm text-fg-2">No purchase orders.</p>}
        </Card>
      </div>
      {val && (
        <Card className="mt-6" title="Supplier pricing history" pad={false}>
          <Table head={["Date", "PO", "Product", "Quantity", "Unit cost", "Received"]}>
            {priceHistory.map(({ po, l }) => (
              <tr key={l.id}>
                <td className="text-fg-2">{po.orderDate.toLocaleDateString("en-US")}</td>
                <td>{po.number}</td>
                <td>{l.product.name}</td>
                <td className="num">{fmtQty(l.quantity)} {l.product.unitCode}</td>
                <td className="num">{fmtMoney(l.unitCost, po.currency, 2)}</td>
                <td className="num">{fmtQty(l.receivedQty)}</td>
              </tr>
            ))}
          </Table>
          {!priceHistory.length && <p className="px-5 py-4 text-sm text-fg-2">No pricing history yet.</p>}
        </Card>
      )}
    </>
  );
}
