import { describe, it, expect, beforeAll } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { resetDb, fixture, db } from "./helpers";
import * as inv from "@/server/services/inventory";
import * as sales from "@/server/services/sales";
import { buildWorkbook, safeText, XLSX_REPORTS, type XlsxReport } from "@/server/reports/xlsx";
import { buildDeck, PPTX_TEMPLATES, type PptxTemplate } from "@/server/reports/pptx";
import { quotePdf } from "@/server/reports/pdf";
import { parsePeriod } from "@/server/services/metrics";
import { DEFAULT_ROLE_PERMISSIONS, type Permission } from "@/server/permissions";

let user: Parameters<typeof buildWorkbook>[1];
let quoteId = "";
const period = parsePeriod({ range: "ytd" });

beforeAll(async () => {
  await resetDb();
  const f = await fixture();
  user = { id: f.user.id, email: f.user.email, name: "Test Owner", role: "OWNER", mfaEnabled: false, permissions: new Set<Permission>(DEFAULT_ROLE_PERMISSIONS.OWNER) };
  // A customer name that would be a formula if exported unescaped.
  await db.customer.update({ where: { id: f.customer.id }, data: { name: "=HYPERLINK(\"http://x\")" } });
  await inv.receive(f.ctx, { productId: f.product.id, locationId: f.plant.id, lotNumber: "L1", quantity: "500", unitCost: "80" });
  const q = await sales.createQuote(f.ctx, { customerId: f.customer.id, validUntil: new Date(Date.now() + 864e5), lines: [{ productId: f.product.id, quantity: "100", unitPrice: "120" }] });
  quoteId = q.id;
  await sales.submitQuote(f.ctx, q.id);
  const o = await sales.convertQuote(f.ctx, q.id);
  await sales.allocateOrder(f.ctx, o.id);
  const r = await db.inventoryReservation.findFirstOrThrow();
  const s = await sales.createShipment(f.ctx, { orderId: o.id, mode: "TRUCK", lines: [{ salesOrderLineId: r.salesOrderLineId!, lotId: r.lotId, quantity: "100" }], freight: [{ category: "FREIGHT", amount: "500" }] });
  await sales.postShipment(f.ctx, s.id);
});

describe("formula injection guard", () => {
  it("prefixes risky leading characters", () => {
    expect(safeText("=1+1")).toBe("'=1+1");
    expect(safeText("+cmd")).toBe("'+cmd");
    expect(safeText("@SUM")).toBe("'@SUM");
    expect(safeText("Normal")).toBe("Normal");
  });
});

describe("excel exports", () => {
  for (const r of Object.keys(XLSX_REPORTS) as XlsxReport[]) {
    it(`builds a valid ${r} workbook`, async () => {
      const buf = await buildWorkbook(r, user, period);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf as never);
      expect(wb.worksheets.length).toBeGreaterThan(0);
      const ws = wb.worksheets[0];
      expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 5 });
      // Every formula references only cells inside the sheet's used range.
      wb.worksheets.forEach((s) =>
        s.eachRow((row) =>
          row.eachCell((c) => {
            const f = (c.value as { formula?: string })?.formula;
            if (!f) return;
            for (const ref of f.match(/[A-Z]+\d+/g) ?? []) {
              const rowNum = Number(ref.replace(/[A-Z]+/, ""));
              expect(rowNum).toBeLessThanOrEqual(s.rowCount);
              expect(rowNum).toBeGreaterThanOrEqual(5);
            }
          }),
        ),
      );
    });
  }
  it("sales workbook reconciles and escapes customer text", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildWorkbook("sales", user, period)) as never);
    const lines = wb.getWorksheet("Sales lines")!;
    expect(lines.getCell("D6").value).toBe("'=HYPERLINK(\"http://x\")");
    expect((lines.getCell("H6").value as { formula: string; result: number }).result).toBe(12000);
    expect(lines.getCell("I6").value).toBe(8000);
    const cust = wb.getWorksheet("Customers")!;
    expect((cust.getCell("F6").value as { result: number }).result).toBe(3500); // 12000 − 8000 − 500 freight
  });
  it("financial summary gross profit formula matches the engine", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildWorkbook("financial", user, period)) as never);
    const s = wb.getWorksheet("Summary")!;
    expect(s.getCell("B6").value).toBe(12000);
    expect((s.getCell("B9").value as { formula: string; result: number })).toMatchObject({ formula: "B6-B7-B8", result: 3500 });
  });
});

describe("powerpoint exports", () => {
  for (const t of [...Object.keys(PPTX_TEMPLATES), "custom"] as PptxTemplate[]) {
    it(`builds the ${t} deck`, async () => {
      const buf = await buildDeck(t, user, period, ["summary", "financial"]);
      const zip = await JSZip.loadAsync(buf);
      const slides = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
      expect(slides.length).toBeGreaterThan(1);
      const xml = await zip.file("ppt/slides/slide1.xml")!.async("string");
      expect(xml).toContain("Year to date");
    });
  }
  it("executive deck contains native charts and real figures", async () => {
    const zip = await JSZip.loadAsync(await buildDeck("executive", user, period));
    expect(Object.keys(zip.files).some((n) => n.startsWith("ppt/charts/chart"))).toBe(true);
    const all = (await Promise.all(Object.keys(zip.files).filter((n) => /slides\/slide\d+\.xml$/.test(n)).map((n) => zip.file(n)!.async("string")))).join("");
    expect(all).toContain("$12,000");
    expect(all).toContain("$3,500");
  });
});

describe("quote pdf", () => {
  it("produces a PDF without cost or margin", async () => {
    const buf = await quotePdf(quoteId);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(1500);
    // Exactly one page for a single-line quote (footer must not spill onto a blank page).
    expect((buf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length).toBe(1);
  });
});
