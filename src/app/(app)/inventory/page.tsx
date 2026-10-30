import Link from "next/link";
import { Boxes, PackagePlus, Download, Upload, MapPin, ArrowLeftRight, SlidersHorizontal, Lock, Undo2, LogOut } from "lucide-react";
import { requireUser, can } from "@/server/auth";
import { db } from "@/server/db";
import { dec, fmtMoney, fmtQty } from "@/lib/decimal";
import { lookups, today } from "@/server/lookups";
import { Card, PageHeader, LinkButton, Table, Empty, Badge, Kpi, cx } from "@/components/ui";
import { FormModal, ActionButton } from "@/components/form-modal";
import { receiveAction, adjustAction, transferAction, reserveAction, releaseAction, reverseAction, shipOutAction } from "@/server/actions/catalog";
import { inventoryIntelligence } from "@/server/services/metrics";

export const metadata = { title: "Inventory" };

const TABS = [
  ["stock", "Stock by lot"],
  ["intel", "Intelligence"],
  ["ledger", "Movement ledger"],
  ["reservations", "Reservations"],
] as const;

export default async function Inventory({ searchParams }: { searchParams: Promise<{ view?: string; location?: string; product?: string; action?: string }> }) {
  const u = await requireUser("inventory.view");
  const sp = await searchParams;
  const view = sp.view ?? "stock";
  const l = await lookups();
  const val = can(u, "inventory.value");
  const op = can(u, "inventory.operate");
  const intel = await inventoryIntelligence(90);
  const snap = intel.snap;
  const lots = snap.lots.filter((x) => (!sp.location || x.locationId === sp.location) && (!sp.product || x.productId === sp.product));

  const receive = (
    <FormModal
      title="Receive inventory"
      trigger="Receive"
      triggerVariant="primary"
      triggerSize="md"
      icon={<PackagePlus size={14} />}
      submit="Post receipt"
      action={receiveAction}
      intro="Posts a RECEIPT to the ledger. Receiving into an existing lot blends its unit cost by weighted average. For supplier deliveries against a PO, receive from the purchase order instead."
      fields={[
        { name: "productId", label: "Product", type: "select", required: true, options: l.productOpts, defaultValue: sp.product },
        { name: "locationId", label: "Location", type: "select", required: true, options: l.locationOpts, defaultValue: sp.location },
        { name: "lotNumber", label: "Lot / batch number", required: true },
        { name: "receivedAt", label: "Receipt date", type: "date", defaultValue: today() },
        { name: "quantity", label: "Quantity", type: "number", required: true, hint: "In the product's unit" },
        { name: "unitCost", label: "Unit cost (USD)", type: "number", required: true },
        { name: "reference", label: "Reference", placeholder: "Scale ticket, BOL, beginning balance…", span: 2 },
      ]}
    />
  );

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Lot-level balances maintained by an append-only movement ledger."
        actions={
          <>
            {can(u, "reports.generate") && <LinkButton variant="secondary" href="/api/export/xlsx?report=inventory"><Download size={14} /> Excel</LinkButton>}
            {can(u, "import.run") && <LinkButton variant="secondary" href="/settings/import"><Upload size={14} /> Import</LinkButton>}
            {can(u, "products.manage") && <LinkButton variant="secondary" href="/inventory/locations"><MapPin size={14} /> Locations</LinkButton>}
            {op && l.products.length > 0 && l.locations.length > 0 && receive}
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="On hand" value={`${fmtQty(snap.totals.onHand)} ${snap.unit}`} sub={snap.mixedUnits ? "Mixed units" : undefined} />
        <Kpi label="Reserved" value={fmtQty(snap.totals.reserved)} sub="Committed to orders" />
        <Kpi label="Available" value={fmtQty(snap.totals.available)} tone={snap.reorder.length ? "warn" : undefined} sub={snap.reorder.length ? `${snap.reorder.length} below reorder point` : "Unreserved"} />
        {val ? <Kpi label="Valuation" value={fmtMoney(snap.totals.value, "USD", 0)} sub="Lot weighted-average cost" /> : <Kpi label="Lots" value={snap.lots.length} />}
      </div>
      <nav className="mb-4 flex gap-1 border-b border-line" aria-label="Inventory views">
        {TABS.map(([k, label]) => (
          <Link key={k} href={`/inventory?view=${k}`} aria-current={view === k ? "page" : undefined} className={cx("-mb-px border-b-2 px-3 py-2 text-sm font-medium", view === k ? "border-accent text-fg" : "border-transparent text-fg-2 hover:text-fg")}>
            {label}
          </Link>
        ))}
      </nav>

      {!l.products.length || !l.locations.length ? (
        <Card>
          <Empty icon={Boxes} title="Set up products and locations first" action={<div className="flex gap-2">{!l.products.length && <LinkButton href="/products/new">Add product</LinkButton>}{!l.locations.length && <LinkButton variant="secondary" href="/inventory/locations">Add location</LinkButton>}</div>}>
            Inventory is tracked per product, location and lot. Add at least one product and one storage location (for example the Wilmington plant), then receive beginning balances.
          </Empty>
        </Card>
      ) : view === "stock" ? (
        <Card pad={false}>
          <form className="flex flex-wrap gap-3 border-b border-line px-5 py-3">
            <input type="hidden" name="view" value="stock" />
            <select name="product" defaultValue={sp.product ?? ""} className="h-8 rounded-lg border border-line bg-surface px-2 text-sm" aria-label="Filter product">
              <option value="">All products</option>
              {l.productOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select name="location" defaultValue={sp.location ?? ""} className="h-8 rounded-lg border border-line bg-surface px-2 text-sm" aria-label="Filter location">
              <option value="">All locations</option>
              {l.locationOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button className="text-sm font-medium text-accent">Filter</button>
          </form>
          {lots.length ? (
            <Table head={["Product", "Location", "Lot", "Received", "On hand", "Reserved", "Available", ...(val ? ["Unit cost", "Value"] : []), ...(op ? [""] : [])]}>
              {lots.map((x) => (
                <tr key={x.id}>
                  <td><Link href={`/products/${x.productId}`} className="font-medium hover:text-accent">{x.product.name}</Link></td>
                  <td>{x.location.code}</td>
                  <td className="font-mono text-xs">{x.lotNumber}</td>
                  <td className="text-fg-2">{x.receivedAt.toLocaleDateString("en-US")}</td>
                  <td className="num">{fmtQty(x.onHand, 3)} <span className="text-xs text-fg-3">{x.product.unitCode}</span></td>
                  <td className="num">{dec(x.reserved).gt(0) ? fmtQty(x.reserved, 3) : "—"}</td>
                  <td className="num font-medium">{fmtQty(x.available, 3)}</td>
                  {val && <><td className="num">{fmtMoney(x.unitCost, "USD", 2)}</td><td className="num">{fmtMoney(x.value, "USD", 0)}</td></>}
                  {op && (
                    <td>
                      <div className="row-actions flex justify-end gap-0.5">
                        <FormModal title={`Adjust ${x.lotNumber}`} trigger="" icon={<SlidersHorizontal size={13} aria-label="Adjust" />} triggerVariant="ghost" action={adjustAction} hidden={{ lotId: x.id }} submit="Post adjustment" intro={`On hand ${fmtQty(x.onHand, 3)}, reserved ${fmtQty(x.reserved, 3)}. Use a negative number to reduce.`} fields={[{ name: "delta", label: "Quantity change (+/−)", type: "number", required: true }, { name: "reason", label: "Reason", required: true, placeholder: "Cycle count, moisture loss, damage…" }]} />
                        <FormModal title={`Transfer from ${x.location.code}/${x.lotNumber}`} trigger="" icon={<ArrowLeftRight size={13} aria-label="Transfer" />} triggerVariant="ghost" action={transferAction} hidden={{ lotId: x.id }} submit="Post transfer" intro={`${fmtQty(x.available, 3)} available to move. Lot number and unit cost are preserved.`} fields={[{ name: "toLocationId", label: "Destination", type: "select", required: true, options: l.locationOpts.filter((o) => o.value !== x.locationId) }, { name: "quantity", label: "Quantity", type: "number", required: true }, { name: "reference", label: "Reference", span: 2 }]} />
                        <FormModal title={`Reserve from ${x.lotNumber}`} trigger="" icon={<Lock size={13} aria-label="Reserve" />} triggerVariant="ghost" action={reserveAction} hidden={{ lotId: x.id }} submit="Reserve" intro="Manual hold (e.g. pending inspection). Order allocations are made from the sales order." fields={[{ name: "quantity", label: "Quantity", type: "number", required: true }, { name: "note", label: "Note" }]} />
                        <FormModal title={`Record outbound from ${x.lotNumber}`} trigger="" icon={<LogOut size={13} aria-label="Outbound" />} triggerVariant="ghost" action={shipOutAction} hidden={{ lotId: x.id }} submit="Record outbound" intro="For non-order outbound movements (samples, internal use). Customer shipments should be dispatched from Logistics so revenue and cost are captured." fields={[{ name: "quantity", label: "Quantity", type: "number", required: true }, { name: "reference", label: "Reference", required: true }]} />
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </Table>
          ) : (
            <Empty icon={Boxes} title="No inventory on hand" action={op ? receive : undefined}>Receive beginning balances or a delivery to create the first lot.</Empty>
          )}
        </Card>
      ) : view === "intel" ? (
        <Card pad={false} title={`Inventory intelligence · trailing ${intel.days} days`}>
          <Table head={["Product", "On hand", "Shipped (90d)", "Daily velocity", "Days of inventory", ...(val ? ["Avg cost", "Turnover (annualized)"] : []), "Last movement", "Status"]}>
            {intel.rows.map((r) => (
              <tr key={r.id}>
                <td className="font-medium">{r.name}</td>
                <td className="num">{fmtQty(r.onHand)} {r.unit}</td>
                <td className="num">{fmtQty(r.shippedQty)}</td>
                <td className="num">{fmtQty(r.dailyVelocity, 2)}/day</td>
                <td className="num">{r.daysOfInventory ? `${r.daysOfInventory.toFixed(0)} days` : "—"}</td>
                {val && <><td className="num">{r.averageCost ? fmtMoney(r.averageCost) : "—"}</td><td className="num">{r.turnover ? `${r.turnover.toFixed(1)}×` : "—"}</td></>}
                <td className="text-fg-2">{r.lastMovement?.toLocaleDateString("en-US") ?? "—"}</td>
                <td>{r.reorderPoint && r.available.lt(r.reorderPoint) ? <Badge tone="crit">reorder</Badge> : r.slowMoving ? <Badge tone="warn">slow-moving</Badge> : <Badge tone="pos">ok</Badge>}</td>
              </tr>
            ))}
          </Table>
          <p className="border-t border-line px-5 py-3 text-xs text-fg-3">Velocity = shipped quantity ÷ 90 days. Days of inventory = on hand ÷ daily velocity. Turnover = annualized COGS of shipments ÷ current inventory value. These are estimates from ledger data.</p>
        </Card>
      ) : view === "ledger" ? (
        <Ledger canReverse={can(u, "inventory.reverse")} val={val} />
      ) : (
        <Reservations canRelease={op} />
      )}
    </>
  );
}

async function Ledger({ canReverse, val }: { canReverse: boolean; val: boolean }) {
  const moves = await db.inventoryMovement.findMany({ take: 200, orderBy: { at: "desc" }, include: { product: true, lot: { include: { location: true } }, reversedBy: true } });
  const users = new Map((await db.user.findMany({ select: { id: true, name: true } })).map((x) => [x.id, x.name]));
  return (
    <Card pad={false}>
      <Table head={["Date", "Type", "Product", "Location / lot", "Quantity", ...(val ? ["Unit cost", "Value"] : []), "Reference / reason", "By", ""]}>
        {moves.map((m) => (
          <tr key={m.id} className={m.reversedBy ? "opacity-60" : undefined}>
            <td className="whitespace-nowrap text-fg-2">{m.at.toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}</td>
            <td><Badge tone={m.type === "REVERSAL" ? "crit" : dec(m.quantity).gte(0) ? "pos" : "warn"}>{m.type.replace("_", " ").toLowerCase()}</Badge></td>
            <td>{m.product.name}</td>
            <td className="text-xs">{m.lot.location.code}/{m.lot.lotNumber}</td>
            <td className="num font-medium">{dec(m.quantity).gt(0) ? "+" : ""}{fmtQty(m.quantity, 3)}</td>
            {val && <><td className="num">{fmtMoney(m.unitCost)}</td><td className="num">{fmtMoney(m.value)}</td></>}
            <td className="max-w-[220px] truncate text-fg-2">{[m.reference, m.reason].filter(Boolean).join(" — ")}{m.reversedBy && " (reversed)"}</td>
            <td className="text-xs text-fg-3">{m.userId ? users.get(m.userId) : ""}</td>
            <td>
              {canReverse && !m.reversedBy && ["RECEIPT", "ADJUSTMENT"].includes(m.type) && !m.purchaseReceiptLineId && (
                <FormModal title="Reverse movement" trigger="" icon={<Undo2 size={13} aria-label="Reverse" />} triggerVariant="ghost" action={reverseAction} hidden={{ movementId: m.id }} submit="Post reversal" triggerSize="sm" intro="Posts an equal and opposite movement. The original entry is never edited or deleted." fields={[{ name: "reason", label: "Reason", required: true }]} />
              )}
            </td>
          </tr>
        ))}
      </Table>
      {!moves.length && <p className="px-5 py-6 text-sm text-fg-2">The ledger is empty.</p>}
    </Card>
  );
}

async function Reservations({ canRelease }: { canRelease: boolean }) {
  const res = await db.inventoryReservation.findMany({ where: { status: "ACTIVE" }, include: { lot: { include: { product: true, location: true } }, salesOrderLine: { include: { order: true } } }, orderBy: { createdAt: "desc" } });
  return (
    <Card pad={false}>
      <Table head={["Created", "Product", "Lot", "Reserved", "Consumed", "Remaining", "For", ""]}>
        {res.map((r) => (
          <tr key={r.id}>
            <td className="text-fg-2">{r.createdAt.toLocaleDateString("en-US")}</td>
            <td>{r.lot.product.name}</td>
            <td className="text-xs">{r.lot.location.code}/{r.lot.lotNumber}</td>
            <td className="num">{fmtQty(r.quantity, 3)}</td>
            <td className="num">{fmtQty(r.consumed, 3)}</td>
            <td className="num font-medium">{fmtQty(dec(r.quantity).minus(dec(r.consumed)), 3)}</td>
            <td>{r.salesOrderLine ? <Link className="text-accent" href={`/sales/orders/${r.salesOrderLine.orderId}`}>{r.salesOrderLine.order.number}</Link> : r.note ?? "Manual hold"}</td>
            <td>{canRelease && <ActionButton action={releaseAction} hidden={{ id: r.id }} variant="ghost" confirm="Release this reservation?">Release</ActionButton>}</td>
          </tr>
        ))}
      </Table>
      {!res.length && <p className="px-5 py-6 text-sm text-fg-2">No active reservations.</p>}
    </Card>
  );
}
