import { Scale, PackagePlus, ArrowLeftRight, LogOut } from "lucide-react";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { dec, fmtQty } from "@/lib/decimal";
import { lookups } from "@/server/lookups";
import { Card, PageHeader, Badge } from "@/components/ui";
import { ticketAction } from "@/server/actions/plant";
import { receiveAction, transferAction } from "@/server/actions/catalog";
import { YardTile } from "./tile";

export const metadata = { title: "Yard mode" };

export default async function Yard() {
  await requireUser("inventory.operate");
  const [l, trucks, lots] = await Promise.all([lookups(), db.truck.findMany({ where: { active: true }, orderBy: { code: "asc" } }), db.inventoryLot.findMany({ where: { onHand: { gt: 0 } }, include: { product: true, location: true }, orderBy: { receivedAt: "asc" } })]);
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const today = await db.scaleTicket.findMany({ where: { at: { gte: start } }, orderBy: { at: "desc" }, include: { truck: true } });
  const productName = new Map(l.products.map((p) => [p.id, p]));
  const lotOpts = lots.map((x) => ({ value: x.id, label: `${x.product.name} · ${x.location.code}/${x.lotNumber} (${fmtQty(dec(x.onHand).minus(dec(x.reserved)))} free)` }));
  const truckOpts = trucks.map((t) => ({ value: t.id, label: t.code }));
  const net = (dir: string) => today.filter((t) => t.direction === dir).reduce((s, t) => s.plus(dec(t.netQty)), dec(0));
  return (
    <>
      <PageHeader title="Yard mode" description="Big buttons for the scale house and yard. Works on a tablet." crumbs={[{ label: "Plant operations", href: "/operations" }, { label: "Yard mode" }]} />
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <YardTile title="Truck in" subtitle="Weigh a load coming in" tone="pos" icon={<Scale size={34} />} action={ticketAction} hidden={{ direction: "IN", post: "on" }} submit="Save & add to stock" fields={[
          { name: "productId", label: "Product", type: "select", required: true, options: l.productOpts, span: 2 },
          { name: "grossKg", label: "Gross weight (kg)", type: "number", required: true },
          { name: "tareKg", label: "Empty weight (kg)", type: "number", required: true },
          { name: "locationId", label: "Put it in", type: "select", required: true, options: l.locationOpts },
          { name: "lotNumber", label: "Lot / pile", required: true },
          { name: "truckId", label: "Our truck", type: "select", options: truckOpts },
          { name: "reference", label: "Ticket / BOL ref" },
        ]} />
        <YardTile title="Truck out" subtitle="Weigh a load going out" tone="accent" icon={<LogOut size={34} />} action={ticketAction} hidden={{ direction: "OUT", post: "on" }} submit="Save & take from stock" fields={[
          { name: "productId", label: "Product", type: "select", required: true, options: l.productOpts, span: 2 },
          { name: "grossKg", label: "Gross weight (kg)", type: "number", required: true },
          { name: "tareKg", label: "Empty weight (kg)", type: "number", required: true },
          { name: "lotId", label: "Taken from", type: "select", required: true, options: lotOpts, span: 2 },
          { name: "truckId", label: "Our truck", type: "select", options: truckOpts },
          { name: "reference", label: "Order / BOL ref" },
        ]} />
        <YardTile title="Receive product" subtitle="Add stock without the scale" tone="gold" icon={<PackagePlus size={34} />} action={receiveAction} submit="Add to stock" fields={[
          { name: "productId", label: "Product", type: "select", required: true, options: l.productOpts, span: 2 },
          { name: "quantity", label: "Quantity", type: "number", required: true },
          { name: "unitCost", label: "Unit cost (USD)", type: "number", required: true },
          { name: "locationId", label: "Put it in", type: "select", required: true, options: l.locationOpts },
          { name: "lotNumber", label: "Lot / pile", required: true },
        ]} />
        <YardTile title="Move product" subtitle="Transfer between locations" tone="neutral" icon={<ArrowLeftRight size={34} />} action={transferAction} submit="Move it" fields={[
          { name: "lotId", label: "From", type: "select", required: true, options: lotOpts, span: 2 },
          { name: "toLocationId", label: "To", type: "select", required: true, options: l.locationOpts },
          { name: "quantity", label: "Quantity", type: "number", required: true },
        ]} />
      </div>
      <Card className="mt-6" title={`Today’s scale tickets · ${fmtQty(net("IN"), 1)} in · ${fmtQty(net("OUT"), 1)} out`} pad={false}>
        {today.length ? (
          <ul className="divide-y divide-line">
            {today.map((t) => { const p = productName.get(t.productId); return (
              <li key={t.id} className="flex items-center gap-4 px-5 py-4 text-base">
                <Badge tone={t.direction === "IN" ? "pos" : "accent"} dot>{t.direction === "IN" ? "In" : "Out"}</Badge>
                <span className="font-medium">{t.number}</span>
                <span className="text-fg-2">{p?.name}</span>
                <span className="text-fg-3">{t.truck?.code ?? t.vehicleRef ?? ""}</span>
                <span className="num ml-auto font-semibold">{fmtQty(t.netQty, 3)} {p?.unitCode}</span>
                <span className="w-16 text-right text-sm text-fg-3">{t.at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
              </li>
            ); })}
          </ul>
        ) : <p className="px-5 py-6 text-base text-fg-2">No tickets yet today.</p>}
      </Card>
    </>
  );
}
