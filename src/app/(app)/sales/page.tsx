import Link from "next/link";
import { FileSignature, Plus, Download } from "lucide-react";
import { requireUser, can } from "@/server/auth";
import { db } from "@/server/db";
import { D, dec, fmtMoney, fmtPct } from "@/lib/decimal";
import { Card, PageHeader, LinkButton, Table, Empty, StatusBadge, Badge, cx } from "@/components/ui";

export const metadata = { title: "Sales & Quotes" };

const total = (ls: { quantity: unknown; unitPrice: unknown }[]) => ls.reduce((s, l) => s.plus(dec(String(l.quantity)).times(dec(String(l.unitPrice)))), new D(0));
const cost = (ls: { quantity: unknown; unitCost?: unknown; estUnitCost?: unknown }[]) => ls.reduce((s, l) => s.plus(dec(String(l.quantity)).times(dec(String(l.unitCost ?? l.estUnitCost)))), new D(0));

export default async function Sales({ searchParams }: { searchParams: Promise<{ tab?: string; status?: string }> }) {
  const u = await requireUser("quotes.manage");
  const sp = await searchParams;
  const tab = sp.tab ?? (sp.status ? "quotes" : "quotes");
  const fin = can(u, "finance.view");
  const [quotes, orders] = await Promise.all([
    db.quote.findMany({ where: sp.status ? { status: sp.status as never } : {}, include: { customer: true, lines: true }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.salesOrder.findMany({ include: { customer: true, lines: true }, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);
  return (
    <>
      <PageHeader
        title="Sales & Quotes"
        description="Quote → approval → sales order → allocation → shipment → completion."
        actions={
          <>
            {can(u, "reports.generate") && <LinkButton variant="secondary" href="/api/export/xlsx?report=sales"><Download size={14} /> Excel</LinkButton>}
            {can(u, "orders.manage") && <LinkButton variant="secondary" href="/sales/orders/new">New order</LinkButton>}
            <LinkButton href="/sales/quotes/new"><Plus size={14} /> New quote</LinkButton>
          </>
        }
      />
      <nav className="mb-4 flex gap-1 border-b border-line">
        {[["quotes", `Quotes (${quotes.length})`], ["orders", `Sales orders (${orders.length})`]].map(([k, l]) => (
          <Link key={k} href={`/sales?tab=${k}`} className={cx("-mb-px border-b-2 px-3 py-2 text-sm font-medium", tab === k ? "border-accent text-fg" : "border-transparent text-fg-2 hover:text-fg")}>{l}</Link>
        ))}
      </nav>
      <Card pad={false}>
        {tab === "quotes" ? (
          quotes.length ? (
            <Table head={["Quote", "Customer", "Created", "Valid until", "Value", ...(fin ? ["Est. margin"] : []), "Status"]}>
              {quotes.map((q) => {
                const t = total(q.lines), c = cost(q.lines);
                const m = t.isZero() ? null : t.minus(c).div(t);
                const expired = q.validUntil < new Date() && ["DRAFT", "APPROVED", "PENDING_APPROVAL"].includes(q.status);
                return (
                  <tr key={q.id}>
                    <td><Link href={`/sales/quotes/${q.id}`} className="font-medium text-accent">{q.number}</Link></td>
                    <td>{q.customer.name}</td>
                    <td className="text-fg-2">{q.createdAt.toLocaleDateString("en-US")}</td>
                    <td className={expired ? "text-crit" : "text-fg-2"}>{q.validUntil.toLocaleDateString("en-US")}</td>
                    <td className="num">{fmtMoney(t, q.currency)}</td>
                    {fin && <td className="num">{fmtPct(m)} {q.belowMinMargin && <Badge tone="warn">below min</Badge>}</td>}
                    <td>{expired ? <Badge tone="crit">expired</Badge> : <StatusBadge status={q.status} />}</td>
                  </tr>
                );
              })}
            </Table>
          ) : (
            <Empty icon={FileSignature} title="No quotes yet" action={<LinkButton href="/pricing">Price a deal in Pricing Studio</LinkButton>}>Calculate a price, then convert it into a branded quote. Quotes are never emailed automatically.</Empty>
          )
        ) : orders.length ? (
          <Table head={["Order", "Customer", "Date", "Value", "Shipped", ...(fin ? ["Est. GP"] : []), "Status"]}>
            {orders.map((o) => {
              const t = total(o.lines);
              const ordered = o.lines.reduce((s, l) => s.plus(dec(l.quantity)), new D(0));
              const shipped = o.lines.reduce((s, l) => s.plus(dec(l.shippedQty)), new D(0));
              return (
                <tr key={o.id}>
                  <td><Link href={`/sales/orders/${o.id}`} className="font-medium text-accent">{o.number}</Link></td>
                  <td>{o.customer.name}</td>
                  <td className="text-fg-2">{o.orderDate.toLocaleDateString("en-US")}</td>
                  <td className="num">{fmtMoney(t, o.currency)}</td>
                  <td className="num">{ordered.isZero() ? "—" : `${shipped.div(ordered).times(100).toFixed(0)}%`}</td>
                  {fin && <td className="num">{fmtMoney(t.minus(cost(o.lines)), o.currency)}</td>}
                  <td><StatusBadge status={o.status} /></td>
                </tr>
              );
            })}
          </Table>
        ) : (
          <Empty icon={FileSignature} title="No sales orders yet">Convert an approved quote, or create an order directly.</Empty>
        )}
      </Card>
    </>
  );
}
