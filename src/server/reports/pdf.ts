import PDFDocument from "pdfkit";
import { D, dec, fmtMoney, fmtQty } from "@/lib/decimal";
import { db } from "../db";
import { getSettingTyped } from "../services/settings";

const NAVY = "#101D2E", GOLD = "#C49A52", INK = "#172436", MUTED = "#64748B", LINE = "#E3E9F0";

/** Branded, printable customer quote. Only customer-facing fields are printed (never cost or margin). */
export async function quotePdf(quoteId: string): Promise<Buffer> {
  const q = await db.quote.findUniqueOrThrow({ where: { id: quoteId }, include: { customer: { include: { contacts: { where: { primary: true } } } }, lines: { include: { product: true } } } });
  const co = await getSettingTyped("company.profile");
  const doc = new PDFDocument({ size: "LETTER", margin: 54, info: { Title: `Quote ${q.number}`, Author: co.name || "California Sulphur Company" } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((r) => doc.on("end", () => r(Buffer.concat(chunks))));
  const W = doc.page.width, L = 54, R = W - 54;

  doc.rect(0, 0, W, 96).fill(NAVY);
  doc.rect(0, 96, W, 3).fill(GOLD);
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(18).text(co.name || "California Sulphur Company", L, 30, { width: 330 });
  doc.font("Helvetica").fontSize(9).fillColor("#C7D2DF").text([co.address, [co.phone, co.email].filter(Boolean).join(" · ")].filter(Boolean).join("\n") || " ", L, 54, { width: 330 });
  doc.font("Helvetica-Bold").fontSize(22).fillColor(GOLD).text("QUOTATION", 330, 28, { width: R - 330, align: "right" });
  doc.font("Helvetica").fontSize(10).fillColor("#FFFFFF").text(q.number, 330, 58, { width: R - 330, align: "right" });

  let y = 124;
  const label = (t: string, x: number, yy: number) => doc.font("Helvetica-Bold").fontSize(8).fillColor(MUTED).text(t.toUpperCase(), x, yy, { characterSpacing: 0.8 });
  label("Prepared for", L, y);
  doc.font("Helvetica-Bold").fontSize(12).fillColor(INK).text(q.customer.name, L, y + 13, { width: 260 });
  const contact = q.customer.contacts[0];
  doc.font("Helvetica").fontSize(9.5).fillColor(INK).text([contact?.name, q.customer.billingAddress].filter(Boolean).join("\n") || " ", L, y + 30, { width: 260 });
  const meta: [string, string][] = [["Quote date", q.createdAt.toLocaleDateString("en-US", { dateStyle: "medium" })], ["Valid until", q.validUntil.toLocaleDateString("en-US", { dateStyle: "medium" })], ["Currency", q.currency], ["Delivery terms", q.deliveryTerms || "To be confirmed"], ["Payment terms", q.paymentTerms || "To be confirmed"]];
  meta.forEach(([k, v], i) => {
    label(k, 340, y + i * 26);
    doc.font("Helvetica").fontSize(10).fillColor(INK).text(v, 340, y + i * 26 + 11, { width: R - 340 });
  });

  y = Math.max(y + 140, doc.y + 20);
  const cols = [{ t: "Product", x: L, w: 220, a: "left" }, { t: "Quantity", x: L + 220, w: 90, a: "right" }, { t: "Unit price", x: L + 310, w: 90, a: "right" }, { t: "Amount", x: L + 400, w: R - L - 400, a: "right" }] as const;
  doc.rect(L, y, R - L, 22).fill("#E8EEF5");
  cols.forEach((c) => doc.font("Helvetica-Bold").fontSize(9).fillColor(INK).text(c.t, c.x + 6, y + 7, { width: c.w - 12, align: c.a }));
  y += 22;
  let total = new D(0);
  for (const l of q.lines) {
    const amt = dec(l.quantity).times(dec(l.unitPrice));
    total = total.plus(amt);
    const desc = [l.product.name, l.description].filter(Boolean).join("\n");
    const h = Math.max(24, doc.heightOfString(desc, { width: cols[0].w - 12 }) + 12);
    if (y + h > doc.page.height - 140) { doc.addPage(); y = 54; }
    doc.font("Helvetica").fontSize(9.5).fillColor(INK).text(desc, cols[0].x + 6, y + 6, { width: cols[0].w - 12 });
    doc.text(`${fmtQty(l.quantity, 3)} ${l.product.unitCode}`, cols[1].x + 6, y + 6, { width: cols[1].w - 12, align: "right" });
    doc.text(`${fmtMoney(l.unitPrice, q.currency)} / ${l.product.unitCode}`, cols[2].x + 6, y + 6, { width: cols[2].w - 12, align: "right" });
    doc.text(fmtMoney(amt, q.currency), cols[3].x + 6, y + 6, { width: cols[3].w - 12, align: "right" });
    y += h;
    doc.moveTo(L, y).lineTo(R, y).lineWidth(0.5).strokeColor(LINE).stroke();
  }
  y += 10;
  doc.rect(L + 310, y, R - L - 310, 30).fill(NAVY);
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#FFFFFF").text("TOTAL", L + 316, y + 10, { width: 80 });
  doc.fillColor(GOLD).fontSize(12).text(fmtMoney(total, q.currency), L + 400, y + 9, { width: R - L - 406, align: "right" });
  y += 50;
  if (q.notes) {
    label("Notes", L, y);
    doc.font("Helvetica").fontSize(9.5).fillColor(INK).text(q.notes, L, y + 13, { width: R - L });
    y = doc.y + 14;
  }
  doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text(`Prices are valid until ${q.validUntil.toLocaleDateString("en-US", { dateStyle: "long" })} and are subject to product availability. Quantities are in ${[...new Set(q.lines.map((l) => l.product.unitCode))].join(", ")}.`, L, Math.max(y, doc.page.height - 110), { width: R - L });
  doc.moveTo(L, doc.page.height - 66).lineTo(R, doc.page.height - 66).lineWidth(0.5).strokeColor(LINE).stroke();
  doc.fontSize(8).fillColor(MUTED).text(`${co.name || "California Sulphur Company"} · ${q.number}`, L, doc.page.height - 58, { width: R - L, align: "center" });
  doc.end();
  return done;
}
