"use server";

import { z } from "zod";
import { action, zReq, zOpt, zDec, zDate, zDateOpt } from "../action";
import type { ActionState } from "../action";
import * as sales from "../services/sales";
import { db } from "../db";

const line = z.object({ productId: zReq("Product"), description: zOpt(300), quantity: zDec("Quantity", { min: 0, allowZero: false }), unitPrice: zDec("Unit price", { min: 0 }), unitCost: zOpt(30) });

const createQuoteActionImpl = action(
  "quotes.manage",
  z.object({ customerId: zReq("Customer"), scenarioId: zOpt(40), validUntil: zDate("Valid until"), deliveryTerms: zOpt(200), paymentTerms: zOpt(200), notes: zOpt(2000), lines: z.array(line).min(1, "Add at least one line") }),
  async (d, u) => {
    const q = await sales.createQuote({ userId: u.id }, d);
    return { message: q.belowMinMargin ? `Quote ${q.number} created — below minimum margin, approval will be required.` : `Quote ${q.number} created.`, redirect: `/sales/quotes/${q.id}` };
  },
);

const id = z.object({ id: zReq("id") });
const submitQuoteActionImpl = action("quotes.manage", id, async (d, u) => {
  const q = await sales.submitQuote({ userId: u.id }, d.id);
  return q.status === "APPROVED" ? "Quote approved — meets margin policy." : "Submitted for owner approval.";
});
const approveQuoteActionImpl = action("quotes.approve", z.object({ id: zReq("id"), decision: z.enum(["approve", "reject"]), note: zOpt(300) }), async (d, u) => {
  await sales.decideQuote({ userId: u.id, canApprove: u.permissions.has("quotes.approve") }, d.id, d.decision === "approve", d.note);
  return d.decision === "approve" ? "Quote approved." : "Quote rejected.";
});
const cancelQuoteActionImpl = action("quotes.manage", id, async (d, u) => {
  await sales.cancelQuote({ userId: u.id }, d.id);
  return "Quote cancelled.";
});
const convertQuoteActionImpl = action("orders.manage", id, async (d, u) => {
  const o = await sales.convertQuote({ userId: u.id }, d.id);
  return { message: `Sales order ${o.number} created.`, redirect: `/sales/orders/${o.id}` };
});
const duplicateQuoteActionImpl = action("quotes.manage", id, async (d, u) => {
  const q = await db.quote.findUniqueOrThrow({ where: { id: d.id }, include: { lines: true } });
  const n = await sales.createQuote({ userId: u.id }, { customerId: q.customerId, scenarioId: q.scenarioId ?? undefined, validUntil: new Date(Date.now() + 30 * 864e5), currency: q.currency, deliveryTerms: q.deliveryTerms ?? undefined, paymentTerms: q.paymentTerms ?? undefined, notes: q.notes ?? undefined, lines: q.lines.map((l) => ({ productId: l.productId, description: l.description ?? undefined, quantity: l.quantity, unitPrice: l.unitPrice })) });
  return { message: `Duplicated as ${n.number} with current costs.`, redirect: `/sales/quotes/${n.id}` };
});

const createOrderActionImpl = action(
  "orders.manage",
  z.object({ customerId: zReq("Customer"), requestedDate: zDateOpt, deliveryTerms: zOpt(200), paymentTerms: zOpt(200), notes: zOpt(2000), lines: z.array(line).min(1, "Add at least one line") }),
  async (d, u) => {
    const o = await sales.createOrder({ userId: u.id }, d);
    return { message: `Sales order ${o.number} created.`, redirect: `/sales/orders/${o.id}` };
  },
);
const allocateOrderActionImpl = action("orders.manage", z.object({ id: zReq("id"), locationId: zOpt(40) }), async (d, u) => {
  const r = await sales.allocateOrder({ userId: u.id }, d.id, d.locationId);
  return r.shortages.length ? `Partially allocated. Short: ${r.shortages.join("; ")}` : "Inventory allocated (oldest lots first).";
});
const cancelOrderActionImpl = action("orders.manage", z.object({ id: zReq("id"), reason: zReq("Reason", 300) }), async (d, u) => {
  await sales.cancelOrder({ userId: u.id }, d.id, d.reason);
  return "Order cancelled and reservations released.";
});

// Server Action exports must be async functions (Next.js requirement for "use server" files).
export async function createQuoteAction(prev: ActionState, fd: FormData) {
  return createQuoteActionImpl(prev, fd);
}
export async function submitQuoteAction(prev: ActionState, fd: FormData) {
  return submitQuoteActionImpl(prev, fd);
}
export async function approveQuoteAction(prev: ActionState, fd: FormData) {
  return approveQuoteActionImpl(prev, fd);
}
export async function cancelQuoteAction(prev: ActionState, fd: FormData) {
  return cancelQuoteActionImpl(prev, fd);
}
export async function convertQuoteAction(prev: ActionState, fd: FormData) {
  return convertQuoteActionImpl(prev, fd);
}
export async function duplicateQuoteAction(prev: ActionState, fd: FormData) {
  return duplicateQuoteActionImpl(prev, fd);
}
export async function createOrderAction(prev: ActionState, fd: FormData) {
  return createOrderActionImpl(prev, fd);
}
export async function allocateOrderAction(prev: ActionState, fd: FormData) {
  return allocateOrderActionImpl(prev, fd);
}
export async function cancelOrderAction(prev: ActionState, fd: FormData) {
  return cancelOrderActionImpl(prev, fd);
}
