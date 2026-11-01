"use server";
import { z } from "zod";
import { db } from "../db";
import { audit } from "../audit";
import { action, zReq, zOpt, zDec, UserError } from "../action";
import type { ActionState } from "../action";
import { dec } from "@/lib/decimal";

const unitSchema = z.object({
  code: zReq("Code", 12).transform((v) => v.toUpperCase()).pipe(z.string().regex(/^[A-Z0-9_%/-]{1,12}$/, "Use letters, numbers, %, / or - (max 12)")),
  name: zReq("Name", 60),
  kind: zReq("Kind", 40),          // existing dimension, or "new"
  newKind: zOpt(40),               // name of a brand-new kind of measurement
  relativeTo: zOpt(12),            // unit the factor is expressed against
  factor: zDec("Conversion factor", { min: 0, allowZero: false }),
});

const saveImpl = action("products.manage", unitSchema, async (d, u) => {
  if (await db.unitOfMeasure.findUnique({ where: { code: d.code } })) throw new UserError(`Unit ${d.code} already exists.`);
  let dimension = d.kind, toBase = dec(d.factor);
  if (d.kind === "new") {
    if (!d.newKind) throw new UserError("Name the new kind of measurement (e.g. Bags, Pallets, Shifts).");
    dimension = `custom:${d.newKind.trim().toLowerCase().replace(/[^a-z0-9 ]/g, "").slice(0, 30)}`;
    if (await db.unitOfMeasure.findFirst({ where: { dimension } })) throw new UserError("That kind already exists; choose it from the list.");
    toBase = dec(1); // first unit of a new kind is its base
  } else if (d.relativeTo) {
    const ref = await db.unitOfMeasure.findUnique({ where: { code: d.relativeTo } });
    if (!ref || ref.dimension !== dimension) throw new UserError("The reference unit must be of the same kind.");
    toBase = dec(d.factor).times(dec(ref.toKg));
  }
  await db.unitOfMeasure.create({ data: { code: d.code, name: d.name, dimension, toKg: toBase.toString(), custom: true } });
  await audit(db, { userId: u.id, action: "unit.create", entity: "UnitOfMeasure", entityId: d.code, summary: `Added unit ${d.code} (${d.name})`, data: { dimension, toBase: toBase.toString() } });
  return `Unit ${d.code} added.`;
}, { revalidate: ["/settings/units", "/tracking", "/market"] });
export async function saveUnit(prev: ActionState, fd: FormData) { return saveImpl(prev, fd); }

const delImpl = action("products.manage", z.object({ code: zReq("Unit", 12) }), async (d, u) => {
  const unit = await db.unitOfMeasure.findUnique({ where: { code: d.code }, include: { _count: { select: { products: true, trackers: true, trackerEntries: true, marketRates: true } } } });
  if (!unit) throw new UserError("Unit not found.");
  if (!unit.custom) throw new UserError("Built-in units can't be removed.");
  const used = Object.values(unit._count).reduce((a, b) => a + b, 0);
  if (used) throw new UserError(`${d.code} is in use (${used} record${used === 1 ? "" : "s"}) and can't be removed.`);
  await db.unitOfMeasure.delete({ where: { code: d.code } });
  await audit(db, { userId: u.id, action: "unit.delete", entity: "UnitOfMeasure", entityId: d.code, summary: `Removed unit ${d.code}` });
  return `Unit ${d.code} removed.`;
}, { revalidate: ["/settings/units"] });
export async function deleteUnit(prev: ActionState, fd: FormData) { return delImpl(prev, fd); }
