import Link from "next/link";
import { Download, LineChart } from "lucide-react";
import { requireUser, can } from "@/server/auth";
import { financials, inventoryAging, inventoryIntelligence, parsePeriod, previousPeriod, gp, margin } from "@/server/services/metrics";
import { db } from "@/server/db";
import { dec, fmtMoney, fmtPct, fmtQty } from "@/lib/decimal";
import { Card, PageHeader, Table, Empty, Kpi, LinkButton, Badge, cx } from "@/components/ui";
import { PeriodPicker } from "@/components/period";
import { RevenueTrend, HBar } from "@/components/charts";

export const metadata = { title: "Analytics" };
const TABS = [["overview", "Overview"], ["products", "Products"], ["customers", "Customers"], ["orders", "Orders"], ["inventory", "Inventory"], ["operations", "Operations"]] as const;

function change(cur: ReturnType<typeof dec>, prev: ReturnType<typeof dec>) {
  if (prev.isZero()) return cur.isZero() ? "No change" : "No prior-period figure";
  const c = cur.minus(prev).div(prev.abs());
  return `${c.gte(0) ? "▲" : "▼"} ${c.abs().times(100).toFixed(1)}% vs prior period`;
}

export default async function Analytics({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const u = await requireUser("finance.view");
  const sp = await searchParams;
  const tab = sp.tab ?? "overview";
  const p = parsePeriod(sp);
  const [f, prev] = await Promise.all([financials(p), financials(previousPeriod(p))]);
  const unit = (await db.product.findFirst({ select: { unitCode: true } }))?.unitCode ?? "MT";
  const qs = (t: string) => `/analytics?${new URLSearchParams({ ...sp, tab: t })}`;
  const trend = f.months.map((m) => ({ label: new Date(`${m.key}-01T00:00:00`).toLocaleDateString("en-US", { month: "short" }), revenue: m.revenue.toNumber(), profit: gp(m).toNumber(), margin: margin(m) ? margin(m)!.times(100).toNumber() : null }));
  const avgPrice = f.totals.quantity.isZero() ? null : f.totals.revenue.div(f.totals.quantity);

  return (
    <>
      <PageHeader
        title="Analytics"
        description={<>{p.label} · compared with the prior period of equal length. <span className="text-fg-3">Actuals only. Gross profit = revenue − cost of goods − direct freight; it is not net income.</span></>}
        actions={<><PeriodPicker current={p.key} />{can(u, "reports.generate") && <LinkButton variant="secondary" href={`/api/export/xlsx?report=financial&${new URLSearchParams(sp)}`}><Download size={14} /> Excel</LinkButton>}</>}
      />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Kpi label="Revenue" value={fmtMoney(f.totals.revenue, "USD", 0)} sub={change(f.totals.revenue, prev.totals.revenue)} />
        <Kpi label="Gross profit" value={fmtMoney(gp(f.totals), "USD", 0)} sub={change(gp(f.totals), gp(prev.totals))} tone={gp(f.totals).lt(0) ? "crit" : undefined} />
        <Kpi label="Gross margin" value={fmtPct(margin(f.totals))} sub={margin(prev.totals) ? `${fmtPct(margin(prev.totals))} prior period` : "No prior-period figure"} />
        <Kpi label="Quantity shipped" value={`${fmtQty(f.totals.quantity, 0)} ${unit}`} sub={change(f.totals.quantity, prev.totals.quantity)} />
        <Kpi label="Average selling price" value={avgPrice ? `${fmtMoney(avgPrice)}/${unit}` : "—"} sub={`Freight ${f.totals.quantity.isZero() ? "—" : fmtMoney(f.totals.freight.div(f.totals.quantity))}/${unit}`} />
      </div>
      <nav className="mb-4 flex flex-wrap gap-1 border-b border-line">
        {TABS.map(([k, l]) => <Link key={k} href={qs(k)} aria-current={tab === k ? "page" : undefined} className={cx("-mb-px border-b-2 px-3 py-2 text-sm font-medium", tab === k ? "border-accent text-fg" : "border-transparent text-fg-2 hover:text-fg")}>{l}</Link>)}
      </nav>

      {!f.facts.length && tab !== "inventory" && tab !== "operations" ? (
        <Card><Empty icon={LineChart} title="No dispatched sales in this period">Revenue is counted when sales-order product is dispatched. Choose a wider date range.</Empty></Card>
      ) : tab === "overview" ? (
        <div className="grid items-start gap-6 xl:grid-cols-3">
          <Card className="xl:col-span-2" title="Revenue and gross profit by month"><RevenueTrend data={trend} height={300} /></Card>
          <Card title="Where the money went">
            <Table head={["", "Amount", "% of revenue"]}>
              {([["Revenue", f.totals.revenue], ["Cost of goods", f.totals.cogs.neg()], ["Direct freight", f.totals.freight.neg()], ["Gross profit", gp(f.totals)]] as const).map(([k, v]) => (
                <tr key={k}><td className={k === "Gross profit" ? "font-semibold" : ""}>{k}</td><td className="num">{fmtMoney(v, "USD", 0)}</td><td className="num text-fg-2">{f.totals.revenue.isZero() ? "—" : fmtPct(v.div(f.totals.revenue))}</td></tr>
              ))}
            </Table>
            {f.unallocatedFreight.gt(0) && <p className="mt-3 text-xs text-fg-3">Includes {fmtMoney(f.unallocatedFreight)} freight on shipments not tied to a sales order.</p>}
          </Card>
          <Card title="Revenue by product"><HBar data={f.byProduct.slice(0, 8).map((x) => ({ label: x.label, value: x.revenue.toNumber(), href: qs("products") }))} /></Card>
          <Card title="Gross profit by customer"><HBar color="gold" data={f.byCustomer.slice(0, 8).map((x) => ({ label: x.label, value: gp(x).toNumber(), href: `/customers/${x.key}` }))} /></Card>
          <Card title="Low-margin sales" action={<Badge tone={f.lowMargin.length ? "warn" : "pos"}>{f.lowMargin.length}</Badge>} pad={false}>
            {f.lowMargin.length ? <Table head={["Order", "Product", "Margin"]}>{f.lowMargin.slice(0, 8).map((x, i) => <tr key={i}><td><Link className="text-accent" href={`/sales/orders/${x.orderId}`}>{x.orderNumber}</Link></td><td className="max-w-[160px] truncate">{x.productName}</td><td className="num text-warn">{fmtPct(x.revenue.minus(x.cogs).div(x.revenue))}</td></tr>)}</Table> : <p className="p-5 text-sm text-fg-2">Every shipment line met its product’s minimum margin.</p>}
          </Card>
        </div>
      ) : tab === "products" || tab === "customers" || tab === "orders" ? (
        <Card pad={false} title={tab === "products" ? "Profit by product" : tab === "customers" ? "Profit by customer" : "Profit by order"}>
          <Table head={[tab === "products" ? "Product" : tab === "customers" ? "Customer" : "Order", `Quantity (${unit})`, "Revenue", "Avg price", "Cost of goods", "Freight", "Gross profit", "Margin"]}>
            {(tab === "products" ? f.byProduct : tab === "customers" ? f.byCustomer : f.byOrder).map((x) => (
              <tr key={x.key}>
                <td className="max-w-[260px] truncate font-medium">{tab === "customers" ? <Link className="hover:text-accent" href={`/customers/${x.key}`}>{x.label}</Link> : tab === "orders" ? <Link className="hover:text-accent" href={`/sales/orders/${x.key}`}>{x.label}</Link> : x.label}</td>
                <td className="num">{fmtQty(x.quantity)}</td>
                <td className="num">{fmtMoney(x.revenue, "USD", 0)}</td>
                <td className="num">{x.quantity.isZero() ? "—" : fmtMoney(x.revenue.div(x.quantity))}</td>
                <td className="num">{fmtMoney(x.cogs, "USD", 0)}</td>
                <td className="num">{fmtMoney(x.freight, "USD", 0)}</td>
                <td className={cx("num font-medium", gp(x).lt(0) && "text-crit")}>{fmtMoney(gp(x), "USD", 0)}</td>
                <td className="num">{fmtPct(margin(x))}</td>
              </tr>
            ))}
            <tr className="bg-surface-2 font-semibold"><td>Total</td><td className="num">{fmtQty(f.totals.quantity)}</td><td className="num">{fmtMoney(f.totals.revenue, "USD", 0)}</td><td className="num">{avgPrice ? fmtMoney(avgPrice) : "—"}</td><td className="num">{fmtMoney(f.totals.cogs, "USD", 0)}</td><td className="num">{fmtMoney(f.totals.freight, "USD", 0)}</td><td className="num">{fmtMoney(gp(f.totals), "USD", 0)}</td><td className="num">{fmtPct(margin(f.totals))}</td></tr>
          </Table>
          <p className="border-t border-line px-5 py-3 text-xs text-fg-3">Freight is shared across the lines of each shipment by quantity, so the rows add up to the total. Click a row to see its records.</p>
        </Card>
      ) : tab === "inventory" ? (
        <InventoryTab val={can(u, "inventory.value")} />
      ) : (
        <OperationsTab p={p} unit={unit} />
      )}
    </>
  );
}

async function InventoryTab({ val }: { val: boolean }) {
  const [intel, aging] = await Promise.all([inventoryIntelligence(90), inventoryAging()]);
  return (
    <div className="grid items-start gap-6 xl:grid-cols-3">
      <Card title="Aging (since receipt)" pad={false}>
        <Table head={["Age", "Quantity", ...(val ? ["Value"] : [])]}>{aging.map((a) => <tr key={a.label}><td>{a.label}</td><td className="num">{fmtQty(a.qty)}</td>{val && <td className="num">{fmtMoney(a.value, "USD", 0)}</td>}</tr>)}</Table>
      </Card>
      <Card className="xl:col-span-2" title="Movement & turnover (90 days)" pad={false}>
        <Table head={["Product", "On hand", "Shipped", "Per day", "Days left", ...(val ? ["Value", "Turnover"] : [])]}>
          {intel.rows.map((r) => <tr key={r.id}><td className="font-medium">{r.name}</td><td className="num">{fmtQty(r.onHand)}</td><td className="num">{fmtQty(r.shippedQty)}</td><td className="num">{fmtQty(r.dailyVelocity, 1)}</td><td className="num">{r.daysOfInventory ? r.daysOfInventory.toFixed(0) : "—"}</td>{val && <><td className="num">{fmtMoney(r.value, "USD", 0)}</td><td className="num">{r.turnover ? `${r.turnover.toFixed(1)}×` : "—"}</td></>}</tr>)}
        </Table>
      </Card>
    </div>
  );
}

async function OperationsTab({ p, unit }: { p: { from: Date; to: Date }; unit: string }) {
  const [ships, pos, runs] = await Promise.all([
    db.shipment.findMany({ where: { createdAt: { gte: p.from, lte: p.to } }, include: { lines: true, freightCosts: true } }),
    db.purchaseOrder.findMany({ where: { orderDate: { gte: p.from, lte: p.to } }, include: { lines: true, receipts: true } }),
    db.productionRun.findMany({ where: { runDate: { gte: p.from, lte: p.to } } }),
  ]);
  const dispatched = ships.filter((s) => s.shippedAt);
  const onTime = dispatched.filter((s) => !s.scheduledAt || s.shippedAt!.getTime() - s.scheduledAt.getTime() <= 864e5).length;
  const delivered = ships.filter((s) => s.deliveredAt && s.shippedAt);
  const avgTransit = delivered.length ? delivered.reduce((t, s) => t + (s.deliveredAt!.getTime() - s.shippedAt!.getTime()) / 864e5, 0) / delivered.length : null;
  const tin = runs.reduce((t, r) => t.plus(dec(r.inputQty)), dec(0)), tout = runs.reduce((t, r) => t.plus(dec(r.outputQty)), dec(0));
  const received = pos.filter((x) => x.status === "RECEIVED" || x.status === "CLOSED").length;
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Kpi label="Shipments dispatched" value={dispatched.length} sub={`${ships.length} planned in period`} />
      <Kpi label="Dispatched on time" value={dispatched.length ? fmtPct(onTime / dispatched.length) : "—"} sub="Within 1 day of schedule" />
      <Kpi label="Average transit" value={avgTransit !== null ? `${avgTransit.toFixed(1)} days` : "—"} sub={`${delivered.length} delivered`} />
      <Kpi label="Purchase orders" value={pos.length} sub={`${received} fully received`} />
      <Kpi label="Production runs" value={runs.length} sub={`${fmtQty(tout, 0)} ${unit} produced`} />
      <Kpi label="Pelletizer yield" value={tin.isZero() ? "—" : fmtPct(tout.div(tin), 2)} sub={tin.isZero() ? "No runs recorded" : `${fmtQty(tin.minus(tout), 1)} ${unit} difference`} />
    </div>
  );
}
