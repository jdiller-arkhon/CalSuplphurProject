import Link from "next/link";
import { notFound } from "next/navigation";
import { Truck } from "lucide-react";
import { requireUser, can } from "@/server/auth";
import { db } from "@/server/db";
import { D, dec, fmtMoney, fmtPct, fmtQty } from "@/lib/decimal";
import { Card, PageHeader, LinkButton, Table, StatusBadge, Stat } from "@/components/ui";
import { FormModal } from "@/components/form-modal";
import { allocateOrderAction, cancelOrderAction } from "@/server/actions/sales";
import { lookups } from "@/server/lookups";

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser("orders.manage");
  const o = await db.salesOrder.findUnique({
    where: { id: (await params).id },
    include: {
      customer: true,
      quote: true,
      lines: { include: { product: true, reservations: { include: { lot: { include: { location: true } } } }, shipmentLines: { include: { shipment: { include: { freightCosts: true } } } } } },
      shipments: { include: { freightCosts: true, lines: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!o) notFound();
  const l = await lookups();
  const fin = can(u, "finance.view");
  const value = o.lines.reduce((s, x) => s.plus(dec(x.quantity).times(dec(x.unitPrice))), new D(0));
  const estCost = o.lines.reduce((s, x) => s.plus(dec(x.quantity).times(dec(x.estUnitCost))), new D(0));
  // Actuals from dispatched shipment lines.
  const posted = o.lines.flatMap((x) => x.shipmentLines.filter((s) => s.posted).map((s) => ({ s, price: dec(x.unitPrice) })));
  const actRev = posted.reduce((t, p) => t.plus(dec(p.s.quantity).times(p.price)), new D(0));
  const actCogs = posted.reduce((t, p) => t.plus(dec(p.s.quantity).times(dec(p.s.unitCost))), new D(0));
  const freight = o.shipments.filter((s) => s.status !== "CANCELLED").flatMap((s) => s.freightCosts).reduce((t, f) => t.plus(dec(f.amount)), new D(0));
  const actGp = actRev.minus(actCogs).minus(freight);
  const live = !["CANCELLED", "COMPLETED", "SHIPPED"].includes(o.status);
  return (
    <>
      <PageHeader
        title={`Sales order ${o.number}`}
        crumbs={[{ label: "Sales", href: "/sales?tab=orders" }, { label: o.number }]}
        description={<>For <Link className="text-accent" href={`/customers/${o.customerId}`}>{o.customer.name}</Link>{o.quote && <> · from quote <Link className="text-accent" href={`/sales/quotes/${o.quote.id}`}>{o.quote.number}</Link></>}</>}
        actions={
          live ? (
            <>
              <FormModal title="Cancel order" trigger="Cancel order" triggerVariant="ghost" triggerSize="md" action={cancelOrderAction} hidden={{ id: o.id }} submit="Cancel order" intro="Active reservations are released. Quantities already shipped are kept and the order is closed." fields={[{ name: "reason", label: "Reason", required: true }]} />
              <FormModal title="Allocate inventory" trigger="Allocate inventory" triggerSize="md" action={allocateOrderAction} hidden={{ id: o.id }} submit="Allocate" intro="Reserves available stock for unallocated quantities, oldest lots first. Re-running never double-reserves." fields={[{ name: "locationId", label: "Only from location (optional)", type: "select", options: l.locationOpts }]} />
              {can(u, "logistics.manage") && <LinkButton href={`/logistics/new?order=${o.id}`}><Truck size={14} /> Plan shipment</LinkButton>}
            </>
          ) : undefined
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card title="Lines & allocation" pad={false}>
          <Table head={["Product", "Ordered", "Allocated", "Shipped", "Open", "Price", "Value"]}>
            {o.lines.map((x) => {
              const alloc = x.reservations.filter((r) => r.status !== "RELEASED").reduce((s, r) => s.plus(dec(r.quantity)), new D(0));
              return (
                <tr key={x.id}>
                  <td>
                    <div className="font-medium">{x.product.name}</div>
                    <div className="text-xs text-fg-3">{x.reservations.filter((r) => r.status === "ACTIVE").map((r) => `${r.lot.location.code}/${r.lot.lotNumber}: ${fmtQty(dec(r.quantity).minus(dec(r.consumed)))}`).join(" · ")}</div>
                  </td>
                  <td className="num">{fmtQty(x.quantity, 3)} {x.product.unitCode}</td>
                  <td className="num">{fmtQty(alloc, 3)}</td>
                  <td className="num">{fmtQty(x.shippedQty, 3)}</td>
                  <td className="num font-medium">{fmtQty(D.max(0, dec(x.quantity).minus(dec(x.shippedQty))), 3)}</td>
                  <td className="num">{fmtMoney(x.unitPrice, o.currency)}</td>
                  <td className="num">{fmtMoney(dec(x.quantity).times(dec(x.unitPrice)), o.currency)}</td>
                </tr>
              );
            })}
          </Table>
        </Card>
        <Card title="Financials">
          <Stat label="Status" value={<StatusBadge status={o.status} />} />
          <Stat label="Order value" value={fmtMoney(value, o.currency)} />
          {fin && (
            <>
              <Stat label="Estimated cost" value={fmtMoney(estCost, o.currency)} />
              <Stat label="Estimated gross profit" value={fmtMoney(value.minus(estCost), o.currency)} />
              <div className="my-3 border-t border-line" />
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-fg-3">Actual (dispatched)</div>
              <Stat label="Revenue" value={fmtMoney(actRev, o.currency)} />
              <Stat label="COGS (lot cost)" value={fmtMoney(actCogs, o.currency)} />
              <Stat label="Direct freight" value={fmtMoney(freight, o.currency)} />
              <Stat label="Actual gross profit" value={fmtMoney(actGp, o.currency)} tone={actGp.lt(0) ? "crit" : "pos"} />
              <Stat label="Actual margin" value={fmtPct(actRev.isZero() ? null : actGp.div(actRev))} />
            </>
          )}
        </Card>
      </div>
      <Card className="mt-6" title="Shipments" pad={false}>
        {o.shipments.length ? (
          <Table head={["Shipment", "Mode", "Carrier", "Scheduled", "Shipped", "Quantity", ...(fin ? ["Freight"] : []), "Status"]}>
            {o.shipments.map((s) => (
              <tr key={s.id}>
                <td><Link className="font-medium text-accent" href={`/logistics/${s.id}`}>{s.number}</Link></td>
                <td>{s.mode}</td>
                <td>{s.carrier ?? "—"}</td>
                <td className="text-fg-2">{s.scheduledAt?.toLocaleDateString("en-US") ?? "—"}</td>
                <td className="text-fg-2">{s.shippedAt?.toLocaleDateString("en-US") ?? "—"}</td>
                <td className="num">{fmtQty(s.lines.reduce((t, x) => t.plus(dec(x.quantity)), new D(0)), 3)}</td>
                {fin && <td className="num">{fmtMoney(s.freightCosts.reduce((t, f) => t.plus(dec(f.amount)), new D(0)))}</td>}
                <td><StatusBadge status={s.status} /></td>
              </tr>
            ))}
          </Table>
        ) : (
          <p className="px-5 py-6 text-sm text-fg-2">No shipments yet. Allocate inventory, then plan a shipment.</p>
        )}
      </Card>
      {o.notes && <Card className="mt-6" title="Notes"><p className="whitespace-pre-wrap text-sm text-fg-2">{o.notes}</p></Card>}
    </>
  );
}
