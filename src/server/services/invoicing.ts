import type { Prisma } from "@prisma/client";
import { db, serializable, nextNumber, type Tx } from "../db";
import { audit } from "../audit";
import { D, dec, money, unitAmt, qty as q6, type DecInput, type Dec } from "@/lib/decimal";
import * as inv from "./inventory";

export class InvoiceError extends Error { name = "InvoiceError"; }
type Ctx = { userId: string };

export type InvoiceLineInput = { productId?: string | null; description: string; quantity: DecInput; unitLabel?: string | null; unitPrice: DecInput; lotId?: string | null };
export type InvoiceInput = { customerId: string; issueDate: Date; dueDate: Date; paymentTerms?: string | null; customerPo?: string | null; taxPct?: DecInput; billTo?: string | null; shipTo?: string | null; notes?: string | null; salesOrderId?: string | null; lines: InvoiceLineInput[] };

/** Totals with half-up rounding: each line to cents, tax on the subtotal. */
export function totals(lines: { quantity: DecInput; unitPrice: DecInput }[], taxPct: DecInput = 0) {
  const amounts = lines.map((l) => money(dec(l.quantity).times(dec(l.unitPrice))));
  const subtotal = money(amounts.reduce((s, a) => s.plus(a), new D(0)));
  const taxAmount = money(subtotal.times(dec(taxPct)));
  return { amounts, subtotal, taxAmount, total: money(subtotal.plus(taxAmount)) };
}

function validate(i: InvoiceInput) {
  if (!i.lines.length) throw new InvoiceError("Add at least one line.");
  if (i.dueDate < i.issueDate) throw new InvoiceError("The due date can't be before the invoice date.");
  const t = dec(i.taxPct ?? 0);
  if (t.lt(0) || t.gte(1)) throw new InvoiceError("Tax must be between 0% and 100%.");
  for (const l of i.lines) {
    if (!l.description.trim()) throw new InvoiceError("Every line needs a description.");
    if (dec(l.quantity).lte(0)) throw new InvoiceError("Quantities must be greater than zero.");
    if (dec(l.unitPrice).lt(0)) throw new InvoiceError("Prices can't be negative. Use a separate credit for refunds.");
    if (l.lotId && !l.productId) throw new InvoiceError("A stock lot can only be used on a product line.");
  }
}

async function writeLines(tx: Tx, invoiceId: string, i: InvoiceInput) {
  for (const l of i.lines) if (l.lotId) {
    const lot = await tx.inventoryLot.findUnique({ where: { id: l.lotId } });
    if (!lot || lot.productId !== l.productId) throw new InvoiceError("The chosen stock lot doesn't hold that product.");
  }
  const t = totals(i.lines, i.taxPct ?? 0);
  await tx.invoiceLine.deleteMany({ where: { invoiceId } });
  await tx.invoiceLine.createMany({ data: i.lines.map((l, n) => ({ invoiceId, position: n, productId: l.productId || null, description: l.description.trim(), quantity: q6(l.quantity).toString(), unitLabel: l.unitLabel || null, unitPrice: unitAmt(l.unitPrice).toString(), amount: t.amounts[n].toString(), lotId: l.lotId || null })) });
  return t;
}

const header = (i: InvoiceInput) => ({ customerId: i.customerId, issueDate: i.issueDate, dueDate: i.dueDate, paymentTerms: i.paymentTerms || null, customerPo: i.customerPo || null, taxPct: dec(i.taxPct ?? 0).toString(), billTo: i.billTo || null, shipTo: i.shipTo || null, notes: i.notes || null, salesOrderId: i.salesOrderId || null });

export async function createDraft(ctx: Ctx, i: InvoiceInput) {
  validate(i);
  return serializable(async (tx) => {
    const c = await tx.customer.findUnique({ where: { id: i.customerId } });
    if (!c) throw new InvoiceError("Customer not found.");
    const draft = await tx.invoice.create({ data: { ...header(i), currency: c.currency, billTo: i.billTo ?? c.billingAddress, shipTo: i.shipTo ?? c.shippingAddress, paymentTerms: i.paymentTerms ?? c.paymentTerms, createdBy: ctx.userId } });
    const t = await writeLines(tx, draft.id, i);
    await tx.invoice.update({ where: { id: draft.id }, data: { subtotal: t.subtotal.toString(), taxAmount: t.taxAmount.toString(), total: t.total.toString() } });
    await audit(tx, { userId: ctx.userId, action: "invoice.create", entity: "Invoice", entityId: draft.id, summary: `Created draft invoice for ${c.name} (${t.total.toFixed(2)})` });
    return draft;
  });
}

export async function updateDraft(ctx: Ctx, id: string, i: InvoiceInput) {
  validate(i);
  return serializable(async (tx) => {
    const cur = await tx.invoice.findUnique({ where: { id } });
    if (!cur) throw new InvoiceError("Invoice not found.");
    if (cur.status !== "DRAFT") throw new InvoiceError("Only draft invoices can be edited. Void and re-issue to change an issued invoice.");
    const t = await writeLines(tx, id, i);
    await tx.invoice.update({ where: { id }, data: { ...header(i), subtotal: t.subtotal.toString(), taxAmount: t.taxAmount.toString(), total: t.total.toString() } });
    await audit(tx, { userId: ctx.userId, action: "invoice.update", entity: "Invoice", entityId: id, summary: `Edited draft invoice (${t.total.toFixed(2)})` });
  });
}

export function deleteDraft(ctx: Ctx, id: string) {
  return serializable(async (tx) => {
    const cur = await tx.invoice.findUnique({ where: { id } });
    if (!cur) throw new InvoiceError("Invoice not found.");
    if (cur.status !== "DRAFT") throw new InvoiceError("Issued invoices can't be deleted; void them instead.");
    await tx.invoice.delete({ where: { id } });
    await audit(tx, { userId: ctx.userId, action: "invoice.delete", entity: "Invoice", entityId: id, summary: "Deleted draft invoice" });
  });
}

/** Locks the invoice, assigns the next number, and takes stock out of any lots chosen on its lines. */
export function issue(ctx: Ctx, id: string) {
  return serializable(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${id} FOR UPDATE`;
    const cur = await tx.invoice.findUnique({ where: { id }, include: { lines: { include: { product: true } }, customer: true } });
    if (!cur) throw new InvoiceError("Invoice not found.");
    if (cur.status !== "DRAFT") return cur; // already issued: no-op (double click / retry)
    if (dec(cur.total).lte(0)) throw new InvoiceError("The invoice total must be greater than zero.");
    const number = await nextNumber(tx, "INV");
    for (const l of cur.lines) if (l.lotId) {
      const lot = await tx.inventoryLot.findUniqueOrThrow({ where: { id: l.lotId } });
      const mv = await inv.shipOutTx(tx, ctx, { lotId: l.lotId, quantity: l.quantity.toString(), reference: number, idempotencyKey: `invoice:${l.id}` });
      await tx.invoiceLine.update({ where: { id: l.id }, data: { movementId: mv.id, unitCost: lot.unitCost.toString() } });
    }
    const out = await tx.invoice.update({ where: { id }, data: { status: "ISSUED", number, issuedAt: new Date() } });
    await audit(tx, { userId: ctx.userId, action: "invoice.issue", entity: "Invoice", entityId: id, summary: `Issued ${number} to ${cur.customer.name} for ${cur.currency} ${dec(cur.total).toFixed(2)}` });
    return out;
  });
}

const statusFor = (paid: Dec, total: Dec): "PAID" | "PARTIALLY_PAID" | "ISSUED" => (paid.gte(total) ? "PAID" : paid.gt(0) ? "PARTIALLY_PAID" : "ISSUED");

export function recordPayment(ctx: Ctx, i: { invoiceId: string; amount: DecInput; receivedAt: Date; method: Prisma.InvoicePaymentCreateInput["method"]; reference?: string | null; note?: string | null }) {
  return serializable(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${i.invoiceId} FOR UPDATE`;
    const cur = await tx.invoice.findUnique({ where: { id: i.invoiceId } });
    if (!cur) throw new InvoiceError("Invoice not found.");
    if (cur.status === "DRAFT") throw new InvoiceError("Issue the invoice before recording payments.");
    if (cur.status === "VOID") throw new InvoiceError("This invoice is void.");
    const amount = money(i.amount);
    if (amount.lte(0)) throw new InvoiceError("Payment amount must be greater than zero.");
    const balance = dec(cur.total).minus(dec(cur.amountPaid));
    if (amount.gt(balance)) throw new InvoiceError(`That's more than the ${balance.toFixed(2)} still owed.`);
    await tx.invoicePayment.create({ data: { invoiceId: cur.id, amount: amount.toString(), receivedAt: i.receivedAt, method: i.method, reference: i.reference || null, note: i.note || null, createdBy: ctx.userId } });
    const paid = dec(cur.amountPaid).plus(amount);
    await tx.invoice.update({ where: { id: cur.id }, data: { amountPaid: paid.toString(), status: statusFor(paid, dec(cur.total)) } });
    await audit(tx, { userId: ctx.userId, action: "invoice.payment", entity: "Invoice", entityId: cur.id, summary: `Recorded ${amount.toFixed(2)} payment on ${cur.number}` });
  });
}

export function deletePayment(ctx: Ctx, paymentId: string) {
  return serializable(async (tx) => {
    const p = await tx.invoicePayment.findUnique({ where: { id: paymentId }, include: { invoice: true } });
    if (!p) throw new InvoiceError("Payment not found.");
    if (p.invoice.status === "VOID") throw new InvoiceError("This invoice is void.");
    await tx.invoicePayment.delete({ where: { id: p.id } });
    const paid = D.max(0, dec(p.invoice.amountPaid).minus(dec(p.amount)));
    await tx.invoice.update({ where: { id: p.invoiceId }, data: { amountPaid: paid.toString(), status: statusFor(paid, dec(p.invoice.total)) } });
    await audit(tx, { userId: ctx.userId, action: "invoice.payment.delete", entity: "Invoice", entityId: p.invoiceId, summary: `Removed ${dec(p.amount).toFixed(2)} payment from ${p.invoice.number}` });
  });
}

/** Cancels an issued invoice. Stock taken on issue goes back into the same lots. Paid invoices must have payments removed first. */
export async function voidInvoice(ctx: Ctx, id: string, reason: string) {
  if (!reason.trim()) throw new InvoiceError("A reason is required to void an invoice.");
  return serializable(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${id} FOR UPDATE`;
    const cur = await tx.invoice.findUnique({ where: { id }, include: { lines: true } });
    if (!cur) throw new InvoiceError("Invoice not found.");
    if (cur.status === "VOID") return;
    if (cur.status === "DRAFT") throw new InvoiceError("Drafts can simply be deleted.");
    if (dec(cur.amountPaid).gt(0)) throw new InvoiceError("Remove the recorded payments before voiding (or issue a credit instead).");
    for (const l of cur.lines) if (l.movementId && l.lotId) await inv.adjustTx(tx, ctx, { lotId: l.lotId, delta: l.quantity.toString(), reason: `Void ${cur.number}: ${reason}`, idempotencyKey: `invoice-void:${l.id}` });
    await tx.invoice.update({ where: { id }, data: { status: "VOID", voidReason: reason } });
    await audit(tx, { userId: ctx.userId, action: "invoice.void", entity: "Invoice", entityId: id, summary: `Voided ${cur.number}: ${reason}` });
  });
}

const DAY = 86400000;
/** Receivables: open balances bucketed by days past due. */
export async function receivables(now = new Date()) {
  const open = await db.invoice.findMany({ where: { status: { in: ["ISSUED", "PARTIALLY_PAID"] } }, include: { customer: true }, orderBy: { dueDate: "asc" } });
  const buckets = { current: new D(0), d1_30: new D(0), d31_60: new D(0), d61_90: new D(0), d90: new D(0) };
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const rows = open.map((i) => {
    const balance = dec(i.total).minus(dec(i.amountPaid));
    const late = Math.floor((today.getTime() - i.dueDate.getTime()) / DAY);
    const k = late <= 0 ? "current" : late <= 30 ? "d1_30" : late <= 60 ? "d31_60" : late <= 90 ? "d61_90" : "d90";
    buckets[k] = buckets[k].plus(balance);
    return { invoice: i, balance, daysLate: Math.max(0, late) };
  });
  const total = rows.reduce((s, r) => s.plus(r.balance), new D(0));
  const overdue = total.minus(buckets.current);
  const byCustomer = Object.values(rows.reduce<Record<string, { id: string; name: string; balance: Dec; overdue: Dec; count: number }>>((m, r) => {
    const c = (m[r.invoice.customerId] ??= { id: r.invoice.customerId, name: r.invoice.customer.name, balance: new D(0), overdue: new D(0), count: 0 });
    c.balance = c.balance.plus(r.balance); c.count++; if (r.daysLate > 0) c.overdue = c.overdue.plus(r.balance);
    return m;
  }, {})).sort((a, b) => b.balance.comparedTo(a.balance));
  return { rows, buckets, total, overdue, byCustomer };
}
