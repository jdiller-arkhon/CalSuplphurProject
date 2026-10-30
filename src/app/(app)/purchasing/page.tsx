import Link from "next/link";
import { ShoppingCart, Plus, Download } from "lucide-react";
import { requireUser, can } from "@/server/auth";
import { db } from "@/server/db";
import { D, dec, fmtMoney } from "@/lib/decimal";
import { Card, PageHeader, LinkButton, Table, Empty, StatusBadge } from "@/components/ui";

export const metadata = { title: "Purchasing" };

export default async function Purchasing() {
  const u = await requireUser("purchasing.manage");
  const pos = await db.purchaseOrder.findMany({ include: { supplier: true, lines: true }, orderBy: { createdAt: "desc" }, take: 200 });
  return (
    <>
      <PageHeader title="Purchasing" description="Purchase orders, partial receipts and reconciliation. Receipts post to the inventory ledger; purchases never create revenue." actions={<>{can(u, "reports.generate") && <LinkButton variant="secondary" href="/api/export/xlsx?report=purchasing"><Download size={14} /> Excel</LinkButton>}<LinkButton href="/purchasing/new"><Plus size={14} /> New PO</LinkButton></>} />
      <Card pad={false}>
        {pos.length ? (
          <Table head={["PO", "Supplier", "Ordered", "Expected", "Value", "Received", "Status"]}>
            {pos.map((p) => {
              const q = p.lines.reduce((s, l) => s.plus(dec(l.quantity)), new D(0));
              const r = p.lines.reduce((s, l) => s.plus(dec(l.receivedQty)), new D(0));
              const late = p.expectedAt && p.expectedAt < new Date() && ["ISSUED", "PARTIALLY_RECEIVED"].includes(p.status);
              return (
                <tr key={p.id}>
                  <td><Link href={`/purchasing/${p.id}`} className="font-medium text-accent">{p.number}</Link>{p.revision > 0 && <span className="ml-1 text-xs text-fg-3">rev {p.revision}</span>}</td>
                  <td>{p.supplier.name}</td>
                  <td className="text-fg-2">{p.orderDate.toLocaleDateString("en-US")}</td>
                  <td className={late ? "font-medium text-crit" : "text-fg-2"}>{p.expectedAt?.toLocaleDateString("en-US") ?? "—"}</td>
                  <td className="num">{fmtMoney(p.lines.reduce((s, l) => s.plus(dec(l.quantity).times(dec(l.unitCost))), new D(0)), p.currency)}</td>
                  <td className="num">{q.isZero() ? "—" : `${r.div(q).times(100).toFixed(0)}%`}</td>
                  <td><StatusBadge status={p.status} /></td>
                </tr>
              );
            })}
          </Table>
        ) : (
          <Empty icon={ShoppingCart} title="No purchase orders yet" action={<LinkButton href="/purchasing/new">Create purchase order</LinkButton>}>Track product purchases from order through partial deliveries. Each receipt creates inventory lots at the PO cost.</Empty>
        )}
      </Card>
    </>
  );
}
