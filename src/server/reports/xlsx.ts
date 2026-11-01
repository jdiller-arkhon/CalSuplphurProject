import ExcelJS from "exceljs";
import { dec } from "@/lib/decimal";
import { db } from "../db";
import type { CurrentUser } from "../auth";
import { financials, inventorySnapshot, inventoryIntelligence, gp, margin, type Period } from "../services/metrics";
import { getSettingTyped } from "../services/settings";

const NAVY = "FF101D2E", GOLD = "FFC49A52", LINE = "FFE3E9F0", BAND = "FFF7F9FC";
const MONEY = '"$"#,##0.00;[Red]-"$"#,##0.00';
const MONEY4 = '"$"#,##0.0000';
const QTY = "#,##0.000";
const PCT = "0.0%";

/** Neutralize spreadsheet formula injection in any text that came from users. */
export function safeText(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}
const n = (v: unknown) => (v === null || v === undefined || v === "" ? null : dec(v as string).toNumber());

type Col = { header: string; key: string; width: number; fmt?: string; total?: "sum"; text?: boolean };

async function sheet(wb: ExcelJS.Workbook, name: string, title: string, subtitle: string, cols: Col[], rows: Record<string, unknown>[], notes: string[] = []) {
  const ws = wb.addWorksheet(name.slice(0, 31), { views: [{ state: "frozen", ySplit: 5 }], properties: { defaultRowHeight: 18 } });
  ws.columns = cols.map((c) => ({ key: c.key, width: c.width }));
  const last = String.fromCharCode(64 + cols.length);
  ws.mergeCells(`A1:${last}1`);
  ws.getCell("A1").value = title;
  ws.getCell("A1").font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  ws.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  ws.getRow(1).height = 30;
  ws.mergeCells(`A2:${last}2`);
  ws.getCell("A2").value = subtitle;
  ws.getCell("A2").font = { italic: true, color: { argb: "FF64748B" } };
  ws.getRow(3).height = 4;
  ws.getRow(3).eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD } }));
  for (let i = 1; i <= cols.length; i++) ws.getCell(3, i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD } };
  const header = ws.getRow(5);
  cols.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: "FF172436" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF5" } };
    cell.border = { bottom: { style: "thin", color: { argb: "FF365D83" } } };
    cell.alignment = { vertical: "middle", horizontal: c.fmt ? "right" : "left", wrapText: true };
  });
  header.height = 22;
  rows.forEach((r, ri) => {
    const row = ws.getRow(6 + ri);
    cols.forEach((c, ci) => {
      const cell = row.getCell(ci + 1);
      const v = r[c.key];
      cell.value = v instanceof Date ? v : v === null || v === undefined ? null : c.fmt && !c.text ? (typeof v === "object" && "formula" in (v as object) ? (v as ExcelJS.CellFormulaValue) : n(v)) : safeText(v);
      if (c.fmt) cell.numFmt = c.fmt;
      if (ri % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND } };
      cell.border = { bottom: { style: "hair", color: { argb: LINE } } };
    });
  });
  const firstData = 6, lastData = 5 + rows.length;
  if (rows.length) {
    ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: lastData, column: cols.length } };
    if (cols.some((c) => c.total)) {
      const t = ws.getRow(lastData + 1);
      t.getCell(1).value = "Total";
      cols.forEach((c, ci) => {
        if (c.total) {
          const L = String.fromCharCode(65 + ci);
          t.getCell(ci + 1).value = { formula: `SUBTOTAL(9,${L}${firstData}:${L}${lastData})` };
          t.getCell(ci + 1).numFmt = c.fmt ?? "General";
        }
      });
      t.font = { bold: true };
      t.eachCell((c) => (c.border = { top: { style: "thin", color: { argb: "FF172436" } }, bottom: { style: "double", color: { argb: "FF172436" } } }));
    }
  } else {
    ws.getCell("A6").value = "No records for this report.";
    ws.getCell("A6").font = { italic: true, color: { argb: "FF64748B" } };
  }
  const nr = lastData + 3;
  notes.forEach((t, i) => {
    ws.getCell(`A${nr + i}`).value = t;
    ws.getCell(`A${nr + i}`).font = { size: 9, color: { argb: "FF64748B" } };
  });
  ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  return ws;
}

export const XLSX_REPORTS = {
  inventory: { label: "Inventory by lot", perm: "inventory.view" },
  valuation: { label: "Inventory valuation", perm: "inventory.value" },
  catalog: { label: "Product catalog", perm: "inventory.view" },
  pricing: { label: "Pricing scenarios", perm: "pricing.use" },
  sales: { label: "Sales history & customer profitability", perm: "finance.view" },
  purchasing: { label: "Purchase orders", perm: "purchasing.manage" },
  shipments: { label: "Shipment history", perm: "logistics.manage" },
  financial: { label: "Financial summary", perm: "finance.view" },
} as const;
export type XlsxReport = keyof typeof XLSX_REPORTS;

export async function buildWorkbook(report: XlsxReport, user: CurrentUser, p: Period & { label: string }): Promise<Buffer> {
  const company = await getSettingTyped("company.profile");
  const wb = new ExcelJS.Workbook();
  wb.creator = `CSC Command (${user.name})`;
  wb.created = new Date();
  const who = company.name || "California Sulphur Company";
  const stamp = `${who} · generated ${new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} by ${user.name}`;
  const val = user.permissions.has("inventory.value");
  const assumptions = ["Units: quantities are in each product's unit of measure. Currency: USD.", "Inventory cost: weighted average within each lot (pending company confirmation — see BUSINESS_ASSUMPTIONS.md)."];

  if (report === "inventory" || report === "valuation") {
    const snap = await inventorySnapshot();
    const cols: Col[] = [
      { header: "Product", key: "product", width: 30 }, { header: "SKU", key: "sku", width: 14 }, { header: "Location", key: "loc", width: 14 }, { header: "Lot", key: "lot", width: 14 },
      { header: "Received", key: "recv", width: 12, fmt: "yyyy-mm-dd" }, { header: "Unit", key: "unit", width: 7 },
      { header: "On hand", key: "onHand", width: 13, fmt: QTY, total: "sum" }, { header: "Reserved", key: "reserved", width: 13, fmt: QTY, total: "sum" }, { header: "Available", key: "avail", width: 13, fmt: QTY, total: "sum" },
      ...(val ? ([{ header: "Unit cost", key: "cost", width: 12, fmt: MONEY4 }, { header: "Value", key: "value", width: 15, fmt: MONEY, total: "sum" }] as Col[]) : []),
    ];
    const rows = snap.lots.map((l, i) => ({ product: l.product.name, sku: l.product.sku, loc: l.location.code, lot: l.lotNumber, recv: l.receivedAt, unit: l.product.unitCode, onHand: l.onHand, reserved: l.reserved, avail: { formula: `G${6 + i}-H${6 + i}`, result: l.available.toNumber() }, cost: l.unitCost, value: { formula: `G${6 + i}*J${6 + i}`, result: l.value.toNumber() } }));
    await sheet(wb, "Inventory", report === "valuation" ? "Inventory Valuation" : "Inventory by Lot", `As of ${new Date().toLocaleDateString("en-US", { dateStyle: "long" })} · ${stamp}`, cols, rows, assumptions);
    if (report === "valuation" && val) {
      const intel = await inventoryIntelligence(90);
      await sheet(wb, "By product", "Valuation by Product", stamp, [
        { header: "Product", key: "name", width: 30 }, { header: "Unit", key: "unit", width: 7 }, { header: "On hand", key: "onHand", width: 13, fmt: QTY, total: "sum" }, { header: "Value", key: "value", width: 15, fmt: MONEY, total: "sum" },
        { header: "Avg cost", key: "avg", width: 12, fmt: MONEY4 }, { header: "Shipped (90d)", key: "shipped", width: 14, fmt: QTY }, { header: "Days of inventory", key: "doi", width: 14, fmt: "#,##0" }, { header: "Turnover (annualized)", key: "turn", width: 14, fmt: "0.0x" },
      ], intel.rows.map((r) => ({ name: r.name, unit: r.unit, onHand: r.onHand, value: r.value, avg: r.averageCost, shipped: r.shippedQty, doi: r.daysOfInventory, turn: r.turnover })), ["Days of inventory = on hand ÷ average daily shipments over 90 days. Turnover = annualized COGS ÷ current value. Estimates."]);
    }
  } else if (report === "catalog") {
    const products = await db.product.findMany({ include: { category: true, defaultSupplier: true }, orderBy: { name: "asc" } });
    await sheet(wb, "Products", "Product Catalog", stamp, [
      { header: "SKU", key: "sku", width: 14 }, { header: "Product", key: "name", width: 30 }, { header: "Category", key: "cat", width: 18 }, { header: "Grade", key: "grade", width: 14 }, { header: "Unit", key: "unit", width: 7 },
      ...(val ? ([{ header: "Default cost", key: "cost", width: 13, fmt: MONEY4 }, { header: "Standard price", key: "price", width: 14, fmt: MONEY4 }, { header: "Min margin", key: "min", width: 11, fmt: PCT }] as Col[]) : []),
      { header: "Reorder point", key: "rop", width: 13, fmt: QTY }, { header: "Default supplier", key: "sup", width: 22 }, { header: "Status", key: "status", width: 10 },
    ], products.map((p) => ({ sku: p.sku, name: p.name, cat: p.category?.name, grade: p.grade, unit: p.unitCode, cost: p.defaultCost, price: p.standardPrice, min: p.minMarginPct, rop: p.reorderPoint, sup: p.defaultSupplier?.name, status: p.active ? "Active" : "Archived" })));
  } else if (report === "pricing") {
    const sc = await db.pricingScenario.findMany({ include: { product: true, customer: true, components: true }, orderBy: { createdAt: "desc" } });
    await sheet(wb, "Scenarios", "Pricing Scenarios", stamp, [
      { header: "Saved", key: "at", width: 12, fmt: "yyyy-mm-dd" }, { header: "Scenario", key: "name", width: 30 }, { header: "Product", key: "product", width: 24 }, { header: "Customer", key: "customer", width: 22 }, { header: "Qty", key: "qty", width: 12, fmt: QTY },
      { header: "Method", key: "method", width: 14 }, { header: "Landed cost", key: "cost", width: 13, fmt: MONEY4 }, { header: "Recommended", key: "rec", width: 13, fmt: MONEY4 }, { header: "Final", key: "fin", width: 13, fmt: MONEY4 }, { header: "Margin", key: "m", width: 10, fmt: PCT },
    ], sc.map((s) => { const r = s.result as { grossMarginPct?: string }; return { at: s.createdAt, name: s.name, product: s.product?.name, customer: s.customer?.name, qty: s.quantity, method: s.method.replace("_", " "), cost: s.unitCost, rec: s.recommendedPrice, fin: s.finalPrice, m: r.grossMarginPct }; }));
    await sheet(wb, "Cost inputs", "Scenario Cost Inputs", stamp, [{ header: "Scenario", key: "s", width: 30 }, { header: "Cost", key: "label", width: 26 }, { header: "Basis", key: "basis", width: 16 }, { header: "Amount", key: "amt", width: 13, fmt: "#,##0.0000" }],
      sc.flatMap((s) => s.components.map((c) => ({ s: s.name, label: c.label, basis: c.basis.replace(/_/g, " ").toLowerCase(), amt: c.amount }))), ["PERCENT OF PRICE amounts are fractions (0.02 = 2%)."]);
  } else if (report === "sales" || report === "financial") {
    const f = await financials(p);
    if (report === "financial") {
      await sheet(wb, "Summary", "Financial Summary", `${p.label} · ${stamp}`, [{ header: "Measure", key: "k", width: 34 }, { header: "Value", key: "v", width: 18, fmt: MONEY }], [
        { k: "Revenue (recognized on dispatch)", v: f.totals.revenue }, { k: "Cost of goods shipped (lot cost)", v: f.totals.cogs }, { k: "Direct freight", v: f.totals.freight }, { k: "Gross profit", v: { formula: "B6-B7-B8", result: gp(f.totals).toNumber() } },
      ], ["Gross profit is operational: revenue − cost of goods − direct freight. It is not net income; operating expenses are not included.", `Gross margin: ${margin(f.totals) ? margin(f.totals)!.times(100).toFixed(1) + "%" : "—"}`]);
      await sheet(wb, "By month", "Performance by Month", stamp, [{ header: "Month", key: "m", width: 12 }, { header: "Quantity", key: "q", width: 13, fmt: QTY, total: "sum" }, { header: "Revenue", key: "r", width: 15, fmt: MONEY, total: "sum" }, { header: "COGS", key: "c", width: 15, fmt: MONEY, total: "sum" }, { header: "Freight", key: "f", width: 13, fmt: MONEY, total: "sum" }, { header: "Gross profit", key: "g", width: 15, fmt: MONEY, total: "sum" }, { header: "Margin", key: "pm", width: 10, fmt: PCT }],
        f.months.map((m, i) => ({ m: m.key, q: m.quantity, r: m.revenue, c: m.cogs, f: m.freight, g: { formula: `C${6 + i}-D${6 + i}-E${6 + i}`, result: gp(m).toNumber() }, pm: { formula: `IF(C${6 + i}=0,"",F${6 + i}/C${6 + i})`, result: margin(m)?.toNumber() ?? "" } })));
    }
    await sheet(wb, "Sales lines", "Sales History (Dispatched)", `${p.label} · ${stamp}`, [
      { header: "Shipped", key: "at", width: 12, fmt: "yyyy-mm-dd" }, { header: "Shipment", key: "sh", width: 16 }, { header: "Order", key: "o", width: 16 }, { header: "Customer", key: "c", width: 24 }, { header: "Product", key: "p", width: 26 },
      { header: "Qty", key: "q", width: 12, fmt: QTY, total: "sum" }, { header: "Unit price", key: "up", width: 12, fmt: MONEY4 }, { header: "Revenue", key: "r", width: 14, fmt: MONEY, total: "sum" }, { header: "COGS", key: "cg", width: 14, fmt: MONEY, total: "sum" }, { header: "Product margin", key: "m", width: 12, fmt: PCT },
    ], f.facts.map((x, i) => ({ at: x.at, sh: x.shipmentNumber, o: x.orderNumber, c: x.customerName, p: x.productName, q: x.quantity, up: x.unitPrice, r: { formula: `F${6 + i}*G${6 + i}`, result: x.revenue.toNumber() }, cg: x.cogs, m: { formula: `IF(H${6 + i}=0,"",(H${6 + i}-I${6 + i})/H${6 + i})`, result: x.revenue.isZero() ? "" : x.revenue.minus(x.cogs).div(x.revenue).toNumber() } })), ["Product margin here is before freight. Freight is allocated in the customer sheet."]);
    await sheet(wb, "Customers", "Customer Profitability", `${p.label} · ${stamp}`, [{ header: "Customer", key: "c", width: 28 }, { header: "Quantity", key: "q", width: 13, fmt: QTY, total: "sum" }, { header: "Revenue", key: "r", width: 15, fmt: MONEY, total: "sum" }, { header: "COGS", key: "cg", width: 15, fmt: MONEY, total: "sum" }, { header: "Freight (allocated)", key: "f", width: 15, fmt: MONEY, total: "sum" }, { header: "Gross profit", key: "g", width: 15, fmt: MONEY, total: "sum" }, { header: "Margin", key: "m", width: 10, fmt: PCT }],
      f.byCustomer.map((c, i) => ({ c: c.label, q: c.quantity, r: c.revenue, cg: c.cogs, f: c.freight, g: { formula: `C${6 + i}-D${6 + i}-E${6 + i}`, result: gp(c).toNumber() }, m: { formula: `IF(C${6 + i}=0,"",F${6 + i}/C${6 + i})`, result: margin(c)?.toNumber() ?? "" } })), ["Freight is allocated to customers by shipped quantity within each shipment."]);
    const ws = wb.getWorksheet("Customers");
    if (ws && f.byCustomer.length) ws.addConditionalFormatting({ ref: `G6:G${5 + f.byCustomer.length}`, rules: [{ type: "cellIs", operator: "lessThan", formulae: ["0"], priority: 1, style: { font: { color: { argb: "FFC64D4D" }, bold: true } } }] });
  } else if (report === "purchasing") {
    const pos = await db.purchaseOrder.findMany({ include: { supplier: true, lines: { include: { product: true } } }, orderBy: { orderDate: "desc" } });
    await sheet(wb, "PO lines", "Purchase Orders", stamp, [
      { header: "PO", key: "po", width: 16 }, { header: "Supplier", key: "s", width: 24 }, { header: "Status", key: "st", width: 18 }, { header: "Ordered", key: "d", width: 12, fmt: "yyyy-mm-dd" }, { header: "Expected", key: "e", width: 12, fmt: "yyyy-mm-dd" },
      { header: "Product", key: "p", width: 24 }, { header: "Qty ordered", key: "q", width: 13, fmt: QTY, total: "sum" }, { header: "Qty received", key: "rq", width: 13, fmt: QTY, total: "sum" }, { header: "Unit cost", key: "c", width: 12, fmt: MONEY4 }, { header: "PO value", key: "v", width: 15, fmt: MONEY, total: "sum" }, { header: "Open value", key: "ov", width: 15, fmt: MONEY, total: "sum" },
    ], pos.flatMap((po) => po.lines.map((l) => ({ po: po.number, s: po.supplier.name, st: po.status.replace(/_/g, " "), d: po.orderDate, e: po.expectedAt, p: l.product.name, q: l.quantity, rq: l.receivedQty, c: l.unitCost, v: dec(l.quantity).times(dec(l.unitCost)), ov: dec(l.quantity).minus(dec(l.receivedQty)).times(dec(l.unitCost)) }))));
  } else if (report === "shipments") {
    const ships = await db.shipment.findMany({ include: { order: { include: { customer: true } }, lines: true, freightCosts: true, truck: true }, orderBy: { createdAt: "desc" } });
    await sheet(wb, "Shipments", "Shipment History", stamp, [
      { header: "Shipment", key: "n", width: 16 }, { header: "Mode", key: "m", width: 11 }, { header: "Order", key: "o", width: 16 }, { header: "Customer", key: "c", width: 24 }, { header: "Carrier", key: "car", width: 20 }, { header: "Truck", key: "t", width: 10 },
      { header: "Shipped", key: "sh", width: 12, fmt: "yyyy-mm-dd" }, { header: "Delivered", key: "dl", width: 12, fmt: "yyyy-mm-dd" }, { header: "Quantity", key: "q", width: 13, fmt: QTY, total: "sum" }, { header: "Freight", key: "f", width: 13, fmt: MONEY, total: "sum" }, { header: "Freight / unit", key: "fu", width: 13, fmt: MONEY4 }, { header: "Status", key: "s", width: 12 },
    ], ships.map((s, i) => { const q = s.lines.reduce((t, l) => t.plus(dec(l.quantity)), dec(0)); const fr = s.freightCosts.reduce((t, x) => t.plus(dec(x.amount)), dec(0)); return { n: s.number, m: s.mode, o: s.order?.number, c: s.order?.customer.name, car: s.carrier, t: s.truck?.code, sh: s.shippedAt, dl: s.deliveredAt, q, f: fr, fu: { formula: `IF(I${6 + i}=0,"",J${6 + i}/I${6 + i})`, result: q.isZero() ? "" : fr.div(q).toNumber() }, s: s.status.replace("_", " ") }; }));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
