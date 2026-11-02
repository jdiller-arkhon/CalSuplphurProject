import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, fixture, db } from "./helpers";
import * as inv from "@/server/services/inventory";
import * as invo from "@/server/services/invoicing";
import { invoicePdf } from "@/server/reports/pdf";
import { normaliseModules, moduleForPath, SIMPLE_PRESET } from "@/lib/modules";

let f: Awaited<ReturnType<typeof fixture>>;
let customerId: string;
beforeEach(async () => {
  await resetDb();
  f = await fixture();
  customerId = (await db.customer.create({ data: { name: "Acme Ag", paymentTerms: "Net 30", billingAddress: "1 Farm Rd" } })).id;
});
const d = (s: string) => new Date(s + "T00:00:00Z");
const base = () => ({ customerId, issueDate: d("2026-11-02"), dueDate: d("2026-12-02") });

describe("invoice totals", () => {
  it("rounds each line to cents and taxes the subtotal", () => {
    const t = invo.totals([{ quantity: "24.255", unitPrice: "118.9" }, { quantity: "1", unitPrice: "650" }], "0.0725");
    expect(t.amounts.map(String)).toEqual(["2883.92", "650"]);
    expect(t.subtotal.toString()).toBe("3533.92");
    expect(t.taxAmount.toString()).toBe("256.21");
    expect(t.total.toString()).toBe("3790.13");
  });
});

describe("invoice lifecycle", () => {
  it("drafts, issues with a gap-free number, takes stock, records payments and settles", async () => {
    const r = await inv.receive(f.ctx, { productId: f.product.id, locationId: f.plant.id, lotNumber: "L1", quantity: "100", unitCost: "80" });
    const draft = await invo.createDraft(f.ctx, { ...base(), lines: [{ productId: f.product.id, description: "Prill", quantity: "25", unitLabel: "MT", unitPrice: "120", lotId: r.lotId }, { description: "Freight", quantity: "1", unitPrice: "500" }] });
    expect(draft.number).toBeNull();
    expect((await db.invoice.findUniqueOrThrow({ where: { id: draft.id } })).total.toString()).toBe("3500");
    expect((await db.inventoryLot.findUniqueOrThrow({ where: { id: r.lotId } })).onHand.toString()).toBe("100"); // drafts don't move stock
    const issued = await invo.issue(f.ctx, draft.id);
    expect(issued.number).toMatch(/^INV-\d{4}-00001$/);
    await invo.issue(f.ctx, draft.id); // double click is a no-op
    expect((await db.inventoryLot.findUniqueOrThrow({ where: { id: r.lotId } })).onHand.toString()).toBe("75");
    const line = await db.invoiceLine.findFirstOrThrow({ where: { invoiceId: draft.id, lotId: r.lotId } });
    expect(line.unitCost!.toString()).toBe("80");
    await expect(invo.updateDraft(f.ctx, draft.id, { ...base(), lines: [{ description: "x", quantity: "1", unitPrice: "1" }] })).rejects.toThrow(/Only draft/);
    await invo.recordPayment(f.ctx, { invoiceId: draft.id, amount: "1000", receivedAt: d("2026-11-10"), method: "CHECK" });
    expect((await db.invoice.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe("PARTIALLY_PAID");
    await expect(invo.recordPayment(f.ctx, { invoiceId: draft.id, amount: "2600", receivedAt: d("2026-11-11"), method: "ACH" })).rejects.toThrow(/still owed/);
    await invo.recordPayment(f.ctx, { invoiceId: draft.id, amount: "2500", receivedAt: d("2026-11-11"), method: "ACH" });
    expect((await db.invoice.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe("PAID");
  });
  it("refuses to take more stock than is available and leaves the invoice a draft", async () => {
    const r = await inv.receive(f.ctx, { productId: f.product.id, locationId: f.plant.id, lotNumber: "L1", quantity: "10", unitCost: "80" });
    const dr = await invo.createDraft(f.ctx, { ...base(), lines: [{ productId: f.product.id, description: "Prill", quantity: "11", unitPrice: "120", lotId: r.lotId }] });
    await expect(invo.issue(f.ctx, dr.id)).rejects.toThrow(/available/);
    expect((await db.invoice.findUniqueOrThrow({ where: { id: dr.id } })).status).toBe("DRAFT");
    expect((await db.inventoryLot.findUniqueOrThrow({ where: { id: r.lotId } })).onHand.toString()).toBe("10");
  });
  it("voiding returns stock to the lot and needs payments removed first", async () => {
    const r = await inv.receive(f.ctx, { productId: f.product.id, locationId: f.plant.id, lotNumber: "L1", quantity: "50", unitCost: "80" });
    const dr = await invo.createDraft(f.ctx, { ...base(), lines: [{ productId: f.product.id, description: "Prill", quantity: "20", unitPrice: "100", lotId: r.lotId }] });
    await invo.issue(f.ctx, dr.id);
    await invo.recordPayment(f.ctx, { invoiceId: dr.id, amount: "100", receivedAt: d("2026-11-05"), method: "WIRE" });
    await expect(invo.voidInvoice(f.ctx, dr.id, "Wrong customer")).rejects.toThrow(/payments/);
    const p = await db.invoicePayment.findFirstOrThrow();
    await invo.deletePayment(f.ctx, p.id);
    expect((await db.invoice.findUniqueOrThrow({ where: { id: dr.id } })).status).toBe("ISSUED");
    await invo.voidInvoice(f.ctx, dr.id, "Wrong customer");
    expect((await db.invoice.findUniqueOrThrow({ where: { id: dr.id } })).status).toBe("VOID");
    expect((await db.inventoryLot.findUniqueOrThrow({ where: { id: r.lotId } })).onHand.toString()).toBe("50");
    await invo.voidInvoice(f.ctx, dr.id, "again"); // idempotent
    expect((await db.inventoryLot.findUniqueOrThrow({ where: { id: r.lotId } })).onHand.toString()).toBe("50");
  });
  it("validates input", async () => {
    await expect(invo.createDraft(f.ctx, { ...base(), lines: [] })).rejects.toThrow(/at least one/);
    await expect(invo.createDraft(f.ctx, { ...base(), dueDate: d("2026-10-01"), lines: [{ description: "x", quantity: "1", unitPrice: "1" }] })).rejects.toThrow(/due date/);
    await expect(invo.createDraft(f.ctx, { ...base(), lines: [{ description: "x", quantity: "0", unitPrice: "1" }] })).rejects.toThrow(/greater than zero/);
  });
  it("ages receivables by days past due", async () => {
    for (const [due, amt] of [["2026-11-20", "100"], ["2026-10-20", "200"], ["2026-07-01", "300"]] as const) {
      const dr = await invo.createDraft(f.ctx, { customerId, issueDate: d("2026-06-01"), dueDate: d(due), lines: [{ description: "x", quantity: "1", unitPrice: amt }] });
      await invo.issue(f.ctx, dr.id);
    }
    const a = await invo.receivables(new Date("2026-11-02T12:00:00Z"));
    expect(a.total.toString()).toBe("600");
    expect(a.buckets.current.toString()).toBe("100");
    expect(a.buckets.d1_30.toString()).toBe("200");
    expect(a.buckets.d90.toString()).toBe("300");
    expect(a.overdue.toString()).toBe("500");
  });
});

describe("invoice PDF", () => {
  it("renders a single-page branded PDF that never prints cost", async () => {
    const r = await inv.receive(f.ctx, { productId: f.product.id, locationId: f.plant.id, lotNumber: "L1", quantity: "40", unitCost: "80" });
    const dr = await invo.createDraft(f.ctx, { ...base(), lines: [{ productId: f.product.id, description: "Prill", quantity: "10", unitLabel: "MT", unitPrice: "120", lotId: r.lotId }] });
    await invo.issue(f.ctx, dr.id);
    const buf = await invoicePdf(dr.id);
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
    const txt = buf.toString("latin1");
    expect((txt.match(/\/Type \/Page\b/g) ?? []).length).toBe(1);
    expect(txt).not.toMatch(/\b80\.00\b/); // lot cost must not appear
  });
});

describe("sections on/off", () => {
  it("always keeps inventory and pulls in required sections", () => {
    expect(normaliseModules(null).length).toBeGreaterThan(10);
    expect(normaliseModules(["invoicing"])).toEqual(["inventory", "invoicing", "customers"]);
    expect(normaliseModules(["sales", "bogus"])).toEqual(["inventory", "customers", "sales"]);
    expect(normaliseModules(SIMPLE_PRESET)).toEqual(["inventory", "pricing", "invoicing", "customers"]);
  });
  it("maps paths to sections", () => {
    expect(moduleForPath("/market")).toBe("pricing");
    expect(moduleForPath("/invoices/abc")).toBe("invoicing");
    expect(moduleForPath("/inventory/locations")).toBe("inventory");
    expect(moduleForPath("/")).toBeNull();
    expect(moduleForPath("/salesforce")).toBeNull();
  });
});
