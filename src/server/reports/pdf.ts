import PDFDocument from "pdfkit";
import { D, dec, fmtMoney, fmtQty } from "@/lib/decimal";
import { db } from "../db";
import { getSettingTyped, getSetting } from "../services/settings";
import { readStored } from "../storage";

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
  // Footer sits inside the bottom margin; drop the margin so pdfkit doesn't start a new page for it.
  doc.page.margins.bottom = 0;
  doc.moveTo(L, doc.page.height - 66).lineTo(R, doc.page.height - 66).lineWidth(0.5).strokeColor(LINE).stroke();
  doc.fontSize(8).fillColor(MUTED).text(`${co.name || "California Sulphur Company"} · ${q.number}`, L, doc.page.height - 58, { width: R - L, align: "center", lineBreak: false });
  doc.end();
  return done;
}


// California Sulphur Company brand colours (from calsulco.com): sulphur yellow, royal blue, dark slate.
const CSC_YELLOW = "#EBDB3B", CSC_BLUE = "#1E1C9E", CSC_SLATE = "#1E2A3A";

/** Company mark: the uploaded logo if there is one, otherwise the CSC element tile (yellow square, blue S, "CA" and 16 for sulphur) with the wordmark. */
async function drawBrand(doc: PDFKit.PDFDocument, x: number, y: number, name: string) {
  const logo = (await getSetting(db, "company.logo")) as { key: string; mime: string } | null;
  if (logo) {
    try { doc.image(await readStored(logo.key), x, y, { fit: [190, 56], valign: "center" }); return; } catch { /* fall back to the drawn mark */ }
  }
  const s = 52;
  doc.rect(x, y, s, s).fill(CSC_YELLOW);
  doc.font("Helvetica").fontSize(6.5).fillColor(CSC_BLUE).text("CA", x, y + 4, { width: s, align: "center", lineBreak: false });
  doc.font("Times-Bold").fontSize(32).fillColor(CSC_BLUE).text("S", x, y + 11, { width: s, align: "center", lineBreak: false });
  doc.font("Helvetica").fontSize(6.5).fillColor(CSC_BLUE).text("16", x, y + 42, { width: s, align: "center", lineBreak: false });
  const words = name.trim().split(/\s+/);
  const half = Math.ceil(words.length / 2);
  doc.font("Helvetica-Bold").fontSize(15).fillColor(CSC_BLUE).text(words.slice(0, half).join(" "), x + s + 12, y + 8, { lineBreak: false });
  doc.text(words.slice(half).join(" "), x + s + 12, y + 27, { lineBreak: false });
}

/** Customer invoice with CSC letterhead. Prints only customer-facing fields (never cost or margin). */
export async function invoicePdf(invoiceId: string): Promise<Buffer> {
  const i = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { customer: true, lines: { orderBy: { position: "asc" } }, payments: { orderBy: { receivedAt: "asc" } } } });
  const [co, defaults] = await Promise.all([getSettingTyped("company.profile"), getSettingTyped("invoices.defaults")]);
  const name = co.name || "California Sulphur Company";
  const doc = new PDFDocument({ size: "LETTER", margin: 48, bufferPages: true, info: { Title: `Invoice ${i.number ?? "draft"} — ${name}`, Author: name, Subject: `Invoice for ${i.customer.name}` } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((r) => doc.on("end", () => r(Buffer.concat(chunks))));
  const W = doc.page.width, H = doc.page.height, L = 48, R = W - 48, CW = R - L;
  const SOFT = "#F4F5F8", RULE = "#DDE1E8", GREEN = "#2F7D5B", RED = "#B4423F";
  const NAVY = CSC_SLATE, GOLD = CSC_YELLOW, BLUE = CSC_BLUE;
  const m = (v: unknown) => fmtMoney(dec(String(v)), i.currency);
  const fd = (d: Date) => d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  const balance = i.status === "VOID" ? dec(0) : dec(i.total).minus(dec(i.amountPaid));
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const overdue = balance.gt(0) && i.dueDate < today && i.status !== "DRAFT";
  const cap = (t: string, x: number, y: number, w?: number, color = MUTED) => doc.font("Helvetica-Bold").fontSize(7).fillColor(color).text(t.toUpperCase(), x, y, { characterSpacing: 1.1, width: w, lineBreak: false });

  // ── Letterhead
  doc.rect(0, 0, W, 6).fill(NAVY);
  doc.rect(0, 6, W, 2).fill(GOLD);
  await drawBrand(doc, L, 30, name);
  const contact = [co.address, co.phone, co.email, co.website].filter(Boolean).join("\n");
  doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text(contact || " ", R - 220, 34, { width: 220, align: "right", lineGap: 1.5 });
  let y = Math.max(96, doc.y + 14);
  doc.moveTo(L, y).lineTo(R, y).lineWidth(0.6).strokeColor(RULE).stroke();

  // ── Title + status
  y += 20;
  doc.font("Times-Roman").fontSize(34).fillColor(BLUE).text(i.status === "VOID" ? "Invoice (void)" : "Invoice", L, y, { lineBreak: false });
  doc.font("Helvetica").fontSize(10).fillColor(MUTED).text(i.number ?? "Draft — not yet issued", L, y + 40, { lineBreak: false });
  const [pill, pillColor] = i.status === "VOID" ? ["VOID", RED] : i.status === "DRAFT" ? ["DRAFT", MUTED] : balance.lte(0) ? ["PAID IN FULL", GREEN] : overdue ? ["PAST DUE", RED] : i.status === "PARTIALLY_PAID" ? ["PARTIALLY PAID", BLUE] : ["PAYMENT DUE", BLUE];
  doc.font("Helvetica-Bold").fontSize(8);
  const pw = doc.widthOfString(pill, { characterSpacing: 1.2 }) + 22;
  doc.roundedRect(R - pw, y + 10, pw, 20, 10).lineWidth(1).strokeColor(pillColor).stroke();
  doc.fillColor(pillColor).text(pill, R - pw, y + 16.5, { width: pw, align: "center", characterSpacing: 1.2, lineBreak: false });

  // ── Summary strip
  y += 70;
  const sd = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const cells: [string, string][] = [["Invoice number", i.number ?? "Draft"], ["Invoice date", sd(i.issueDate)], ["Due date", sd(i.dueDate)]];
  const cw = (CW - 170) / 3;
  cells.forEach(([k, v], n) => {
    const x = L + n * cw;
    doc.rect(x, y, cw - 6, 50).fill(SOFT);
    cap(k, x + 12, y + 11);
    doc.font("Helvetica-Bold").fontSize(11).fillColor(n === 2 && overdue ? RED : INK).text(v, x + 12, y + 25, { width: cw - 30, lineBreak: false });
  });
  doc.rect(R - 164, y, 164, 50).fill(NAVY);
  doc.rect(R - 164, y, 3, 50).fill(GOLD);
  cap(balance.lte(0) && i.status !== "DRAFT" ? "Balance" : "Amount due", R - 150, y + 11, 140, "#AFC0D3");
  doc.font("Helvetica-Bold").fontSize(17).fillColor(GOLD).text(m(i.status === "DRAFT" ? i.total : balance), R - 150, y + 23, { width: 140, lineBreak: false });

  // ── Parties
  y += 74;
  const colW = (CW - 40) / 3;
  const block = (title: string, x: number, lines: { t: string; bold?: boolean }[]) => {
    cap(title, x, y); doc.moveTo(x, y + 12).lineTo(x + 24, y + 12).lineWidth(2.2).strokeColor(GOLD).stroke();
    let yy = y + 20;
    for (const l of lines) { doc.font(l.bold ? "Helvetica-Bold" : "Helvetica").fontSize(l.bold ? 10.5 : 9.5).fillColor(INK).text(l.t, x, yy, { width: colW, lineGap: 1.5 }); yy = doc.y + 2; }
    return yy;
  };
  const b1 = block("Billed to", L, [{ t: i.customer.name, bold: true }, ...(i.billTo ? [{ t: i.billTo }] : [])]);
  const b2 = block("Ship to", L + colW + 20, i.shipTo ? [{ t: i.shipTo }] : [{ t: "Same as billing" }]);
  const terms: { t: string; bold?: boolean }[] = [{ t: `Terms: ${i.paymentTerms || "Due on receipt"}` }, ...(i.customerPo ? [{ t: `Your PO: ${i.customerPo}` }] : []), { t: `Currency: ${i.currency}` }];
  const b3 = block("Details", L + 2 * (colW + 20), terms);
  y = Math.max(b1, b2, b3) + 22;

  // ── Line items
  const cols = [{ t: "#", x: L, w: 22, a: "left" }, { t: "Description", x: L + 22, w: 250, a: "left" }, { t: "Quantity", x: L + 272, w: 80, a: "right" }, { t: "Unit price", x: L + 352, w: 85, a: "right" }, { t: "Amount", x: L + 437, w: CW - 437, a: "right" }] as const;
  const drawHead = () => { cols.forEach((c) => { doc.font("Helvetica-Bold").fontSize(7).fillColor(BLUE).text(c.t.toUpperCase(), c.x + (c.a === "left" ? 4 : 0), y + 4, { width: c.w - 4, align: c.a, characterSpacing: 1.1, lineBreak: false }); }); y += 18; doc.moveTo(L, y).lineTo(R, y).lineWidth(1.2).strokeColor(BLUE).stroke(); };
  drawHead();
  i.lines.forEach((l, n) => {
    const h = Math.max(28, doc.font("Helvetica").fontSize(9.5).heightOfString(l.description, { width: cols[1].w - 8 }) + 16);
    if (y + h > H - 210) { doc.addPage(); y = 56; drawHead(); }
    if (n % 2 === 1) doc.rect(L, y, CW, h).fill("#FAFBFC");
    const ty = y + 9;
    doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text(String(n + 1).padStart(2, "0"), cols[0].x + 4, ty + 1, { lineBreak: false });
    doc.font("Helvetica").fontSize(9.5).fillColor(INK).text(l.description, cols[1].x + 4, ty, { width: cols[1].w - 8 });
    doc.text(`${fmtQty(l.quantity, 3)}${l.unitLabel ? ` ${l.unitLabel}` : ""}`, cols[2].x, ty, { width: cols[2].w - 4, align: "right", lineBreak: false });
    doc.text(`${fmtMoney(l.unitPrice, i.currency, 2)}`, cols[3].x, ty, { width: cols[3].w - 4, align: "right", lineBreak: false });
    doc.font("Helvetica-Bold").text(m(l.amount), cols[4].x, ty, { width: cols[4].w - 4, align: "right", lineBreak: false });
    y += h;
    doc.moveTo(L, y).lineTo(R, y).lineWidth(0.5).strokeColor(RULE).stroke();
  });

  // ── Totals (right) and how to pay (left)
  if (y + 190 > H - 70) { doc.addPage(); y = 56; }
  y += 16;
  const tx = R - 210, startY = y;
  const trow = (k: string, v: string, o: { bold?: boolean; color?: string } = {}) => { doc.font(o.bold ? "Helvetica-Bold" : "Helvetica").fontSize(9.5).fillColor(o.color ?? INK).text(k, tx, y, { width: 110, lineBreak: false }); doc.text(v, tx + 110, y, { width: 100, align: "right", lineBreak: false }); y += 17; };
  trow("Subtotal", m(i.subtotal));
  trow(dec(i.taxPct).gt(0) ? `Sales tax (${dec(i.taxPct).times(100).toDecimalPlaces(3).toString()}%)` : "Sales tax", m(i.taxAmount));
  doc.moveTo(tx, y - 2).lineTo(R, y - 2).lineWidth(0.6).strokeColor(RULE).stroke(); y += 4;
  trow("Total", m(i.total), { bold: true });
  if (dec(i.amountPaid).gt(0)) trow("Payments received", `– ${m(i.amountPaid)}`, { color: GREEN });
  y += 4;
  doc.rect(tx, y, 210, 34).fill(NAVY); doc.rect(tx, y, 3, 34).fill(GOLD);
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#FFFFFF").text("BALANCE DUE", tx + 14, y + 12.5, { characterSpacing: 1.2, lineBreak: false });
  doc.fontSize(14).fillColor(GOLD).text(m(balance), tx + 100, y + 10, { width: 100, align: "right", lineBreak: false });
  const totalsBottom = y + 34;

  let ly = startY;
  const remit = defaults.remitTo?.trim();
  if (balance.gt(0) || i.status === "DRAFT") {
    cap("How to pay", L, ly); doc.moveTo(L, ly + 12).lineTo(L + 24, ly + 12).lineWidth(2.2).strokeColor(GOLD).stroke();
    doc.font("Helvetica").fontSize(9).fillColor(INK).text(remit || `Please make payment to ${name}.`, L, ly + 20, { width: tx - L - 30, lineGap: 1.5 });
    doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text(`Reference ${i.number ?? "the invoice number"} with your payment. Payment is due by ${fd(i.dueDate)}.`, L, doc.y + 6, { width: tx - L - 30 });
    ly = doc.y;
  } else if (i.status === "VOID") {
    cap("Status", L, ly); doc.font("Helvetica").fontSize(9).fillColor(INK).text(`This invoice has been voided${i.voidReason ? `: ${i.voidReason}` : ""}. No payment is due.`, L, ly + 16, { width: tx - L - 30 }); ly = doc.y;
  } else {
    cap("Status", L, ly); doc.font("Helvetica").fontSize(9).fillColor(GREEN).text("Paid in full. Thank you.", L, ly + 16, { width: tx - L - 30 }); ly = doc.y;
  }
  if (i.payments.length) {
    ly += 14; cap("Payments received", L, ly); ly += 14;
    for (const p of i.payments) { doc.font("Helvetica").fontSize(8.5).fillColor(INK).text(`${fd(p.receivedAt)} · ${p.method.charAt(0) + p.method.slice(1).toLowerCase()}${p.reference ? ` · ${p.reference}` : ""}`, L, ly, { width: 200, lineBreak: false }); doc.fillColor(GREEN).text(m(p.amount), L + 200, ly, { width: tx - L - 230, align: "right", lineBreak: false }); ly += 13; }
  }
  y = Math.max(totalsBottom, ly) + 26;
  if (i.notes) {
    if (y + 60 > H - 70) { doc.addPage(); y = 56; }
    cap("Notes", L, y); doc.moveTo(L, y + 12).lineTo(L + 24, y + 12).lineWidth(2.2).strokeColor(GOLD).stroke();
    doc.font("Helvetica").fontSize(9).fillColor(INK).text(i.notes, L, y + 20, { width: CW, lineGap: 1.5 });
  }

  // ── Watermark, footer and page numbers on every page
  const range = doc.bufferedPageRange();
  for (let n = range.start; n < range.start + range.count; n++) {
    doc.switchToPage(n);
    doc.page.margins.bottom = 0;
    const mark = i.status === "VOID" ? ["VOID", RED] : balance.lte(0) && i.status !== "DRAFT" ? ["PAID", GREEN] : i.status === "DRAFT" ? ["DRAFT", MUTED] : null;
    if (mark) { doc.save(); doc.rotate(-28, { origin: [W / 2, H / 2] }); doc.font("Helvetica-Bold").fontSize(120).fillColor(mark[1]).fillOpacity(0.06).text(mark[0], 0, H / 2 - 60, { width: W, align: "center", lineBreak: false }); doc.restore(); doc.fillOpacity(1); }
    doc.rect(0, H - 6, W, 6).fill(NAVY); doc.rect(0, H - 8, W, 2).fill(GOLD);
    doc.moveTo(L, H - 52).lineTo(R, H - 52).lineWidth(0.5).strokeColor(RULE).stroke();
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(BLUE).text(name, L, H - 42, { width: 200, lineBreak: false });
    doc.font("Helvetica-Oblique").fontSize(7.5).fillColor(MUTED).text("Thank you for your business.", L, H - 42, { width: CW, align: "center", lineBreak: false });
    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED).text(`${i.number ?? "Draft"} · Page ${n - range.start + 1} of ${range.count}`, L, H - 42, { width: CW, align: "right", lineBreak: false });
  }
  doc.end();
  return done;
}
