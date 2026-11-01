import PptxGenJS from "pptxgenjs";
import { dec, fmtMoney, fmtPct, fmtQty } from "@/lib/decimal";
import { db } from "../db";
import type { CurrentUser } from "../auth";
import { financials, insights, inventorySnapshot, inventoryIntelligence, inventoryAging, pipeline, previousPeriod, gp, margin, type Period } from "../services/metrics";
import { getSettingTyped } from "../services/settings";

export const PPTX_TEMPLATES = {
  executive: { label: "Executive Business Review", sections: ["summary", "financial", "products", "customers", "inventory", "operations", "insights", "definitions"] },
  financial: { label: "Monthly Financial Performance", sections: ["summary", "financial", "products", "customers", "definitions"] },
  inventory: { label: "Inventory Performance", sections: ["inventory", "aging", "insights", "definitions"] },
  sales: { label: "Sales and Profitability", sections: ["summary", "products", "customers", "pipeline", "definitions"] },
  operations: { label: "Quarterly Operations Review", sections: ["summary", "operations", "inventory", "production", "insights", "definitions"] },
} as const;
export type PptxTemplate = keyof typeof PPTX_TEMPLATES | "custom";
export const ALL_SECTIONS = ["summary", "financial", "products", "customers", "pipeline", "inventory", "aging", "operations", "production", "insights", "definitions"] as const;
export type Section = (typeof ALL_SECTIONS)[number];

// Palette (hex without #)
const NAVY = "101D2E", NAVY2 = "1A2B41", INK = "172436", MUTED = "64748B", LINE = "E3E9F0", BG = "F7F9FC", ACCENT = "365D83", GOLD = "C49A52", POS = "16856A", CRIT = "C64D4D";
const FONT = "Calibri";
const W = 13.333, H = 7.5, M = 0.6;

export async function buildDeck(template: PptxTemplate, user: CurrentUser, p: Period & { label: string }, custom?: Section[]): Promise<Buffer> {
  const sections: readonly Section[] = template === "custom" ? (custom?.length ? custom : ["summary"]) : PPTX_TEMPLATES[template].sections;
  const title = template === "custom" ? "Custom Report" : PPTX_TEMPLATES[template].label;
  const fin = user.permissions.has("finance.view");
  const val = user.permissions.has("inventory.value");
  const co = await getSettingTyped("company.profile");
  const company = co.name || "California Sulphur Company";

  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = user.name;
  pptx.company = company;
  pptx.title = `${title} — ${p.label}`;
  pptx.theme = { headFontFace: FONT, bodyFontFace: FONT };

  pptx.defineSlideMaster({
    title: "CONTENT",
    background: { color: BG },
    objects: [
      { rect: { x: 0, y: H - 0.42, w: W, h: 0.42, fill: { color: "FFFFFF" }, line: { color: LINE, width: 0.5 } } },
      { rect: { x: 0, y: 0, w: 0.12, h: H - 0.42, fill: { color: GOLD } } },
      { text: { text: `${company} · ${title} · ${p.label}`, options: { x: M, y: H - 0.38, w: 9, h: 0.34, fontFace: FONT, fontSize: 9, color: MUTED } } },
    ],
    slideNumber: { x: W - 1.1, y: H - 0.38, w: 0.6, h: 0.34, fontFace: FONT, fontSize: 9, color: MUTED, align: "right" },
  });

  const header = (s: PptxGenJS.Slide, eyebrow: string, heading: string) => {
    s.addText(eyebrow.toUpperCase(), { x: M, y: 0.35, w: W - 2 * M, h: 0.3, fontFace: FONT, fontSize: 11, bold: true, color: GOLD, charSpacing: 2 });
    s.addText(heading, { x: M, y: 0.62, w: W - 2 * M, h: 0.6, fontFace: FONT, fontSize: 26, bold: true, color: INK });
  };
  const kpi = (s: PptxGenJS.Slide, x: number, y: number, w: number, label: string, value: string, sub?: string, color = INK) => {
    s.addShape(pptx.ShapeType.roundRect, { x, y, w, h: 1.35, fill: { color: "FFFFFF" }, line: { color: LINE, width: 0.75 }, rectRadius: 0.08 });
    s.addText(label, { x: x + 0.2, y: y + 0.12, w: w - 0.4, h: 0.3, fontFace: FONT, fontSize: 11, color: MUTED });
    s.addText(value, { x: x + 0.2, y: y + 0.42, w: w - 0.4, h: 0.5, fontFace: FONT, fontSize: 24, bold: true, color, fit: "shrink" });
    if (sub) s.addText(sub, { x: x + 0.2, y: y + 0.92, w: w - 0.4, h: 0.3, fontFace: FONT, fontSize: 10, color: MUTED, fit: "shrink" });
  };
  const table = (s: PptxGenJS.Slide, head: string[], rows: string[][], y: number, colW: number[], alignRight: number[] = []) => {
    const hdr = head.map((t, i) => ({ text: t, options: { bold: true, color: INK, fill: { color: "E8EEF5" }, align: (alignRight.includes(i) ? "right" : "left") as "right" | "left" } }));
    const body = rows.map((r, ri) => r.map((t, i) => ({ text: t, options: { color: INK, fill: { color: ri % 2 ? "F7F9FC" : "FFFFFF" }, align: (alignRight.includes(i) ? "right" : "left") as "right" | "left" } })));
    s.addTable([hdr, ...body], { x: M, y, w: colW.reduce((a, b) => a + b, 0), colW, fontFace: FONT, fontSize: 11, border: { type: "solid", color: LINE, pt: 0.5 }, rowH: 0.34, autoPage: true, autoPageRepeatHeader: true, autoPageSlideStartY: 1.4 });
  };
  const empty = (s: PptxGenJS.Slide, msg: string) => s.addText(msg, { x: M, y: 3, w: W - 2 * M, h: 0.6, fontFace: FONT, fontSize: 16, color: MUTED, align: "center" });

  // ── Cover ──
  const cover = pptx.addSlide();
  cover.background = { color: NAVY };
  cover.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.25, h: H, fill: { color: GOLD } });
  cover.addText(company.toUpperCase(), { x: 1, y: 1.2, w: 11, h: 0.4, fontFace: FONT, fontSize: 14, bold: true, color: GOLD, charSpacing: 4 });
  cover.addText(title, { x: 1, y: 2.2, w: 11, h: 1.4, fontFace: FONT, fontSize: 44, bold: true, color: "FFFFFF" });
  cover.addText(p.label, { x: 1, y: 3.6, w: 11, h: 0.5, fontFace: FONT, fontSize: 20, color: "C7D2DF" });
  cover.addText(`${p.from.toLocaleDateString("en-US", { dateStyle: "medium" })} – ${p.to.toLocaleDateString("en-US", { dateStyle: "medium" })}`, { x: 1, y: 4.1, w: 11, h: 0.4, fontFace: FONT, fontSize: 14, color: "8EA0B6" });
  cover.addText(`Prepared ${new Date().toLocaleDateString("en-US", { dateStyle: "long" })} by ${user.name} · Generated by CSC Command from company records`, { x: 1, y: H - 1.1, w: 11, h: 0.4, fontFace: FONT, fontSize: 11, color: "8EA0B6" });

  const f = fin ? await financials(p) : null;
  const prev = fin ? await financials(previousPeriod(p)) : null;
  const snap = await inventorySnapshot();
  const unit = snap.unit;

  for (const sec of sections) {
    if (sec === "summary") {
      const s = pptx.addSlide({ masterName: "CONTENT" });
      header(s, "Executive summary", "Where the business stands");
      const cw = (W - 2 * M - 0.6) / 4;
      if (f && prev) {
        const ch = (a: ReturnType<typeof dec>, b: ReturnType<typeof dec>) => (b.isZero() ? "no prior-period sales" : `${a.minus(b).div(b).times(100).toFixed(1)}% vs prior period`);
        kpi(s, M, 1.5, cw, "Revenue", fmtMoney(f.totals.revenue, "USD", 0), ch(f.totals.revenue, prev.totals.revenue));
        kpi(s, M + (cw + 0.2), 1.5, cw, "Gross profit", fmtMoney(gp(f.totals), "USD", 0), `${fmtPct(margin(f.totals))} margin after freight`, gp(f.totals).lt(0) ? CRIT : POS);
        kpi(s, M + 2 * (cw + 0.2), 1.5, cw, "Quantity shipped", `${fmtQty(f.totals.quantity, 0)} ${unit}`, `${f.facts.length} shipment lines`);
      }
      kpi(s, M + 3 * (cw + 0.2), 1.5, cw, val ? "Inventory value" : "Inventory on hand", val ? fmtMoney(snap.totals.value, "USD", 0) : `${fmtQty(snap.totals.onHand, 0)} ${unit}`, `${fmtQty(snap.totals.available, 0)} ${unit} available`);
      const pipe = await pipeline();
      const bullets = [
        f ? `Revenue of ${fmtMoney(f.totals.revenue, "USD", 0)} from ${fmtQty(f.totals.quantity, 0)} ${unit} dispatched; gross profit ${fmtMoney(gp(f.totals), "USD", 0)} (${fmtPct(margin(f.totals))}).` : null,
        `${fmtQty(snap.totals.onHand, 0)} ${unit} on hand across ${snap.locations.length} location(s); ${fmtQty(snap.totals.reserved, 0)} ${unit} committed to orders.`,
        `${pipe.quotes.length} open quote(s), ${pipe.orders.length} open sales order(s), ${pipe.shipments.length} shipment(s) planned or in transit, ${pipe.pos.length} purchase order(s) awaiting receipt.`,
        snap.reorder.length ? `${snap.reorder.length} product(s) below reorder point: ${snap.reorder.map((r) => r.name).join(", ")}.` : "No products below their reorder point.",
      ].filter(Boolean) as string[];
      s.addText(bullets.map((t) => ({ text: t, options: { bullet: { code: "25A0" }, paraSpaceAfter: 8 } })), { x: M, y: 3.15, w: W - 2 * M, h: 3.4, fontFace: FONT, fontSize: 15, color: INK, valign: "top" });
    }
    if (sec === "financial" && f) {
      const s = pptx.addSlide({ masterName: "CONTENT" });
      header(s, "Financial performance", "Revenue and gross profit by month");
      const labels = f.months.map((m) => new Date(`${m.key}-01T00:00:00`).toLocaleDateString("en-US", { month: "short", year: "2-digit" }));
      if (f.facts.length) {
        s.addChart(pptx.ChartType.bar, [{ name: "Revenue", labels, values: f.months.map((m) => m.revenue.toDecimalPlaces(0).toNumber()) }, { name: "Gross profit", labels, values: f.months.map((m) => gp(m).toDecimalPlaces(0).toNumber()) }], {
          x: M, y: 1.45, w: 8.2, h: 5.2, barGrouping: "clustered", chartColors: [ACCENT, GOLD], showLegend: true, legendPos: "b", legendFontFace: FONT, legendFontSize: 11,
          catAxisLabelFontFace: FONT, catAxisLabelFontSize: 10, catAxisLabelColor: MUTED, valAxisLabelFontFace: FONT, valAxisLabelFontSize: 10, valAxisLabelColor: MUTED, valAxisLabelFormatCode: "$#,##0", valGridLine: { color: LINE, size: 0.5 }, catGridLine: { style: "none" },
        });
        const rows: string[][] = [["Revenue", fmtMoney(f.totals.revenue, "USD", 0)], ["Cost of goods shipped", fmtMoney(f.totals.cogs, "USD", 0)], ["Direct freight", fmtMoney(f.totals.freight, "USD", 0)], ["Gross profit", fmtMoney(gp(f.totals), "USD", 0)], ["Gross margin", fmtPct(margin(f.totals))]];
        s.addTable(rows.map((r, i) => r.map((t, j) => ({ text: t, options: { bold: i === 3, align: (j ? "right" : "left") as "right" | "left", color: INK, fill: { color: i % 2 ? "F7F9FC" : "FFFFFF" } } }))), { x: 9.1, y: 1.6, w: 3.6, colW: [2.1, 1.5], fontFace: FONT, fontSize: 12, border: { type: "solid", color: LINE, pt: 0.5 }, rowH: 0.42 });
        s.addText("Actuals. Revenue is recognized on dispatch. Gross profit is operational (before operating expenses) and is not net income.", { x: 9.1, y: 4.0, w: 3.6, h: 1.2, fontFace: FONT, fontSize: 10, color: MUTED, valign: "top" });
      } else empty(s, "No dispatched sales in this period.");
    }
    if (sec === "products" && f) {
      const s = pptx.addSlide({ masterName: "CONTENT" });
      header(s, "Product performance", "Revenue and profit by product");
      if (f.byProduct.length) table(s, ["Product", `Quantity (${unit})`, "Revenue", "Gross profit", "Margin"], f.byProduct.slice(0, 12).map((x) => [x.label, fmtQty(x.quantity, 0), fmtMoney(x.revenue, "USD", 0), fmtMoney(gp(x), "USD", 0), fmtPct(margin(x))]), 1.45, [4.8, 1.9, 2.0, 2.0, 1.4], [1, 2, 3, 4]);
      else empty(s, "No product sales in this period.");
    }
    if (sec === "customers" && f) {
      const s = pptx.addSlide({ masterName: "CONTENT" });
      header(s, "Customer performance", "Profitability by customer");
      if (f.byCustomer.length) table(s, ["Customer", `Quantity (${unit})`, "Revenue", "Freight", "Gross profit", "Margin"], f.byCustomer.slice(0, 12).map((x) => [x.label, fmtQty(x.quantity, 0), fmtMoney(x.revenue, "USD", 0), fmtMoney(x.freight, "USD", 0), fmtMoney(gp(x), "USD", 0), fmtPct(margin(x))]), 1.45, [4.0, 1.7, 1.8, 1.5, 1.8, 1.3], [1, 2, 3, 4, 5]);
      else empty(s, "No customer sales in this period.");
    }
    if (sec === "pipeline") {
      const s = pptx.addSlide({ masterName: "CONTENT" });
      header(s, "Pipeline", "Open quotes and orders");
      const pipe = await pipeline();
      const rows = [...pipe.quotes.map((q) => ["Quote", q.number, q.customer.name, q.status.replace(/_/g, " ").toLowerCase(), fin ? fmtMoney(q.lines.reduce((t, l) => t.plus(dec(l.quantity).times(dec(l.unitPrice))), dec(0)), "USD", 0) : "—"]), ...pipe.orders.map((o) => ["Order", o.number, o.customer.name, o.status.replace(/_/g, " ").toLowerCase(), fin ? fmtMoney(o.lines.reduce((t, l) => t.plus(dec(l.quantity).minus(dec(l.shippedQty)).times(dec(l.unitPrice))), dec(0)), "USD", 0) : "—"])];
      if (rows.length) table(s, ["Type", "Number", "Customer", "Status", "Open value"], rows.slice(0, 14), 1.45, [1.3, 2.2, 4.4, 2.4, 1.8], [4]);
      else empty(s, "No open quotes or orders.");
    }
    if (sec === "inventory") {
      const s = pptx.addSlide({ masterName: "CONTENT" });
      header(s, "Inventory", "Stock position by product");
      if (snap.products.length) {
        s.addChart(pptx.ChartType.bar, [{ name: "Available", labels: snap.products.map((x) => x.name), values: snap.products.map((x) => x.available.toDecimalPlaces(0).toNumber()) }, { name: "Reserved", labels: snap.products.map((x) => x.name), values: snap.products.map((x) => x.reserved.toDecimalPlaces(0).toNumber()) }], {
          x: M, y: 1.45, w: 6.4, h: 5.1, barDir: "bar", barGrouping: "stacked", chartColors: [ACCENT, GOLD], showLegend: true, legendPos: "b", legendFontFace: FONT, catAxisLabelFontFace: FONT, catAxisLabelFontSize: 10, valAxisLabelFontFace: FONT, valAxisLabelFontSize: 10, valAxisLabelFormatCode: "#,##0", valGridLine: { color: LINE, size: 0.5 },
        });
        const rows = snap.products.map((x) => [x.name, fmtQty(x.onHand, 0), fmtQty(x.available, 0), ...(val ? [fmtMoney(x.value, "USD", 0)] : [])]);
        s.addTable([["Product", "On hand", "Available", ...(val ? ["Value"] : [])].map((t) => ({ text: t, options: { bold: true, fill: { color: "E8EEF5" }, color: INK } })), ...rows.map((r) => r.map((t, i) => ({ text: t, options: { color: INK, align: (i ? "right" : "left") as "right" | "left" } })))], { x: 7.3, y: 1.55, w: 5.4, colW: val ? [2.4, 1.0, 1.0, 1.0] : [2.8, 1.3, 1.3], fontFace: FONT, fontSize: 10.5, border: { type: "solid", color: LINE, pt: 0.5 }, rowH: 0.32 });
      } else empty(s, "No inventory on hand.");
    }
    if (sec === "aging") {
      const s = pptx.addSlide({ masterName: "CONTENT" });
      header(s, "Inventory aging & movement", "How long stock has been held, and how fast it moves");
      const aging = await inventoryAging();
      table(s, ["Age (since receipt)", `Quantity (${unit})`, ...(val ? ["Value"] : [])], aging.map((a) => [a.label, fmtQty(a.qty, 0), ...(val ? [fmtMoney(a.value, "USD", 0)] : [])]), 1.45, val ? [3, 2, 2] : [3, 2], [1, 2]);
      const intel = await inventoryIntelligence(90);
      table(s, ["Product", "Shipped (90 days)", "Days of stock", "Status"], intel.rows.map((r) => [r.name, fmtQty(r.shippedQty, 0), r.daysOfInventory ? r.daysOfInventory.toFixed(0) : "—", r.reorderPoint && r.available.lt(r.reorderPoint) ? "Below reorder point" : r.slowMoving ? "No shipments in 90 days" : "OK"]), 3.75, [4, 2.2, 1.8, 3], [1, 2]);
    }
    if (sec === "operations") {
      const s = pptx.addSlide({ masterName: "CONTENT" });
      header(s, "Logistics", "Shipments and freight by mode");
      const ships = await db.shipment.findMany({ where: { shippedAt: { gte: p.from, lte: p.to }, status: { not: "CANCELLED" } }, include: { lines: true, freightCosts: true } });
      const byMode = new Map<string, { n: number; q: ReturnType<typeof dec>; f: ReturnType<typeof dec>; late: number }>();
      for (const sh of ships) {
        const m = byMode.get(sh.mode) ?? { n: 0, q: dec(0), f: dec(0), late: 0 };
        m.n++;
        m.q = m.q.plus(sh.lines.reduce((t, l) => t.plus(dec(l.quantity)), dec(0)));
        m.f = m.f.plus(sh.freightCosts.reduce((t, x) => t.plus(dec(x.amount)), dec(0)));
        if (sh.scheduledAt && sh.shippedAt && sh.shippedAt.getTime() - sh.scheduledAt.getTime() > 864e5) m.late++;
        byMode.set(sh.mode, m);
      }
      if (byMode.size) table(s, ["Mode", "Shipments", `Quantity (${unit})`, ...(fin ? ["Freight", "Freight per unit"] : []), "Dispatched > 1 day late"], [...byMode.entries()].map(([k, v]) => [k.charAt(0) + k.slice(1).toLowerCase(), String(v.n), fmtQty(v.q, 0), ...(fin ? [fmtMoney(v.f, "USD", 0), v.q.isZero() ? "—" : fmtMoney(v.f.div(v.q))] : []), String(v.late)]), 1.45, fin ? [2.2, 1.6, 2, 2, 2, 2.3] : [3, 2, 2.5, 3], [1, 2, 3, 4, 5]);
      else empty(s, "No shipments dispatched in this period.");
    }
    if (sec === "production") {
      const s = pptx.addSlide({ masterName: "CONTENT" });
      header(s, "Production", "Pelletizer runs and yield");
      const runs = await db.productionRun.findMany({ where: { runDate: { gte: p.from, lte: p.to } }, orderBy: { runDate: "asc" } });
      if (runs.length) {
        const tin = runs.reduce((t, r) => t.plus(dec(r.inputQty)), dec(0)), tout = runs.reduce((t, r) => t.plus(dec(r.outputQty)), dec(0));
        const cw = (W - 2 * M - 0.4) / 3;
        kpi(s, M, 1.5, cw, "Input consumed", `${fmtQty(tin, 0)} ${unit}`, `${runs.length} run(s)`);
        kpi(s, M + cw + 0.2, 1.5, cw, "Output produced", `${fmtQty(tout, 0)} ${unit}`);
        kpi(s, M + 2 * (cw + 0.2), 1.5, cw, "Overall yield", fmtPct(tin.isZero() ? null : tout.div(tin), 2), `${fmtQty(tin.minus(tout), 1)} ${unit} difference`);
        table(s, ["Run", "Date", "Input", "Output", "Yield", ...(val ? ["Output cost / unit"] : [])], runs.slice(-10).map((r) => [r.number, r.runDate.toLocaleDateString("en-US"), fmtQty(r.inputQty, 1), fmtQty(r.outputQty, 1), fmtPct(r.yieldPct, 2), ...(val ? [fmtMoney(r.outputUnitCost)] : [])]), 3.1, val ? [2.4, 1.8, 1.8, 1.8, 1.5, 2.4] : [2.6, 2.2, 2.2, 2.2, 2], [2, 3, 4, 5]);
      } else empty(s, "No production runs recorded in this period.");
    }
    if (sec === "insights" && fin) {
      const s = pptx.addSlide({ masterName: "CONTENT" });
      header(s, "Findings & actions", "What the records show");
      const ins = await insights(p);
      if (ins.length) {
        s.addText(ins.slice(0, 7).flatMap((i) => [{ text: i.title, options: { bold: true, color: i.tone === "crit" ? CRIT : i.tone === "warn" ? "B07A22" : i.tone === "pos" ? POS : ACCENT, breakLine: true } }, { text: `${i.detail}  (Source: ${i.source})`, options: { color: INK, fontSize: 12, breakLine: true, paraSpaceAfter: 10 } }]), { x: M, y: 1.45, w: W - 2 * M, h: 5.2, fontFace: FONT, fontSize: 15, valign: "top" });
      } else empty(s, "No exceptions found: no significant changes, margin exceptions, reorder warnings or overdue items.");
      s.addText("Findings are rule-based checks on recorded data. They state what changed, not why.", { x: M, y: H - 0.85, w: W - 2 * M, h: 0.3, fontFace: FONT, fontSize: 10, color: MUTED, italic: true });
    }
    if (sec === "definitions") {
      const s = pptx.addSlide({ masterName: "CONTENT" });
      header(s, "Appendix", "Definitions and basis of preparation");
      const defs = [
        ["Revenue", "Order price × quantity on sales-order shipments dispatched in the period."],
        ["Cost of goods shipped", "Quantity dispatched × the lot's weighted-average unit cost at dispatch."],
        ["Direct freight", "Freight and handling charges recorded on shipments dispatched in the period."],
        ["Gross profit / margin", "Revenue − cost of goods − direct freight; margin = gross profit ÷ revenue. Not net income."],
        ["Inventory value", "Quantity on hand × lot unit cost. Costing method pending company confirmation."],
        ["Data", `Generated ${new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} from CSC Command records. All figures are actuals unless labeled otherwise.`],
      ];
      table(s, ["Term", "Definition"], defs, 1.45, [3, 9.1]);
    }
  }
  return (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
}
