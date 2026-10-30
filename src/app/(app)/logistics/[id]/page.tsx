import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, FileText } from "lucide-react";
import { requireUser, can } from "@/server/auth";
import { db } from "@/server/db";
import { D, dec, fmtMoney, fmtQty } from "@/lib/decimal";
import { Card, PageHeader, Table, StatusBadge, Stat, Badge } from "@/components/ui";
import { ActionButton, FormModal } from "@/components/form-modal";
import { dispatchShipmentAction, deliverShipmentAction, cancelShipmentAction, addFreightAction, updateShipmentAction } from "@/server/actions/ops";
import { today, isoDate } from "@/server/lookups";

const FREIGHT = [["FREIGHT", "Freight"], ["FUEL_SURCHARGE", "Fuel surcharge"], ["LOADING", "Loading"], ["UNLOADING", "Unloading"], ["DEMURRAGE", "Demurrage"], ["OTHER", "Other"]].map(([value, label]) => ({ value, label }));

export const metadata = { title: "Shipment" };

export default async function ShipmentDetail({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser("logistics.manage");
  const s = await db.shipment.findUnique({ where: { id: (await params).id }, include: { order: { include: { customer: true } }, lines: { include: { salesOrderLine: { include: { product: true } } } }, freightCosts: true, documents: { where: { archived: false } } } });
  if (!s) notFound();
  const fin = can(u, "finance.view");
  const lots = new Map((await db.inventoryLot.findMany({ where: { id: { in: s.lines.map((l) => l.lotId) } }, include: { product: true, location: true } })).map((l) => [l.id, l]));
  const qty = s.lines.reduce((t, l) => t.plus(dec(l.quantity)), new D(0));
  const freight = s.freightCosts.reduce((t, f) => t.plus(dec(f.amount)), new D(0));
  return (
    <>
      <PageHeader
        title={`Shipment ${s.number}`}
        crumbs={[{ label: "Logistics", href: "/logistics" }, { label: s.number }]}
        description={<>{s.mode}{s.order && <> · <Link className="text-accent" href={`/sales/orders/${s.order.id}`}>{s.order.number}</Link> · {s.order.customer.name}</>}</>}
        actions={
          <>
            {s.status === "PLANNED" && <ActionButton action={cancelShipmentAction} hidden={{ id: s.id }} variant="ghost" size="md" confirm="Cancel this planned shipment?">Cancel</ActionButton>}
            {s.status !== "CANCELLED" && s.status !== "DELIVERED" && <FormModal title="Edit details" trigger="Edit details" triggerSize="md" action={updateShipmentAction} hidden={{ id: s.id }} fields={[{ name: "carrier", label: "Carrier", defaultValue: s.carrier ?? "" }, { name: "vehicleRef", label: "Vehicle / container / vessel", defaultValue: s.vehicleRef ?? "" }, { name: "scheduledAt", label: "Scheduled", type: "date", defaultValue: isoDate(s.scheduledAt) }, { name: "destination", label: "Destination", defaultValue: s.destination ?? "" }, { name: "notes", label: "Notes", type: "textarea", defaultValue: s.notes ?? "" }]} />}
            {s.status === "PLANNED" && <ActionButton action={dispatchShipmentAction} hidden={{ id: s.id }} variant="primary" size="md" confirm="Dispatch now? Inventory will be deducted from the listed lots and revenue recognized.">Dispatch</ActionButton>}
            {s.status === "IN_TRANSIT" && <FormModal title="Confirm delivery" trigger="Mark delivered" triggerVariant="primary" triggerSize="md" action={deliverShipmentAction} hidden={{ id: s.id }} submit="Confirm" fields={[{ name: "deliveredAt", label: "Delivered on", type: "date", defaultValue: today() }]} />}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Lines" pad={false}>
          <Table head={["Product", "Lot", "Quantity", ...(fin ? ["Unit cost", "COGS"] : []), "Posted"]}>
            {s.lines.map((l) => {
              const lot = lots.get(l.lotId);
              return (
                <tr key={l.id}>
                  <td>{lot?.product.name}</td>
                  <td className="text-xs">{lot?.location.code}/{lot?.lotNumber}</td>
                  <td className="num">{fmtQty(l.quantity, 3)} {lot?.product.unitCode}</td>
                  {fin && <><td className="num">{fmtMoney(l.unitCost)}</td><td className="num">{fmtMoney(dec(l.quantity).times(dec(l.unitCost)))}</td></>}
                  <td>{l.posted ? <Badge tone="pos">posted</Badge> : <Badge>pending</Badge>}</td>
                </tr>
              );
            })}
          </Table>
        </Card>
        <Card title="Details">
          <Stat label="Status" value={<StatusBadge status={s.status} />} />
          <Stat label="Carrier" value={s.carrier ?? "—"} />
          <Stat label="Vehicle / ref" value={s.vehicleRef ?? "—"} />
          <Stat label="Origin" value={s.origin ?? "—"} />
          <Stat label="Destination" value={s.destination ?? "—"} />
          <Stat label="Scheduled" value={s.scheduledAt?.toLocaleDateString("en-US") ?? "—"} />
          <Stat label="Shipped" value={s.shippedAt?.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) ?? "—"} />
          <Stat label="Delivered" value={s.deliveredAt?.toLocaleDateString("en-US") ?? "—"} />
          <Stat label="Total quantity" value={fmtQty(qty, 3)} />
          {s.notes && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-xs text-fg-2">{s.notes}</p>}
        </Card>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {fin && (
          <Card title="Freight & handling" action={s.status !== "CANCELLED" && <FormModal title="Add freight cost" trigger="Add" icon={<Plus size={13} />} triggerVariant="ghost" action={addFreightAction} hidden={{ shipmentId: s.id }} fields={[{ name: "category", label: "Category", type: "select", required: true, options: FREIGHT }, { name: "amount", label: "Amount (USD)", type: "number", required: true }, { name: "notes", label: "Notes / invoice ref", span: 2 }]} />} pad={false}>
            <Table head={["Category", "Notes", "Amount"]}>
              {s.freightCosts.map((f) => <tr key={f.id}><td>{f.category.replace("_", " ").toLowerCase()}</td><td className="text-fg-2">{f.notes ?? ""}</td><td className="num">{fmtMoney(f.amount)}</td></tr>)}
              <tr><td className="font-medium">Total</td><td className="text-xs text-fg-3">{qty.isZero() ? "" : `${fmtMoney(freight.div(qty))} per unit`}</td><td className="num font-semibold">{fmtMoney(freight)}</td></tr>
            </Table>
          </Card>
        )}
        <Card title="Shipping documents" action={<Link href={`/documents?shipmentId=${s.id}`} className="text-xs font-medium text-accent">Upload / manage →</Link>}>
          {s.documents.length ? s.documents.map((d) => <a key={d.id} className="mb-1 flex items-center gap-2 text-sm text-accent" href={`/api/documents/${d.id}`}><FileText size={13} />{d.title} <Badge>{d.category}</Badge></a>) : <p className="text-sm text-fg-2">No BOLs, weight tickets or export documents attached.</p>}
        </Card>
      </div>
    </>
  );
}
