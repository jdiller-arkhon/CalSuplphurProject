import Link from "next/link";
import { notFound } from "next/navigation";
import { FileDown, ShieldAlert } from "lucide-react";
import { requireUser, can } from "@/server/auth";
import { db } from "@/server/db";
import { D, dec, fmtMoney, fmtPct, fmtQty } from "@/lib/decimal";
import { Card, PageHeader, LinkButton, Table, StatusBadge, Stat, Badge } from "@/components/ui";
import { ActionButton, FormModal } from "@/components/form-modal";
import { submitQuoteAction, approveQuoteAction, cancelQuoteAction, convertQuoteAction, duplicateQuoteAction } from "@/server/actions/sales";

export default async function QuoteDetail({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser("quotes.manage");
  const q = await db.quote.findUnique({ where: { id: (await params).id }, include: { customer: true, lines: { include: { product: true } }, scenario: true, order: true } });
  if (!q) notFound();
  const users = new Map((await db.user.findMany({ select: { id: true, name: true } })).map((x) => [x.id, x.name]));
  const fin = can(u, "finance.view");
  const total = q.lines.reduce((s, l) => s.plus(dec(l.quantity).times(dec(l.unitPrice))), new D(0));
  const cost = q.lines.reduce((s, l) => s.plus(dec(l.quantity).times(dec(l.unitCost))), new D(0));
  const expired = q.validUntil < new Date();
  const open = ["DRAFT", "REJECTED"].includes(q.status);
  return (
    <>
      <PageHeader
        title={`Quote ${q.number}`}
        crumbs={[{ label: "Sales", href: "/sales" }, { label: q.number }]}
        description={<>For <Link className="text-accent" href={`/customers/${q.customerId}`}>{q.customer.name}</Link> · valid until {q.validUntil.toLocaleDateString("en-US", { dateStyle: "medium" })}{expired && <span className="text-crit"> (expired)</span>}</>}
        actions={
          <>
            <LinkButton variant="secondary" href={`/api/quotes/${q.id}/pdf`} target="_blank"><FileDown size={14} /> PDF</LinkButton>
            <ActionButton action={duplicateQuoteAction} hidden={{ id: q.id }} size="md">Duplicate</ActionButton>
            {open && <ActionButton action={cancelQuoteAction} hidden={{ id: q.id }} variant="ghost" size="md" confirm="Cancel this quote?">Cancel</ActionButton>}
            {open && !expired && <ActionButton action={submitQuoteAction} hidden={{ id: q.id }} variant="primary" size="md">{q.belowMinMargin ? "Submit for approval" : "Approve & finalize"}</ActionButton>}
            {q.status === "PENDING_APPROVAL" && can(u, "quotes.approve") && (
              <>
                <FormModal title="Reject quote" trigger="Reject" triggerVariant="secondary" triggerSize="md" action={approveQuoteAction} hidden={{ id: q.id, decision: "reject" }} submit="Reject" fields={[{ name: "note", label: "Reason", required: true }]} />
                <FormModal title="Approve below-margin quote" trigger="Approve" triggerVariant="gold" triggerSize="md" action={approveQuoteAction} hidden={{ id: q.id, decision: "approve" }} submit="Approve" intro="This quote is priced below the configured minimum margin. Your approval is recorded in the audit log." fields={[{ name: "note", label: "Approval note" }]} />
              </>
            )}
            {q.status === "APPROVED" && !expired && can(u, "orders.manage") && <ActionButton action={convertQuoteAction} hidden={{ id: q.id }} variant="primary" size="md">Convert to sales order</ActionButton>}
            {q.order && <LinkButton href={`/sales/orders/${q.order.id}`}>Order {q.order.number} →</LinkButton>}
          </>
        }
      />
      {q.belowMinMargin && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
          <ShieldAlert size={18} className="mt-0.5 shrink-0" />
          <div>Priced below the minimum acceptable margin. {q.status === "PENDING_APPROVAL" ? "Awaiting owner approval." : q.approvedBy ? `Approved by ${users.get(q.approvedBy)} on ${q.approvedAt?.toLocaleDateString("en-US")}.` : "Requires approval before conversion."}</div>
        </div>
      )}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card title="Lines" pad={false}>
          <Table head={["Product", "Quantity", "Unit price", "Extended", ...(fin ? ["Unit cost", "Margin"] : [])]}>
            {q.lines.map((l) => {
              const m = dec(l.unitPrice).isZero() ? null : dec(l.unitPrice).minus(dec(l.unitCost)).div(dec(l.unitPrice));
              return (
                <tr key={l.id}>
                  <td><div className="font-medium">{l.product.name}</div>{l.description && <div className="text-xs text-fg-3">{l.description}</div>}</td>
                  <td className="num">{fmtQty(l.quantity, 3)} {l.product.unitCode}</td>
                  <td className="num">{fmtMoney(l.unitPrice, q.currency)}</td>
                  <td className="num font-medium">{fmtMoney(dec(l.quantity).times(dec(l.unitPrice)), q.currency)}</td>
                  {fin && <><td className="num text-fg-2">{fmtMoney(l.unitCost, q.currency)}</td><td className="num">{fmtPct(m)}</td></>}
                </tr>
              );
            })}
          </Table>
        </Card>
        <Card title="Summary">
          <Stat label="Status" value={<StatusBadge status={q.status} />} />
          <Stat label="Total" value={fmtMoney(total, q.currency)} />
          {fin && <Stat label="Estimated cost" value={fmtMoney(cost, q.currency)} />}
          {fin && <Stat label="Estimated gross profit" value={fmtMoney(total.minus(cost), q.currency)} tone={total.minus(cost).lt(0) ? "crit" : "pos"} />}
          {fin && <Stat label="Estimated margin" value={fmtPct(total.isZero() ? null : total.minus(cost).div(total))} />}
          <Stat label="Delivery terms" value={q.deliveryTerms ?? "—"} />
          <Stat label="Payment terms" value={q.paymentTerms ?? "—"} />
          <Stat label="Created by" value={q.createdBy ? users.get(q.createdBy) : "—"} />
          {q.scenario && <Stat label="Pricing scenario" value={<Link className="text-accent" href={`/pricing?scenario=${q.scenario.id}`}>{q.scenario.name}</Link>} />}
          {q.notes && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-xs text-fg-2">{q.notes}</p>}
          <p className="mt-4 text-xs text-fg-3"><Badge>Note</Badge> CSC Command does not email quotes. Download the PDF and send it yourself.</p>
        </Card>
      </div>
    </>
  );
}
