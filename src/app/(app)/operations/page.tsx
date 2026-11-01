import Link from "next/link";
import { Scale, Factory, Truck as TruckIcon, Plus } from "lucide-react";
import { requireUser, can } from "@/server/auth";
import { db } from "@/server/db";
import { dec, fmtMoney, fmtPct, fmtQty } from "@/lib/decimal";
import { lookups, today } from "@/server/lookups";
import { Card, PageHeader, Table, Empty, Badge, Kpi, cx } from "@/components/ui";
import { FormModal } from "@/components/form-modal";
import { ticketAction, productionAction, saveTruck } from "@/server/actions/plant";

export const metadata = { title: "Plant operations" };
const TABS = [["tickets", "Scale tickets"], ["production", "Pelletizer production"], ["trucks", "Trucks"]] as const;

export default async function Operations({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const u = await requireUser("inventory.view");
  const tab = (await searchParams).tab ?? "tickets";
  const op = can(u, "inventory.operate");
  const val = can(u, "inventory.value");
  const [l, trucks, lots] = await Promise.all([lookups(), db.truck.findMany({ orderBy: { code: "asc" } }), db.inventoryLot.findMany({ where: { onHand: { gt: 0 } }, include: { product: true, location: true }, orderBy: { receivedAt: "asc" } })]);
  const lotOpts = lots.map((x) => ({ value: x.id, label: `${x.product.name} · ${x.location.code}/${x.lotNumber} (${fmtQty(dec(x.onHand).minus(dec(x.reserved)))} free)` }));
  const truckOpts = trucks.filter((t) => t.active).map((t) => ({ value: t.id, label: t.code + (t.plate ? ` (${t.plate})` : "") }));
  const since = new Date(Date.now() - 30 * 864e5);
  const [tickets, runs, tIn, tOut, runAgg] = await Promise.all([
    db.scaleTicket.findMany({ take: 100, orderBy: { at: "desc" }, include: { truck: true } }),
    db.productionRun.findMany({ take: 60, orderBy: { runDate: "desc" } }),
    db.scaleTicket.aggregate({ where: { direction: "IN", at: { gte: since } }, _sum: { netQty: true }, _count: true }),
    db.scaleTicket.aggregate({ where: { direction: "OUT", at: { gte: since } }, _sum: { netQty: true }, _count: true }),
    db.productionRun.aggregate({ where: { runDate: { gte: since } }, _sum: { inputQty: true, outputQty: true }, _count: true }),
  ]);
  const products = new Map(l.products.map((p) => [p.id, p]));
  const lotById = new Map(lots.map((x) => [x.id, x]));
  const yieldAll = dec(runAgg._sum.inputQty).isZero() ? null : dec(runAgg._sum.outputQty).div(dec(runAgg._sum.inputQty));

  const ticketForm = (direction: "IN" | "OUT") => (
    <FormModal title={direction === "IN" ? "Inbound scale ticket" : "Outbound scale ticket"} trigger={direction === "IN" ? "Ticket in" : "Ticket out"} triggerVariant={direction === "IN" ? "primary" : "secondary"} triggerSize="md" icon={<Scale size={14} />} action={ticketAction} hidden={{ direction }} submit="Save ticket" wide
      intro="Net weight = gross − empty (tare), in kilograms. It's converted to the product's unit. Tick “post to inventory” to update stock at the same time."
      fields={[
        { name: "productId", label: "Product", type: "select", required: true, options: l.productOpts },
        { name: "truckId", label: "Our truck (if one of ours)", type: "select", options: truckOpts },
        { name: "grossKg", label: "Gross weight (kg)", type: "number", required: true },
        { name: "tareKg", label: "Empty / tare weight (kg)", type: "number", required: true },
        { name: "vehicleRef", label: "Vehicle / trailer", placeholder: "Plate or carrier unit" },
        { name: "driver", label: "Driver" },
        { name: "reference", label: "Reference", placeholder: "BOL, PO or order number" },
        ...(direction === "IN"
          ? ([{ name: "locationId", label: "Receive into location", type: "select", options: l.locationOpts }, { name: "lotNumber", label: "Lot / pile number" }, { name: "unitCost", label: "Unit cost (USD)", type: "number", hint: "Blank = product default cost" }] as const)
          : ([{ name: "lotId", label: "Taken from lot", type: "select", options: lotOpts, span: 2 }] as const)),
        { name: "post", label: "Post the net weight to inventory now", type: "checkbox", span: 2 },
        { name: "notes", label: "Notes", type: "textarea" },
      ]} />
  );

  return (
    <>
      <PageHeader title="Plant operations" description="Weighbridge tickets, pelletizer production runs and the truck fleet." actions={op ? (tab === "production" ? (
        <FormModal title="Record a pelletizer run" trigger="Record run" triggerVariant="primary" triggerSize="md" icon={<Factory size={14} />} action={productionAction} submit="Record run" wide
          intro="Takes the input (e.g. molten) out of its lot and adds the output (e.g. prill) to a lot. Output cost = (input cost + processing cost) ÷ output tons, so any loss is priced into the product made."
          fields={[
            { name: "runDate", label: "Run date", type: "date", required: true, defaultValue: today() },
            { name: "inputLotId", label: "Input lot", type: "select", required: true, options: lotOpts },
            { name: "inputQty", label: "Input quantity", type: "number", required: true },
            { name: "outputProductId", label: "Output product", type: "select", required: true, options: l.productOpts },
            { name: "outputQty", label: "Output quantity", type: "number", required: true },
            { name: "outputLocationId", label: "Output location", type: "select", required: true, options: l.locationOpts },
            { name: "outputLotNumber", label: "Output lot number", required: true },
            { name: "processingCost", label: "Processing cost for this run (USD)", type: "number", hint: "Energy, labor, etc. Optional." },
            { name: "notes", label: "Notes", type: "textarea" },
          ]} />
      ) : tab === "trucks" ? (
        <FormModal title="Add truck" trigger="Add truck" triggerVariant="primary" triggerSize="md" icon={<Plus size={14} />} action={saveTruck} fields={[{ name: "code", label: "Truck number", required: true, placeholder: "e.g. T-07" }, { name: "plate", label: "License plate" }, { name: "notes", label: "Notes", span: 2 }]} />
      ) : (<>{ticketForm("OUT")}{ticketForm("IN")}</>)) : undefined} />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Received by scale (30 days)" value={fmtQty(tIn._sum.netQty, 0)} sub={`${tIn._count} tickets`} />
        <Kpi label="Shipped by scale (30 days)" value={fmtQty(tOut._sum.netQty, 0)} sub={`${tOut._count} tickets`} />
        <Kpi label="Produced (30 days)" value={fmtQty(runAgg._sum.outputQty, 0)} sub={`${runAgg._count} runs`} />
        <Kpi label="Pelletizer yield (30 days)" value={fmtPct(yieldAll, 2)} tone={yieldAll && yieldAll.lt(0.97) ? "warn" : undefined} sub={yieldAll ? `${fmtQty(dec(runAgg._sum.inputQty).minus(dec(runAgg._sum.outputQty)), 1)} difference` : "No runs yet"} />
      </div>
      <nav className="mb-4 flex gap-1 border-b border-line">
        {TABS.map(([k, label]) => <Link key={k} href={`/operations?tab=${k}`} aria-current={tab === k ? "page" : undefined} className={cx("-mb-px border-b-2 px-3 py-2 text-sm font-medium", tab === k ? "border-accent text-fg" : "border-transparent text-fg-2 hover:text-fg")}>{label}</Link>)}
      </nav>

      <Card pad={false}>
        {tab === "tickets" ? (
          tickets.length ? (
            <Table head={["Ticket", "When", "Direction", "Product", "Truck / vehicle", "Gross kg", "Tare kg", "Net kg", "Net qty", "Reference"]}>
              {tickets.map((t) => { const p = products.get(t.productId); return (
                <tr key={t.id}>
                  <td className="font-medium">{t.number}</td>
                  <td className="text-fg-2">{t.at.toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td><Badge tone={t.direction === "IN" ? "pos" : "accent"} dot>{t.direction === "IN" ? "In" : "Out"}</Badge></td>
                  <td>{p?.name ?? "—"}</td>
                  <td className="text-fg-2">{t.truck?.code ?? t.vehicleRef ?? "—"}</td>
                  <td className="num">{fmtQty(t.grossKg, 0)}</td>
                  <td className="num">{fmtQty(t.tareKg, 0)}</td>
                  <td className="num">{fmtQty(t.netKg, 0)}</td>
                  <td className="num font-medium">{fmtQty(t.netQty, 3)} {p?.unitCode}</td>
                  <td className="max-w-[160px] truncate text-fg-2">{t.reference ?? ""}</td>
                </tr>
              ); })}
            </Table>
          ) : <Empty icon={Scale} title="No scale tickets yet">Record a ticket for each truck across the scale. Net tons are worked out from gross and empty weight, and can update inventory in the same step.</Empty>
        ) : tab === "production" ? (
          runs.length ? (
            <Table head={["Run", "Date", "Input", "Input qty", "Output", "Output qty", "Yield", ...(val ? ["Processing", "Output cost"] : [])]}>
              {runs.map((r) => { const inLot = lotById.get(r.inputLotId); return (
                <tr key={r.id}>
                  <td className="font-medium">{r.number}</td>
                  <td className="text-fg-2">{r.runDate.toLocaleDateString("en-US")}</td>
                  <td className="max-w-[180px] truncate">{inLot ? `${inLot.product.name} · ${inLot.lotNumber}` : "—"}</td>
                  <td className="num">{fmtQty(r.inputQty, 1)}</td>
                  <td className="max-w-[180px] truncate">{products.get(r.outputProductId)?.name} · {r.outputLotNumber}</td>
                  <td className="num">{fmtQty(r.outputQty, 1)}</td>
                  <td className={cx("num", dec(r.yieldPct).lt(0.97) && "text-warn")}>{fmtPct(r.yieldPct, 2)}</td>
                  {val && <><td className="num">{fmtMoney(r.processingCost, "USD", 0)}</td><td className="num">{fmtMoney(r.outputUnitCost)}</td></>}
                </tr>
              ); })}
            </Table>
          ) : <Empty icon={Factory} title="No production runs yet">Record each pelletizer run: molten in, prill out. Yield and cost per ton of finished product are worked out automatically.</Empty>
        ) : trucks.length ? (
          <Table head={["Truck", "Plate", "Status", "Notes", ""]}>
            {trucks.map((t) => (
              <tr key={t.id}>
                <td className="font-medium">{t.code}</td><td className="text-fg-2">{t.plate ?? "—"}</td><td>{t.active ? <Badge tone="pos" dot>in service</Badge> : <Badge dot>retired</Badge>}</td><td className="text-fg-2">{t.notes ?? ""}</td>
                <td>{op && <FormModal title={`Edit ${t.code}`} trigger="Edit" triggerVariant="ghost" action={saveTruck} hidden={{ id: t.id }} fields={[{ name: "code", label: "Truck number", required: true, defaultValue: t.code }, { name: "plate", label: "License plate", defaultValue: t.plate ?? "" }, { name: "notes", label: "Notes", defaultValue: t.notes ?? "", span: 2 }, { name: "active", label: "In service", type: "checkbox", defaultValue: String(t.active) }]} />}</td>
              </tr>
            ))}
          </Table>
        ) : <Empty icon={TruckIcon} title="No trucks added">The company website mentions a fleet of 15 trucks. Add each one to track loads and freight cost per truck.</Empty>}
      </Card>
    </>
  );
}
