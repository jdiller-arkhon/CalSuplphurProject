"use server";
import { z } from "zod";
import { db } from "../db";
import { audit } from "../audit";
import { action, zReq, zOpt, zDec, zDate, UserError } from "../action";
import type { ActionState } from "../action";
import * as invo from "../services/invoicing";
import { setSetting } from "../services/settings";
import { normaliseModules, MODULE_KEYS } from "@/lib/modules";
import { validateUpload, saveFile } from "../storage";

const logoImpl = action("settings.manage", z.object({ logo: z.instanceof(File) }), async (d, u) => {
  if (!["image/png", "image/jpeg"].includes(d.logo.type)) throw new UserError("Use a PNG or JPG logo (PDFs can't embed other formats).");
  if (d.logo.size > 2 * 1024 * 1024) throw new UserError("Logos must be 2 MB or smaller.");
  const buf = Buffer.from(await d.logo.arrayBuffer());
  validateUpload(d.logo, buf);
  const { key } = await saveFile(buf);
  await setSetting(db, "company.logo", { key, mime: d.logo.type });
  await audit(db, { userId: u.id, action: "settings.logo", entity: "AppSetting", summary: "Uploaded company logo" });
  return "Logo saved. It now appears on invoices and quotes.";
}, { revalidate: ["/settings/sections"] });
export async function uploadLogo(prev: ActionState, fd: FormData) { return logoImpl(prev, fd); }

const removeLogoImpl = action("settings.manage", z.object({}).passthrough(), async (_d, u) => {
  await setSetting(db, "company.logo", null);
  await audit(db, { userId: u.id, action: "settings.logo.remove", entity: "AppSetting", summary: "Removed company logo" });
  return "Logo removed.";
}, { revalidate: ["/settings/sections"] });
export async function removeLogo(prev: ActionState, fd: FormData) { return removeLogoImpl(prev, fd); }

const line = z.object({
  productId: zOpt(40),
  description: zReq("Description", 300),
  quantity: zDec("Quantity", { min: 0, allowZero: false }),
  unitLabel: zOpt(20),
  unitPrice: zDec("Price", { min: 0 }),
  lotId: zOpt(40),
});
const invoiceSchema = z.object({
  id: zOpt(40),
  intent: z.enum(["save", "issue"]).default("save"),
  customerId: zReq("Customer", 40),
  issueDate: zDate("Invoice date"),
  dueDate: zDate("Due date"),
  paymentTerms: zOpt(120),
  customerPo: zOpt(80),
  taxPct: z.string().trim().optional().transform((v) => (v ? v : "0")).pipe(zDec("Tax", { min: 0 })),
  billTo: zOpt(500),
  shipTo: zOpt(500),
  notes: zOpt(2000),
  salesOrderId: zOpt(40),
  lines: z.array(line).min(1, "Add at least one line"),
});

const saveImpl = action("invoices.manage", invoiceSchema, async (d, u) => {
  const input: invo.InvoiceInput = { ...d, taxPct: (Number(d.taxPct) / 100).toFixed(6), lines: d.lines };
  if (Number(d.taxPct) >= 100) throw new UserError("Tax must be below 100%.");
  let id = d.id;
  if (id) await invo.updateDraft({ userId: u.id }, id, input);
  else id = (await invo.createDraft({ userId: u.id }, input)).id;
  if (d.intent === "issue") {
    const i = await invo.issue({ userId: u.id }, id);
    return { message: `Invoice ${i.number} issued.`, redirect: `/invoices/${id}` };
  }
  return { message: "Draft saved.", redirect: `/invoices/${id}` };
}, { revalidate: ["/invoices", "/inventory", "/"] });
export async function saveInvoice(prev: ActionState, fd: FormData) { return saveImpl(prev, fd); }

const issueImpl = action("invoices.manage", z.object({ id: zReq("Invoice", 40) }), async (d, u) => {
  const i = await invo.issue({ userId: u.id }, d.id);
  return `Invoice ${i.number} issued.`;
}, { revalidate: ["/invoices", "/inventory", "/"] });
export async function issueInvoice(prev: ActionState, fd: FormData) { return issueImpl(prev, fd); }

const delImpl = action("invoices.manage", z.object({ id: zReq("Invoice", 40) }), async (d, u) => {
  await invo.deleteDraft({ userId: u.id }, d.id);
  return { message: "Draft deleted.", redirect: "/invoices" };
}, { revalidate: ["/invoices"] });
export async function deleteInvoice(prev: ActionState, fd: FormData) { return delImpl(prev, fd); }

const payImpl = action("invoices.manage", z.object({ invoiceId: zReq("Invoice", 40), amount: zDec("Amount", { min: 0, allowZero: false }), receivedAt: zDate("Date received"), method: z.enum(["CHECK", "ACH", "WIRE", "CARD", "CASH", "OTHER"]), reference: zOpt(120), note: zOpt(500) }), async (d, u) => {
  if (d.receivedAt.getTime() > Date.now() + 86400000) throw new UserError("The payment date can't be in the future.");
  await invo.recordPayment({ userId: u.id }, d);
  return "Payment recorded.";
}, { revalidate: ["/invoices", "/"] });
export async function recordPayment(prev: ActionState, fd: FormData) { return payImpl(prev, fd); }

const delPayImpl = action("invoices.manage", z.object({ id: zReq("Payment", 40) }), async (d, u) => {
  await invo.deletePayment({ userId: u.id }, d.id);
  return "Payment removed.";
}, { revalidate: ["/invoices", "/"] });
export async function deletePayment(prev: ActionState, fd: FormData) { return delPayImpl(prev, fd); }

const voidImpl = action("invoices.manage", z.object({ id: zReq("Invoice", 40), reason: zReq("Reason", 300) }), async (d, u) => {
  await invo.voidInvoice({ userId: u.id }, d.id, d.reason);
  return "Invoice voided. Any stock it took has been returned.";
}, { revalidate: ["/invoices", "/inventory", "/"] });
export async function voidInvoice(prev: ActionState, fd: FormData) { return voidImpl(prev, fd); }

const defaultsImpl = action("settings.manage", z.object({ paymentTerms: zOpt(120), dueDays: z.coerce.number().int().min(0).max(365), taxPct: zDec("Tax", { min: 0 }), footer: zOpt(1000), remitTo: zOpt(1000) }), async (d, u) => {
  await setSetting(db, "invoices.defaults", { paymentTerms: d.paymentTerms ?? "", dueDays: d.dueDays, taxPct: (Number(d.taxPct) / 100).toFixed(6), footer: d.footer ?? "", remitTo: d.remitTo ?? "" });
  await audit(db, { userId: u.id, action: "settings.invoices", entity: "AppSetting", summary: "Updated invoice defaults" });
  return "Invoice defaults saved.";
}, { revalidate: ["/invoices", "/settings"] });
export async function saveInvoiceDefaults(prev: ActionState, fd: FormData) { return defaultsImpl(prev, fd); }

const modulesImpl = action("settings.manage", z.object({ modules: z.array(z.string()).optional(), preset: z.enum(["simple", "all", ""]).optional() }), async (d, u) => {
  const list = d.preset === "all" ? [...MODULE_KEYS] : d.preset === "simple" ? ["inventory", "pricing", "invoicing", "customers"] : (d.modules ?? []);
  const on = normaliseModules(list);
  await setSetting(db, "modules.enabled", on);
  await audit(db, { userId: u.id, action: "settings.modules", entity: "AppSetting", summary: `Sections on: ${on.join(", ")}` });
  return { message: "Sections updated.", redirect: "/settings/sections" };
}, { revalidate: ["/"] });
export async function saveModules(prev: ActionState, fd: FormData) { return modulesImpl(prev, fd); }
