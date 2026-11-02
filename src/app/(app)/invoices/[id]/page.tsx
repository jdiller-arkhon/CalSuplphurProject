import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Send, Trash2, Download, Ban, Plus, Boxes } from "lucide-react";
import { requireUser, can } from "@/server/auth";
import { db } from "@/server/db";
import { today } from "@/server/lookups";
import { D, dec, fmtMoney, fmtPct, fmtQty } from "@/lib/decimal";
import { PageHeader, Card, Table, LinkButton, cx } from "@/components/ui";
import { FormModal, ActionButton } from "@/components/form-modal";
import { issueInvoice, deleteInvoice, recordPayment, deletePayment, voidInvoice } from "@/server/actions/invoices";
import { InvoiceStatus } from "../status";

export const metadata = { title: "Invoice" };
const METHODS = [["CHECK", "Check"], ["ACH", "ACH / bank transfer"], ["WIRE", "Wire"], ["CARD", "Card"], ["CASH", "Cash"], ["OTHER", "Other"]] as const;
const date = (d: Date) => d.toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" });

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser("invoices.view");
  const { id } = await params;
  const i = await db.invoice.findUnique({ where: { id }, include: { customer: true, lines: { orderBy: { position: "asc" }, include: { product: true } }, payments: { orderBy: { receivedAt: "asc" } } } });
  if (!i) notFound();
  const lots = await db.inventoryLot.findMany({ where: { id: { in: i.lines.map((l) => l.lotId).filter((x): x is string => !!x) } }, include: { location: true } });
  const manage = can(u, "invoices.manage"), money = (v: { toString(): string }) => fmtMoney(dec(v.toString()), i.currency);
  const balance = dec(i.total).minus(dec(i.amountPaid));
  const now = new Date(today() + "T00:00:00Z");
  const overdue = i.dueDate < now && balance.gt(0) && (i.status === "ISSUED" || i.status === "PARTIALLY_PAID");
  const open = i.status === "ISSUED" || i.status === "PARTIALLY_PAID";
  const costed = i.lines.filter((l) => l.unitCost);
  const showMargin = can(u, "finance.view") && costed.length > 0;
  const cogs = costed.reduce((s, l) => s.plus(dec(l.quantity).times(dec(l.unitCost!))), new D(0));
  const costedRevenue = costed.reduce((s, l) => s.plus(dec(l.amount)), new D(0));

  return (
    <>
      <PageHeader
        title={i.number ? `Invoice ${i.number}` : "Draft invoice"}
        crumbs={[{ label: "Invoices", href: "/invoices" }, { label: i.number ?? "Draft" }]}
        description={`${i.customer.name} · ${money(i.total)}${i.status !== "DRAFT" && i.status !== "VOID" ? ` · ${balance.gt(0) ? `${money(balance)} still owed` : "paid in full"}` : ""}`}
        actions={<>
          {manage && i.status === "DRAFT" && <>
            <ActionButton action={issueInvoice} hidden={{ id }} variant="gold" size="md" confirm={`Issue this invoice for ${money(i.total)}? It gets the next invoice number and can no longer be edited${i.lines.some((l) => l.lotId) ? ", and the stock on it is taken out of inventory" : ""}.`}><Send size={14} /> Issue</ActionButton>
            <LinkButton href={`/invoices/${id}/edit`} variant="secondary"><Pencil size={14} /> Edit</LinkButton>
            <ActionButton action={deleteInvoice} hidden={{ id }} size="md" variant="ghost" confirm="Delete this draft?"><Trash2 size={14} /> Delete</ActionButton>
          </>}
          {manage && open && <FormModal title="Record a payment" trigger={<><Plus size={14} /> Record payment</>} triggerVariant="gold" triggerSize="md" action={recordPayment} hidden={{ invoiceId: id }} submit="Record payment"
            fields={[{ name: "amount", label: "Amount received", type: "number", step: "0.01", required: true, defaultValue: balance.toFixed(2) }, { name: "receivedAt", label: "Date received", type: "date", required: true, defaultValue: today() }, { name: "method", label: "Method", type: "select", required: true, options: METHODS.map(([value, label]) => ({ value, label })), defaultValue: "CHECK" }, { name: "reference", label: "Check # / reference" }, { name: "note", label: "Note", span: 2 }]} />}
          {i.number && <a href={`/api/invoices/${id}/pdf`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 text-sm font-medium text-white hover:bg-white/10"><Download size={14} /> PDF</a>}
          {manage && open && dec(i.amountPaid).isZero() && <FormModal title={`Void ${i.number}`} trigger={<><Ban size={14} /> Void</>} triggerSize="md" action={voidInvoice} hidden={{ id }} submit="Void invoice" confirm="Void this invoice? It stays on record but no longer counts as owed." intro={i.lines.some((l) => l.movementId) ? "Stock taken out of inventory by this invoice will be put back into the same lots." : undefined} fields={[{ name: "reason", label: "Reason", required: true, span: 2 }]} />}
        </>}
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="card rise overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line bg-surface-2/50 px-7 py-6">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-3">Bill to</div>
              <div className="mt-1 text-[15px] font-semibold"><Link href={`/customers/${i.customerId}`} className="hover:text-accent">{i.customer.name}</Link></div>
              {i.billTo && <div className="mt-1 whitespace-pre-line text-sm text-fg-2">{i.billTo}</div>}
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <dt className="text-fg-3">Status</dt><dd><InvoiceStatus status={i.status} overdue={overdue} /></dd>
              <dt className="text-fg-3">Invoice date</dt><dd>{date(i.issueDate)}</dd>
              <dt className="text-fg-3">Due</dt><dd className={cx(overdue && "font-semibold text-crit")}>{date(i.dueDate)}{overdue && ` (${Math.floor((now.getTime() - i.dueDate.getTime()) / 86400000)}d late)`}</dd>
              {i.paymentTerms && <><dt className="text-fg-3">Terms</dt><dd>{i.paymentTerms}</dd></>}
              {i.customerPo && <><dt className="text-fg-3">Customer PO</dt><dd>{i.customerPo}</dd></>}
            </dl>
          </div>
          <Table head={["Description", "Qty", "Price", "Amount"]}>
            {i.lines.map((l) => {
              const lot = lots.find((x) => x.id === l.lotId);
              return (
                <tr key={l.id}>
                  <td className="!whitespace-normal">{l.description}{lot && <div className="mt-0.5 flex items-center gap-1 text-xs text-fg-3"><Boxes size={11} />{l.movementId ? "Taken from" : "Will take from"} {lot.location.code} / {lot.lotNumber}</div>}</td>
                  <td className="num">{fmtQty(l.quantity, 3)} {l.unitLabel}</td>
                  <td className="num">{fmtMoney(l.unitPrice, i.currency, 2)}{l.unitLabel && <span className="text-fg-3"> / {l.unitLabel}</span>}</td>
                  <td className="num font-medium">{money(l.amount)}</td>
                </tr>
              );
            })}
          </Table>
          <div className="ml-auto max-w-xs space-y-1.5 px-7 py-5 text-sm">
            <div className="flex justify-between"><span className="text-fg-3">Subtotal</span><span className="num">{money(i.subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-fg-3">Tax{dec(i.taxPct).gt(0) && ` (${fmtPct(i.taxPct, 2)})`}</span><span className="num">{money(i.taxAmount)}</span></div>
            <div className="flex justify-between border-t border-line pt-2 text-base font-semibold"><span>Total</span><span className="num">{money(i.total)}</span></div>
            {dec(i.amountPaid).gt(0) && <div className="flex justify-between text-pos"><span>Paid</span><span className="num">−{money(i.amountPaid)}</span></div>}
            {i.status !== "DRAFT" && i.status !== "VOID" && <div className={cx("flex justify-between rounded-lg px-3 py-2 font-semibold", balance.gt(0) ? (overdue ? "bg-crit-soft text-crit" : "bg-accent-soft text-accent") : "bg-pos-soft text-pos")}><span>Balance due</span><span className="num">{money(balance)}</span></div>}
          </div>
          {i.notes && <div className="border-t border-line px-7 py-4 text-sm text-fg-2"><div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-3">Notes</div><div className="whitespace-pre-line">{i.notes}</div></div>}
          {i.status === "VOID" && <div className="border-t border-line bg-surface-2 px-7 py-3 text-sm text-fg-2"><b>Void:</b> {i.voidReason}</div>}
        </section>

        <div className="space-y-6">
          <Card title="Payments" pad={false}>
            {i.payments.length ? (
              <ul className="divide-y divide-line">
                {i.payments.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <div className="min-w-0 flex-1"><div className="num font-semibold text-pos">{money(p.amount)}</div><div className="text-xs text-fg-3">{date(p.receivedAt)} · {METHODS.find((m) => m[0] === p.method)?.[1]}{p.reference && ` · ${p.reference}`}</div></div>
                    {manage && i.status !== "VOID" && <ActionButton action={deletePayment} hidden={{ id: p.id }} variant="ghost" confirm="Remove this payment?"><Trash2 size={13} /></ActionButton>}
                  </li>
                ))}
              </ul>
            ) : <p className="p-5 text-sm text-fg-3">{i.status === "DRAFT" ? "Issue the invoice to start recording payments." : "No payments yet."}</p>}
          </Card>
          {showMargin && (
            <Card title="Profit on stock lines">
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between"><dt className="text-fg-3">Revenue</dt><dd className="num">{money(costedRevenue)}</dd></div>
                <div className="flex justify-between"><dt className="text-fg-3">Cost of stock</dt><dd className="num">{money(cogs)}</dd></div>
                <div className="flex justify-between border-t border-line pt-1.5 font-semibold"><dt>Gross profit</dt><dd className="num text-pos">{money(costedRevenue.minus(cogs))}</dd></div>
                {costedRevenue.gt(0) && <div className="text-right text-xs text-fg-3">{fmtPct(costedRevenue.minus(cogs).div(costedRevenue))} margin · freight not included</div>}
              </dl>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
