import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { D, dec } from "@/lib/decimal";
import { Card, PageHeader } from "@/components/ui";
import { createShipmentAction } from "@/server/actions/ops";
import { lookups } from "@/server/lookups";
import { ShipmentForm, type ShipLine } from "./shipment-form";

export const metadata = { title: "Plan shipment" };

export default async function NewShipment({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  await requireUser("logistics.manage");
  const sp = await searchParams;
  const orders = await db.salesOrder.findMany({ where: { status: { in: ["OPEN", "ALLOCATED", "PARTIALLY_SHIPPED"] } }, include: { customer: true }, orderBy: { orderDate: "desc" } });
  const order = sp.order ? await db.salesOrder.findUnique({ where: { id: sp.order }, include: { customer: true, lines: { include: { product: true, reservations: { where: { status: "ACTIVE" }, include: { lot: { include: { location: true } } } }, shipmentLines: { include: { shipment: true } } } } } }) : null;
  const l = await lookups();
  const lines: ShipLine[] = [];
  if (order) {
    for (const ol of order.lines) {
      const planned = ol.shipmentLines.filter((s) => s.shipment.status !== "CANCELLED" && !s.posted).reduce((t, s) => t.plus(dec(s.quantity)), new D(0));
      for (const r of ol.reservations) {
        const rem = dec(r.quantity).minus(dec(r.consumed));
        lines.push({ salesOrderLineId: ol.id, lotId: r.lotId, label: `${ol.product.name}`, lot: `${r.lot.location.code}/${r.lot.lotNumber}`, unit: ol.product.unitCode, max: D.max(0, rem.minus(planned)).toString(), reserved: true });
      }
    }
  } else {
    const lots = await db.inventoryLot.findMany({ where: { onHand: { gt: 0 } }, include: { product: true, location: true } });
    for (const x of lots) lines.push({ lotId: x.id, label: x.product.name, lot: `${x.location.code}/${x.lotNumber}`, unit: x.product.unitCode, max: dec(x.onHand).minus(dec(x.reserved)).toString(), reserved: false });
  }
  const origin = order ? undefined : l.locations[0]?.name;
  return (
    <>
      <PageHeader title="Plan shipment" crumbs={[{ label: "Logistics", href: "/logistics" }, { label: "Plan" }]} description={order ? `For ${order.number} · ${order.customer.name}. Quantities draw from the order's reservations.` : "Choose a sales order to ship customer product, or plan a non-sales movement from available stock."} />
      <Card>
        <ShipmentForm action={createShipmentAction} orders={orders.map((o) => ({ id: o.id, label: `${o.number} — ${o.customer.name}` }))} orderId={order?.id} lines={lines} destination={order?.customer.shippingAddress ?? undefined} origin={origin} />
      </Card>
    </>
  );
}
