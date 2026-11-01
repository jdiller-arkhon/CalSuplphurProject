"use server";
import { z } from "zod";
import { db } from "../db";
import { audit } from "../audit";
import { action, zReq, zOpt, zDec, zDate, zDateOpt, UserError } from "../action";
import type { ActionState } from "../action";

const rateSchema = z.object({
  productId: zOpt(40),
  grade: zOpt(120),
  sourceType: z.enum(["PUBLISHED_INDEX", "COMPETITOR_QUOTE", "CUSTOMER_FEEDBACK", "BROKER", "LOST_DEAL", "OTHER"]),
  source: zReq("Source", 160),
  basis: zReq("Basis", 20),
  region: zOpt(120),
  price: zDec("Price", { min: 0, allowZero: false }),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code").default("USD"),
  unitCode: zReq("Unit", 20),
  observedAt: zDate("Date observed"),
  validUntil: zDateOpt,
  note: zOpt(1000),
});

const saveImpl = action("pricing.use", rateSchema, async (d, u) => {
  if (!d.productId && !d.grade) throw new UserError("Choose a product or describe the grade.");
  if (d.observedAt.getTime() > Date.now() + 86400000) throw new UserError("The date observed can't be in the future.");
  const unit = await db.unitOfMeasure.findUnique({ where: { code: d.unitCode } });
  if (!unit) throw new UserError("Choose a unit.");
  if (d.productId && unit.dimension !== "mass") throw new UserError("Product prices must be per unit of weight (e.g. per MT, short ton or lb).");
  const r = await db.marketRate.create({ data: { productId: d.productId ?? null, grade: d.grade ?? null, sourceType: d.sourceType, source: d.source, basis: d.basis, region: d.region ?? null, price: d.price, currency: d.currency, unitCode: d.unitCode, observedAt: d.observedAt, validUntil: d.validUntil ?? null, note: d.note ?? null, createdBy: u.id } });
  await audit(db, { userId: u.id, action: "market.rate.create", entity: "MarketRate", entityId: r.id, summary: `Recorded market price ${d.currency} ${d.price}/${d.unitCode} from ${d.source}` });
  return "Market price recorded.";
}, { revalidate: ["/market", "/pricing"] });
export async function saveMarketRate(prev: ActionState, fd: FormData) { return saveImpl(prev, fd); }

const delImpl = action("pricing.use", z.object({ id: zReq("Rate", 40) }), async (d, u) => {
  const r = await db.marketRate.delete({ where: { id: d.id } });
  await audit(db, { userId: u.id, action: "market.rate.delete", entity: "MarketRate", entityId: r.id, summary: `Deleted market price ${r.currency} ${r.price}/${r.unitCode} from ${r.source}` });
  return "Market price deleted.";
}, { revalidate: ["/market", "/pricing"] });
export async function deleteMarketRate(prev: ActionState, fd: FormData) { return delImpl(prev, fd); }
