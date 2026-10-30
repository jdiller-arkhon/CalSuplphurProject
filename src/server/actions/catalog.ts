"use server";

import { z } from "zod";
import { db } from "../db";
import { audit } from "../audit";
import { action, zReq, zOpt, zDecOpt, zPct, zBool, UserError, zDec } from "../action";
import * as inv from "../services/inventory";

const productSchema = z.object({
  id: zOpt(40),
  sku: zReq("SKU", 60),
  name: zReq("Name", 160),
  categoryName: zOpt(80),
  grade: zOpt(80),
  description: zOpt(2000),
  unitCode: zReq("Unit"),
  defaultSupplierId: zOpt(40),
  defaultCost: zDecOpt("Default cost"),
  standardPrice: zDecOpt("Standard price"),
  minMarginPct: z.string().trim().optional().transform((v) => (v ? v : undefined)).pipe(zPct("Minimum margin").optional()),
  reorderPoint: zDecOpt("Reorder point"),
  specifications: zOpt(4000),
});

export const saveProduct = action("products.manage", productSchema, async (d, u) => {
  if (d.minMarginPct && Number(d.minMarginPct) >= 1) throw new UserError("Minimum margin must be below 100%.");
  const category = d.categoryName ? await db.productCategory.upsert({ where: { name: d.categoryName }, update: {}, create: { name: d.categoryName } }) : null;
  let specs: unknown = undefined;
  if (d.specifications) {
    // "Key: value" per line → structured specification object.
    specs = Object.fromEntries(d.specifications.split("\n").map((l) => l.split(/:(.*)/s).map((s) => s.trim())).filter(([k, v]) => k && v));
  }
  const data = {
    sku: d.sku.toUpperCase(),
    name: d.name,
    categoryId: category?.id ?? null,
    grade: d.grade ?? null,
    description: d.description ?? null,
    unitCode: d.unitCode,
    defaultSupplierId: d.defaultSupplierId ?? null,
    defaultCost: d.defaultCost ?? null,
    standardPrice: d.standardPrice ?? null,
    minMarginPct: d.minMarginPct ?? null,
    reorderPoint: d.reorderPoint ?? null,
    specifications: specs as object | undefined,
  };
  if (d.id) {
    const before = await db.product.findUniqueOrThrow({ where: { id: d.id } });
    if (before.unitCode !== d.unitCode && (await db.inventoryLot.count({ where: { productId: d.id } }))) throw new UserError("The unit cannot change once inventory exists for this product.");
    const p = await db.product.update({ where: { id: d.id }, data });
    await audit(db, { userId: u.id, action: "product.update", entity: "Product", entityId: p.id, summary: `Updated product ${p.sku}`, data: { minMarginBefore: before.minMarginPct?.toString(), minMarginAfter: d.minMarginPct } });
    return { message: "Product saved.", redirect: `/products/${p.id}` };
  }
  const p = await db.product.create({ data });
  await audit(db, { userId: u.id, action: "product.create", entity: "Product", entityId: p.id, summary: `Created product ${p.sku} — ${p.name}` });
  return { message: "Product created.", redirect: `/products/${p.id}` };
});

export const setProductActive = action("products.manage", z.object({ id: zReq("id"), active: zBool }), async (d, u) => {
  const p = await db.product.update({ where: { id: d.id }, data: { active: d.active } });
  await audit(db, { userId: u.id, action: d.active ? "product.restore" : "product.archive", entity: "Product", entityId: p.id, summary: `${d.active ? "Restored" : "Archived"} product ${p.sku}` });
  return d.active ? "Product restored." : "Product archived. History is preserved.";
});

export const saveLocation = action(
  "products.manage",
  z.object({ id: zOpt(40), code: zReq("Code", 20), name: zReq("Name", 120), kind: zReq("Type"), capacity: zDecOpt("Capacity"), address: zOpt(300) }),
  async (d, u) => {
    const data = { code: d.code.toUpperCase(), name: d.name, kind: d.kind, capacity: d.capacity ?? null, capacityUnit: d.capacity ? "MT" : null, address: d.address ?? null };
    const l = d.id ? await db.location.update({ where: { id: d.id }, data }) : await db.location.create({ data });
    await audit(db, { userId: u.id, action: d.id ? "location.update" : "location.create", entity: "Location", entityId: l.id, summary: `${d.id ? "Updated" : "Created"} location ${l.code}` });
    return "Location saved.";
  },
);

const key = z.string().optional();

export const receiveAction = action(
  "inventory.operate",
  z.object({ productId: zReq("Product"), locationId: zReq("Location"), lotNumber: zReq("Lot number", 60), quantity: zDec("Quantity", { min: 0, allowZero: false }), unitCost: zDec("Unit cost", { min: 0 }), reference: zOpt(120), receivedAt: zOpt(30), idempotencyKey: key }),
  async (d, u) => {
    await inv.receive({ userId: u.id }, { ...d, receivedAt: d.receivedAt ? new Date(d.receivedAt) : undefined, idempotencyKey: d.idempotencyKey ? `recv:${d.idempotencyKey}` : undefined });
    return "Inventory received and posted to the ledger.";
  },
);

export const adjustAction = action("inventory.operate", z.object({ lotId: zReq("Lot"), delta: zDec("Adjustment", { allowZero: false }), reason: zReq("Reason", 300), idempotencyKey: key }), async (d, u) => {
  await inv.adjust({ userId: u.id }, { ...d, idempotencyKey: d.idempotencyKey ? `adj:${d.idempotencyKey}` : undefined });
  return "Adjustment posted.";
});

export const transferAction = action("inventory.operate", z.object({ lotId: zReq("Lot"), toLocationId: zReq("Destination"), quantity: zDec("Quantity", { min: 0, allowZero: false }), reference: zOpt(120), idempotencyKey: key }), async (d, u) => {
  await inv.transfer({ userId: u.id }, { ...d, idempotencyKey: d.idempotencyKey ? `xfer:${d.idempotencyKey}` : undefined });
  return "Transfer posted.";
});

export const reserveAction = action("inventory.operate", z.object({ lotId: zReq("Lot"), quantity: zDec("Quantity", { min: 0, allowZero: false }), note: zOpt(200) }), async (d, u) => {
  await inv.reserve({ userId: u.id }, d);
  return "Quantity reserved.";
});

export const releaseAction = action("inventory.operate", z.object({ id: zReq("Reservation") }), async (d, u) => {
  await inv.release({ userId: u.id }, d.id);
  return "Reservation released.";
});

export const shipOutAction = action("inventory.operate", z.object({ lotId: zReq("Lot"), quantity: zDec("Quantity", { min: 0, allowZero: false }), reference: zReq("Reference", 120), idempotencyKey: key }), async (d, u) => {
  await inv.shipOut({ userId: u.id }, { ...d, idempotencyKey: d.idempotencyKey ? `out:${d.idempotencyKey}` : undefined });
  return "Outbound quantity recorded.";
});

export const reverseAction = action("inventory.reverse", z.object({ movementId: zReq("Movement"), reason: zReq("Reason", 300) }), async (d, u) => {
  await inv.reverse({ userId: u.id }, d.movementId, d.reason);
  return "Movement reversed. The original and the reversal both remain in the ledger.";
});
