import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, FileText } from "lucide-react";
import { requireUser, can } from "@/server/auth";
import { db } from "@/server/db";
import { D, dec, fmtMoney, fmtPct, fmtQty } from "@/lib/decimal";
import { Card, PageHeader, Table, StatusBadge, Stat, Badge, humanize } from "@/components/ui";
import { ActionButton, FormModal } from "@/components/form-modal";
import { dispatchShipmentAction, deliverShipmentAction, cancelShipmentAction, addFreightAction, updateShipmentAction } from "@/server/actions/ops";
import { vesselDayAction, setShipmentDetails } from "@/server/actions/plant";
import { today, isoDate } from "@/server/lookups";

const FREIGHT = [["FREIGHT", "Freight"], ["FUEL_SURCHARGE", "Fuel surcharge"], ["LOADING", "Loading"], ["UNLOADING", "Unloading"], ["DEMURRAGE", "Demurrage"], ["OTHER", "Other"]].map(([value, label]) => ({ value, label }));

export const metadata = { title: "Shipment" };

export default async function ShipmentDetail({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser("logistics.manage");
  const s = await db.shipment.findUnique({ where: { id: (await params).id }, include: { order: { include: { customer: true } }, lines: { include: { salesOrderLine: { include: { product: true } } } }, freightCosts: true, documents: { where: { archived: false } }, truck: true, vesselDays: { orderBy: { day: "asc" } }, scaleTickets: true } });
  if (!s) notFound();
  const fin = can(u, "finance.view");
  const trucks = await db.truck.findMany({ where: { active: true }, orderBy: { code: "asc" } });
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
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card title="Lines" pad={false}>
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
          {s.mode === "TRUCK" && <Stat label="Our truck" value={s.truck?.code ?? "—"} />}
          {s.mode === "CONTAINER" && <Stat label="Containers" value={s.containerCount ?? "—"} />}
          {s.mode === "VESSEL" && <Stat label="Berth" value={s.berth ?? "—"} />}
          {s.status !== "CANCELLED" && <div className="mt-3"><FormModal title="Equipment details" trigger="Edit equipment" triggerVariant="ghost" action={setShipmentDetails} hidden={{ id: s.id }} fields={[
            { name: "truckId", label: "Our truck", type: "select", options: trucks.map((t) => ({ value: t.id, label: t.code })), defaultValue: s.truckId ?? "" },
            { name: "containerCount", label: "Number of containers", type: "number", defaultValue: s.containerCount?.toString() ?? "" },
            { name: "berth", label: "Berth", defaultValue: s.berth ?? "", placeholder: "e.g. Berth 214" },
          ]} /></div>}
          {s.notes && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-xs text-fg-2">{s.notes}</p>}
        </Card>
      </div>
      {s.mode === "VESSEL" && (
        <Card className="mt-6" title="Daily loading" action={s.status !== "CANCELLED" && <FormModal title="Record a day's loading" trigger="Add day" icon={<Plus size={13} />} triggerVariant="ghost" action={vesselDayAction} hidden={{ shipmentId: s.id }} fields={[{ name: "day", label: "Date", type: "date", required: true, defaultValue: today() }, { name: "quantity", label: "Tons loaded that day", type: "number", required: true }, { name: "notes", label: "Notes (weather, delays…)", span: 2 }]} />} pad={false}>
          {s.vesselDays.length ? (() => {
            const loaded = s.vesselDays.reduce((t, d) => t.plus(dec(d.quantity)), new D(0));
            return (
              <>
                <Table head={["Date", "Tons loaded", "Running total", "Notes"]}>
                  {s.vesselDays.map((d, i) => <tr key={d.id}><td>{d.day.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" })}</td><td className="num">{fmtQty(d.quantity, 0)}</td><td className="num">{fmtQty(s.vesselDays.slice(0, i + 1).reduce((t, x) => t.plus(dec(x.quantity)), new D(0)), 0)}</td><td className="text-fg-2">{d.notes ?? ""}</td></tr>)}
                </Table>
                <p className="border-t border-line px-5 py-3 text-sm text-fg-2">{fmtQty(loaded, 0)} loaded over {s.vesselDays.length} day(s) · average {fmtQty(loaded.div(s.vesselDays.length), 0)} per day{qty.gt(0) ? ` · ${fmtPct(loaded.div(qty))} of the ${fmtQty(qty, 0)} planned` : ""}.</p>
              </>
            );
          })() : <p className="px-5 py-4 text-sm text-fg-2">Record tons loaded each day to track loading rate. The company site quotes 8,000–10,000 tons per day at Berth 214.</p>}
        </Card>
      )}
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
        {fin && (
          <Card title="Freight & handling" action={s.status !== "CANCELLED" && <FormModal title="Add freight cost" trigger="Add" icon={<Plus size={13} />} triggerVariant="ghost" action={addFreightAction} hidden={{ shipmentId: s.id }} fields={[{ name: "category", label: "Category", type: "select", required: true, options: FREIGHT }, { name: "amount", label: "Amount (USD)", type: "number", required: true }, { name: "notes", label: "Notes / invoice ref", span: 2 }]} />} pad={false}>
            <Table head={["Category", "Notes", "Amount"]}>
              {s.freightCosts.map((f) => <tr key={f.id}><td>{humanize(f.category)}</td><td className="text-fg-2">{f.notes ?? ""}</td><td className="num">{fmtMoney(f.amount)}</td></tr>)}
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
