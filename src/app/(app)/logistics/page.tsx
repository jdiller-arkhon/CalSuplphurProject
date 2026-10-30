import Link from "next/link";
import { Truck, Plus, Download } from "lucide-react";
import { requireUser, can } from "@/server/auth";
import { db } from "@/server/db";
import { D, dec, fmtMoney, fmtQty, type Dec } from "@/lib/decimal";
import { Card, PageHeader, LinkButton, Table, Empty, StatusBadge, Kpi } from "@/components/ui";

export const metadata = { title: "Logistics" };

export default async function Logistics() {
  const u = await requireUser("logistics.manage");
  const fin = can(u, "finance.view");
  const ships = await db.shipment.findMany({ include: { lines: true, freightCosts: true, order: { include: { customer: true } } }, orderBy: [{ createdAt: "desc" }], take: 300 });
  const qty = (s: (typeof ships)[number]) => s.lines.reduce((t, l) => t.plus(dec(l.quantity)), new D(0));
  const fr = (s: (typeof ships)[number]) => s.freightCosts.reduce((t, f) => t.plus(dec(f.amount)), new D(0));
  const byMode = new Map<string, { n: number; qty: Dec; fr: Dec }>();
  for (const s of ships.filter((x) => x.status !== "CANCELLED" && x.shippedAt)) {
    const m = byMode.get(s.mode) ?? { n: 0, qty: new D(0), fr: new D(0) };
    m.n++; m.qty = m.qty.plus(qty(s)); m.fr = m.fr.plus(fr(s));
    byMode.set(s.mode, m);
  }
  return (
    <>
      <PageHeader title="Logistics" description="Truck, container and vessel shipments with freight cost and delivery tracking." actions={<>{can(u, "reports.generate") && <LinkButton variant="secondary" href="/api/export/xlsx?report=shipments"><Download size={14} /> Excel</LinkButton>}<LinkButton href="/logistics/new"><Plus size={14} /> Plan shipment</LinkButton></>} />
      {fin && byMode.size > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[...byMode.entries()].map(([m, v]) => <Kpi key={m} label={`${m.charAt(0)}${m.slice(1).toLowerCase()} · ${v.n} dispatched`} value={v.qty.isZero() ? "—" : `${fmtMoney(v.fr.div(v.qty))}/unit`} sub={`${fmtQty(v.qty)} shipped · ${fmtMoney(v.fr, "USD", 0)} freight`} />)}
        </div>
      )}
      <Card pad={false}>
        {ships.length ? (
          <Table head={["Shipment", "Order / customer", "Mode", "Carrier", "Date", "Quantity", ...(fin ? ["Freight", "Per unit"] : []), "Status"]}>
            {ships.map((s) => {
              const q = qty(s), f = fr(s);
              const late = s.status === "PLANNED" && s.scheduledAt && s.scheduledAt < new Date();
              return (
                <tr key={s.id}>
                  <td><Link href={`/logistics/${s.id}`} className="font-medium text-accent">{s.number}</Link></td>
                  <td>{s.order ? <><span>{s.order.number}</span><span className="block max-w-[220px] truncate text-xs text-fg-3">{s.order.customer.name}</span></> : <span className="text-fg-2">{s.destination ?? "—"}</span>}</td>
                  <td>{s.mode}</td>
                  <td className="max-w-[180px] truncate text-fg-2">{s.carrier ?? "—"}</td>
                  <td className={late ? "font-medium text-crit" : "text-fg-2"}>{s.shippedAt ? <>Shipped {s.shippedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</> : s.scheduledAt ? <>Due {s.scheduledAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</> : "—"}</td>
                  <td className="num">{fmtQty(q, 3)}</td>
                  {fin && <><td className="num">{fmtMoney(f)}</td><td className="num">{q.isZero() ? "—" : fmtMoney(f.div(q))}</td></>}
                  <td><StatusBadge status={s.status} /></td>
                </tr>
              );
            })}
          </Table>
        ) : (
          <Empty icon={Truck} title="No shipments yet" action={<LinkButton href="/sales?tab=orders">Go to sales orders</LinkButton>}>Plan shipments from an allocated sales order. Dispatching deducts inventory and recognizes revenue; freight costs feed profitability.</Empty>
        )}
      </Card>
    </>
  );
}
