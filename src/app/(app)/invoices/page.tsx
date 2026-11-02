import Link from "next/link";
import type { InvoiceStatus, Prisma } from "@prisma/client";
import { Plus, Receipt, Download } from "lucide-react";
import { requireUser, can } from "@/server/auth";
import { db } from "@/server/db";
import { receivables } from "@/server/services/invoicing";
import { fmtMoney } from "@/lib/decimal";
import { D, dec } from "@/lib/decimal";
import { PageHeader, Card, Table, Empty, LinkButton, cx } from "@/components/ui";
import { InvoiceStatus as StatusBadgeInv } from "./status";

export const metadata = { title: "Invoices" };
const TABS = [["open", "Unpaid"], ["overdue", "Overdue"], ["draft", "Drafts"], ["paid", "Paid"], ["all", "All"]] as const;

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const u = await requireUser("invoices.view");
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab : "open";
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const OPEN: InvoiceStatus[] = ["ISSUED", "PARTIALLY_PAID"];
  const where: Prisma.InvoiceWhereInput = { open: { status: { in: OPEN } }, overdue: { status: { in: OPEN }, dueDate: { lt: today } }, draft: { status: "DRAFT" }, paid: { status: "PAID" }, all: {} }[tab as "open"];
  const yearStart = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
  const [list, ar, ytd, paidYtd, drafts] = await Promise.all([
    db.invoice.findMany({ where: { ...where, ...(sp.customer ? { customerId: sp.customer } : {}) }, include: { customer: true }, orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }], take: 300 }),
    receivables(),
    db.invoice.aggregate({ where: { status: { notIn: ["DRAFT", "VOID"] }, issueDate: { gte: yearStart } }, _sum: { total: true } }),
    db.invoicePayment.aggregate({ where: { receivedAt: { gte: yearStart }, invoice: { status: { not: "VOID" } } }, _sum: { amount: true } }),
    db.invoice.count({ where: { status: "DRAFT" } }),
  ]);
  const manage = can(u, "invoices.manage");
  const bucketMax = D.max(1, ...Object.values(ar.buckets));
  return (
    <>
      <PageHeader title="Invoices" description="Bill customers, track what's owed and record payments as they come in." actions={manage && <LinkButton href="/invoices/new" variant="gold"><Plus size={14} /> New invoice</LinkButton>} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card><div className="text-xs text-fg-3">Owed to us</div><div className="num mt-1 text-2xl font-semibold">{fmtMoney(ar.total)}</div><div className="mt-0.5 text-xs text-fg-3">{ar.rows.length} unpaid invoice{ar.rows.length === 1 ? "" : "s"}</div></Card>
        <Card><div className="text-xs text-fg-3">Overdue</div><div className={cx("num mt-1 text-2xl font-semibold", ar.overdue.gt(0) && "text-crit")}>{fmtMoney(ar.overdue)}</div><div className="mt-0.5 text-xs text-fg-3">{ar.rows.filter((r) => r.daysLate > 0).length} past due date</div></Card>
        <Card><div className="text-xs text-fg-3">Invoiced this year</div><div className="num mt-1 text-2xl font-semibold">{fmtMoney(dec(ytd._sum.total ?? 0))}</div></Card>
        <Card><div className="text-xs text-fg-3">Collected this year</div><div className="num mt-1 text-2xl font-semibold text-pos">{fmtMoney(dec(paidYtd._sum.amount ?? 0))}</div>{drafts > 0 && <div className="mt-0.5 text-xs text-fg-3">{drafts} draft{drafts === 1 ? "" : "s"} not yet issued</div>}</Card>
      </div>

      {ar.total.gt(0) && (
        <div className="mb-6 grid gap-6 lg:grid-cols-2">
          <Card title="How late is the money?">
            <div className="space-y-2.5">
              {([["Not yet due", ar.buckets.current, "bg-accent"], ["1–30 days late", ar.buckets.d1_30, "bg-gold"], ["31–60 days late", ar.buckets.d31_60, "bg-warn"], ["61–90 days late", ar.buckets.d61_90, "bg-crit/70"], ["Over 90 days", ar.buckets.d90, "bg-crit"]] as const).map(([l, v, c], i) => (
                <div key={l} className="grid grid-cols-[120px_1fr_100px] items-center gap-3 text-sm">
                  <span className="text-fg-2">{l}</span>
                  <div className="h-2.5 rounded-full bg-surface-2"><div className={cx("bar-grow h-2.5 rounded-full", c)} style={{ width: `${v.div(bucketMax).times(100).toNumber()}%`, animationDelay: `${i * 0.08}s` }} /></div>
                  <span className="num text-right font-medium">{fmtMoney(v)}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card title="Who owes us" pad={false}>
            <ul className="divide-y divide-line">
              {ar.byCustomer.slice(0, 6).map((c) => (
                <li key={c.id}><Link href={`/invoices?tab=open&customer=${c.id}`} className="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-surface-2">
                  <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                  {c.overdue.gt(0) && <span className="num text-xs text-crit">{fmtMoney(c.overdue)} overdue</span>}
                  <span className="num w-28 text-right font-semibold">{fmtMoney(c.balance)}</span>
                </Link></li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-1 border-b border-line">
        {TABS.map(([k, l]) => <Link key={k} href={`/invoices?tab=${k}${sp.customer ? `&customer=${sp.customer}` : ""}`} className={cx("-mb-px border-b-2 px-3 py-2 text-sm font-medium", tab === k ? "border-accent text-fg" : "border-transparent text-fg-2 hover:text-fg")}>{l}</Link>)}
        {sp.customer && <Link href={`/invoices?tab=${tab}`} className="ml-auto text-xs text-accent">Clear customer filter ×</Link>}
      </div>
      <Card pad={false}>
        <Table head={["Invoice", "Customer", "Date", "Due", "Total", "Balance", "Status", ""]} empty={!list.length && <Empty icon={Receipt} title={tab === "open" ? "Nothing owed right now" : "No invoices here"} action={manage && <LinkButton href="/invoices/new" size="sm"><Plus size={13} /> New invoice</LinkButton>}>{tab === "open" ? "Issued invoices that aren't fully paid show up here." : undefined}</Empty>}>
          {list.map((i) => {
            const bal = dec(i.total).minus(dec(i.amountPaid));
            const overdue = i.dueDate < today && bal.gt(0) && (i.status === "ISSUED" || i.status === "PARTIALLY_PAID");
            return (
              <tr key={i.id}>
                <td><Link href={`/invoices/${i.id}`} className="num font-semibold hover:text-accent">{i.number ?? "Draft"}</Link></td>
                <td className="max-w-[240px] truncate">{i.customer.name}</td>
                <td className="text-fg-2">{i.issueDate.toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" })}</td>
                <td className={cx(overdue ? "font-medium text-crit" : "text-fg-2")}>{i.dueDate.toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" })}</td>
                <td className="num">{fmtMoney(i.total, i.currency)}</td>
                <td className="num font-medium">{i.status === "VOID" || i.status === "DRAFT" ? "—" : fmtMoney(bal, i.currency)}</td>
                <td><StatusBadgeInv status={i.status} overdue={overdue} /></td>
                <td className="text-right">{i.number && <a href={`/api/invoices/${i.id}/pdf`} className="inline-flex items-center gap-1 text-xs text-fg-3 hover:text-accent"><Download size={12} /> PDF</a>}</td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </>
  );
}
