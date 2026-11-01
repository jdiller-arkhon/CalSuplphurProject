import ExcelJS from "exceljs";
import { dec } from "@/lib/decimal";
import { serializable, db } from "../db";
import { audit } from "../audit";
import { receiveTx } from "./inventory";

export class ImportError extends Error {
  name = "ImportError";
}

type FieldSpec = { key: string; label: string; required?: boolean; type?: "text" | "number" | "date" | "pct"; aliases?: string[] };

export const IMPORT_KINDS: Record<string, { label: string; fields: FieldSpec[]; note: string }> = {
  products: {
    label: "Products",
    note: "One row per product. Unit must be MT, ST, LT, LB or KG.",
    fields: [
      { key: "sku", label: "SKU", required: true, aliases: ["code", "item", "item code", "product code"] },
      { key: "name", label: "Name", required: true, aliases: ["product", "product name", "description"] },
      { key: "category", label: "Category" },
      { key: "grade", label: "Grade" },
      { key: "unit", label: "Unit", required: true, aliases: ["uom", "unit of measure"] },
      { key: "defaultCost", label: "Default cost", type: "number", aliases: ["cost", "unit cost"] },
      { key: "standardPrice", label: "Standard price", type: "number", aliases: ["price", "list price"] },
      { key: "minMarginPct", label: "Min margin %", type: "pct", aliases: ["minimum margin", "min margin"] },
      { key: "reorderPoint", label: "Reorder point", type: "number", aliases: ["reorder", "min stock"] },
    ],
  },
  customers: {
    label: "Customers",
    note: "One row per customer. Rows whose name already exists are flagged as duplicates.",
    fields: [
      { key: "name", label: "Name", required: true, aliases: ["customer", "company", "customer name"] },
      { key: "code", label: "Code", aliases: ["customer code", "account"] },
      { key: "email", label: "Email" },
      { key: "phone", label: "Phone" },
      { key: "paymentTerms", label: "Payment terms", aliases: ["terms"] },
      { key: "billingAddress", label: "Billing address", aliases: ["address"] },
      { key: "shippingAddress", label: "Shipping address", aliases: ["ship to"] },
    ],
  },
  suppliers: {
    label: "Suppliers",
    note: "One row per supplier.",
    fields: [
      { key: "name", label: "Name", required: true, aliases: ["supplier", "vendor", "company"] },
      { key: "code", label: "Code", aliases: ["vendor code"] },
      { key: "contactName", label: "Contact", aliases: ["contact name"] },
      { key: "email", label: "Email" },
      { key: "phone", label: "Phone" },
      { key: "paymentTerms", label: "Payment terms", aliases: ["terms"] },
      { key: "address", label: "Address" },
    ],
  },
  inventory: {
    label: "Beginning inventory",
    note: "One row per lot. Product SKU and location code must already exist. Posts a RECEIPT for each row.",
    fields: [
      { key: "sku", label: "Product SKU", required: true, aliases: ["sku", "product", "item code"] },
      { key: "location", label: "Location code", required: true, aliases: ["location", "warehouse", "site"] },
      { key: "lot", label: "Lot number", required: true, aliases: ["lot", "batch", "pile"] },
      { key: "quantity", label: "Quantity", required: true, type: "number", aliases: ["qty", "on hand", "tons"] },
      { key: "unitCost", label: "Unit cost", required: true, type: "number", aliases: ["cost", "unit cost"] },
      { key: "receivedAt", label: "Received date", type: "date", aliases: ["date", "received"] },
    ],
  },
};
export type ImportKind = keyof typeof IMPORT_KINDS;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export async function templateWorkbook(kind: ImportKind): Promise<Buffer> {
  const spec = IMPORT_KINDS[kind];
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(spec.label);
  ws.columns = spec.fields.map((f) => ({ header: f.label + (f.required ? " *" : ""), key: f.key, width: Math.max(14, f.label.length + 6) }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const help = wb.addWorksheet("Instructions");
  help.getCell("A1").value = `${spec.label} import template`;
  help.getCell("A1").font = { bold: true, size: 14 };
  help.getCell("A3").value = spec.note;
  help.getCell("A4").value = "Columns marked * are required. Keep the header row. Percentages may be entered as 15 or 15%.";
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Read the first sheet (xlsx) or CSV into header + rows of strings. */
export async function readSheet(file: File): Promise<{ headers: string[]; rows: string[][] }> {
  const buf = Buffer.from(await file.arrayBuffer());
  if (file.size > 5 * 1024 * 1024) throw new ImportError("Import files must be 5 MB or smaller.");
  const name = file.name.toLowerCase();
  const toStr = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === "object") {
      const o = v as { result?: unknown; text?: string; richText?: { text: string }[] };
      if (o.result !== undefined) return toStr(o.result);
      if (o.richText) return o.richText.map((r) => r.text).join("");
      if (o.text) return o.text;
    }
    return String(v).trim();
  };
  let grid: string[][] = [];
  if (name.endsWith(".csv")) {
    const text = buf.toString("utf8").replace(/^﻿/, "");
    grid = parseCsv(text);
  } else if (name.endsWith(".xlsx")) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws) throw new ImportError("The workbook has no sheets.");
    ws.eachRow({ includeEmpty: false }, (row) => grid.push((row.values as unknown[]).slice(1).map(toStr)));
  } else throw new ImportError("Upload an .xlsx or .csv file.");
  grid = grid.filter((r) => r.some((c) => c !== ""));
  if (grid.length < 2) throw new ImportError("The file needs a header row and at least one data row.");
  if (grid.length > 5001) throw new ImportError("Import up to 5,000 rows at a time.");
  const headers = grid[0].map((h) => h.replace(/\s*\*$/, ""));
  return { headers, rows: grid.slice(1).map((r) => headers.map((_, i) => r[i] ?? "")) };
}

function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell.trim()); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim()); out.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell.trim()); out.push(row); }
  return out;
}

/** Suggest a mapping field → column index from header names. */
export function autoMap(kind: ImportKind, headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  const H = headers.map(norm);
  for (const f of IMPORT_KINDS[kind].fields) {
    const names = [f.key, f.label, ...(f.aliases ?? [])].map(norm);
    const idx = H.findIndex((h) => names.includes(h));
    if (idx >= 0) map[f.key] = idx;
  }
  return map;
}

export type RowResult = { line: number; values: Record<string, string>; errors: string[]; duplicate?: string };

export async function validateRows(kind: ImportKind, rows: string[][], mapping: Record<string, number>): Promise<RowResult[]> {
  const spec = IMPORT_KINDS[kind];
  const missing = spec.fields.filter((f) => f.required && mapping[f.key] === undefined);
  if (missing.length) throw new ImportError(`Match a column for: ${missing.map((f) => f.label).join(", ")}.`);
  const [units, products, locations, customers, suppliers] = await Promise.all([db.unitOfMeasure.findMany(), db.product.findMany({ select: { sku: true } }), db.location.findMany({ select: { code: true } }), db.customer.findMany({ select: { name: true } }), db.supplier.findMany({ select: { name: true } })]);
  const unitSet = new Set(units.map((u) => u.code)), skuSet = new Set(products.map((p) => p.sku.toUpperCase())), locSet = new Set(locations.map((l) => l.code.toUpperCase()));
  const custSet = new Set(customers.map((c) => norm(c.name))), supSet = new Set(suppliers.map((s) => norm(s.name)));
  const seen = new Set<string>();
  return rows.map((r, i) => {
    const values: Record<string, string> = {};
    const errors: string[] = [];
    for (const f of spec.fields) {
      let v = mapping[f.key] !== undefined ? (r[mapping[f.key]] ?? "").trim() : "";
      if (f.type === "number" || f.type === "pct") v = v.replace(/[$,\s]/g, "");
      if (f.type === "pct") v = v.replace(/%$/, "");
      if (f.required && !v) errors.push(`${f.label} is required`);
      if (v && (f.type === "number" || f.type === "pct") && !/^-?\d+(\.\d+)?$/.test(v)) errors.push(`${f.label} must be a number`);
      if (v && f.type === "date" && Number.isNaN(Date.parse(v))) errors.push(`${f.label} is not a date`);
      if (v.length > 500) errors.push(`${f.label} is too long`);
      values[f.key] = v;
    }
    let duplicate: string | undefined;
    if (kind === "products") {
      values.unit = values.unit?.toUpperCase();
      if (values.unit && !unitSet.has(values.unit)) errors.push(`Unit ${values.unit} is not set up`);
      if (values.minMarginPct && Number(values.minMarginPct) >= 100) errors.push("Min margin must be below 100%");
      const k = values.sku?.toUpperCase();
      if (k && skuSet.has(k)) duplicate = "SKU already exists";
      if (k && seen.has(k)) errors.push("SKU appears twice in this file");
      if (k) seen.add(k);
    } else if (kind === "customers" || kind === "suppliers") {
      const k = norm(values.name ?? "");
      if (k && (kind === "customers" ? custSet : supSet).has(k)) duplicate = "Name already exists";
      if (k && seen.has(k)) errors.push("Name appears twice in this file");
      if (k) seen.add(k);
      if (values.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.email)) errors.push("Email is not valid");
    } else if (kind === "inventory") {
      if (values.sku && !skuSet.has(values.sku.toUpperCase())) errors.push(`SKU ${values.sku} not found — import products first`);
      if (values.location && !locSet.has(values.location.toUpperCase())) errors.push(`Location ${values.location} not found`);
      if (values.quantity && Number(values.quantity) <= 0) errors.push("Quantity must be above zero");
      if (values.unitCost && Number(values.unitCost) < 0) errors.push("Unit cost cannot be negative");
    }
    return { line: i + 2, values, errors, duplicate };
  });
}

/**
 * Commit an import in ONE transaction. Rows with errors or duplicates are never silently dropped:
 * if any exist, the caller must explicitly choose to skip them, and every skipped row is recorded.
 */
export async function commitImport(ctx: { userId: string }, kind: ImportKind, fileName: string, rows: RowResult[], skipProblemRows: boolean) {
  const bad = rows.filter((r) => r.errors.length || r.duplicate);
  if (bad.length && !skipProblemRows) throw new ImportError(`${bad.length} row(s) have problems. Fix them, or choose to skip those rows.`);
  const good = rows.filter((r) => !r.errors.length && !r.duplicate);
  if (!good.length) throw new ImportError("There are no valid rows to import.");
  await serializable(async (tx) => {
    for (const r of good) {
      const v = r.values;
      if (kind === "products") {
        const cat = v.category ? await tx.productCategory.upsert({ where: { name: v.category }, update: {}, create: { name: v.category } }) : null;
        await tx.product.create({ data: { sku: v.sku.toUpperCase(), name: v.name, categoryId: cat?.id, grade: v.grade || null, unitCode: v.unit, defaultCost: v.defaultCost || null, standardPrice: v.standardPrice || null, minMarginPct: v.minMarginPct ? dec(v.minMarginPct).div(100).toString() : null, reorderPoint: v.reorderPoint || null } });
      } else if (kind === "customers") {
        await tx.customer.create({ data: { name: v.name, code: v.code ? v.code.toUpperCase() : null, email: v.email || null, phone: v.phone || null, paymentTerms: v.paymentTerms || null, billingAddress: v.billingAddress || null, shippingAddress: v.shippingAddress || null } });
      } else if (kind === "suppliers") {
        await tx.supplier.create({ data: { name: v.name, code: v.code ? v.code.toUpperCase() : null, contactName: v.contactName || null, email: v.email || null, phone: v.phone || null, paymentTerms: v.paymentTerms || null, address: v.address || null } });
      } else if (kind === "inventory") {
        const p = await tx.product.findFirstOrThrow({ where: { sku: { equals: v.sku, mode: "insensitive" } } });
        const l = await tx.location.findFirstOrThrow({ where: { code: { equals: v.location, mode: "insensitive" } } });
        await receiveTx(tx, ctx, { productId: p.id, locationId: l.id, lotNumber: v.lot, quantity: v.quantity, unitCost: v.unitCost, receivedAt: v.receivedAt ? new Date(v.receivedAt) : undefined, reference: `Import: ${fileName}`, reason: "Beginning balance import" });
      }
    }
    await tx.importRun.create({ data: { kind, fileName, rowsTotal: rows.length, rowsImported: good.length, errors: bad.map((b) => ({ line: b.line, errors: b.errors, duplicate: b.duplicate ?? null })), createdBy: ctx.userId } });
    await audit(tx, { userId: ctx.userId, action: "import.commit", entity: "ImportRun", summary: `Imported ${good.length} of ${rows.length} ${IMPORT_KINDS[kind].label.toLowerCase()} rows from ${fileName}${bad.length ? ` (${bad.length} skipped)` : ""}` });
  });
  return { imported: good.length, skipped: bad.length };
}
