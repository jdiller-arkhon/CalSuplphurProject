import { db } from "./db";
import { getSettingTyped } from "./services/settings";
import type { LineProduct } from "@/components/line-editor";

export async function lineProducts(): Promise<LineProduct[]> {
  const [products, avg, defMin] = await Promise.all([
    db.product.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.$queryRaw<{ productId: string; avg: string }[]>`SELECT "productId", (SUM("onHand"*"unitCost")/SUM("onHand"))::text AS avg FROM "InventoryLot" WHERE "onHand" > 0 GROUP BY "productId"`,
    getSettingTyped("pricing.defaultMinMarginPct"),
  ]);
  const m = new Map(avg.map((a) => [a.productId, a.avg]));
  return products.map((p) => ({ id: p.id, name: p.name, unit: p.unitCode, cost: m.get(p.id) ?? p.defaultCost?.toString() ?? null, price: p.standardPrice?.toString() ?? null, minMargin: p.minMarginPct?.toString() ?? defMin }));
}

/** Current agreed prices: customerId → productId → unit price (latest valid agreement wins). */
export async function agreedPriceMap(): Promise<Record<string, Record<string, string>>> {
  const now = new Date();
  const rows = await db.pricingAgreement.findMany({ where: { validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gte: now } }] }, orderBy: { validFrom: "asc" } });
  const out: Record<string, Record<string, string>> = {};
  for (const r of rows) (out[r.customerId] ??= {})[r.productId] = r.unitPrice.toString();
  return out;
}
