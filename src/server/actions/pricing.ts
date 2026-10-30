"use server";

import { z } from "zod";
import { db } from "../db";
import { audit } from "../audit";
import { authorize } from "../auth";
import { calculatePrice, PricingError, type PricingInput } from "@/lib/pricing";
import { dec } from "@/lib/decimal";
import { getSettingTyped } from "../services/settings";

const decStr = z.string().trim().regex(/^-?\d{1,14}(\.\d{1,8})?$/, "Invalid number");
const schema = z.object({
  name: z.string().trim().min(1, "Name the scenario").max(120),
  productId: z.string().optional().nullable(),
  customerId: z.string().optional().nullable(),
  quantity: decStr,
  shipments: z.number().int().min(1).max(100000),
  method: z.enum(["MARGIN", "MARKUP", "TARGET_PROFIT"]),
  target: decStr,
  discountPct: decStr,
  finalPrice: decStr.optional().nullable(),
  components: z.array(z.object({ category: z.string().max(40), label: z.string().trim().min(1).max(80), basis: z.enum(["PER_UNIT", "PER_SHIPMENT", "PER_ORDER", "PERCENT_OF_PRICE"]), amount: decStr })).max(40),
});

export type SaveScenarioInput = z.infer<typeof schema>;

/** Persists a scenario. The result is recalculated on the server; client figures are never trusted. */
export async function saveScenario(input: SaveScenarioInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const u = await authorize("pricing.use");
    const d = schema.parse(input);
    const product = d.productId ? await db.product.findUnique({ where: { id: d.productId } }) : null;
    const minMargin = product?.minMarginPct?.toString() ?? (await getSettingTyped("pricing.defaultMinMarginPct"));
    const pi: PricingInput = { quantity: d.quantity, shipments: d.shipments, method: d.method, target: d.target, discountPct: d.discountPct, components: d.components, minMarginPct: minMargin };
    const result = calculatePrice(pi);
    const s = await db.pricingScenario.create({
      data: {
        name: d.name,
        productId: product?.id ?? null,
        customerId: d.customerId || null,
        quantity: d.quantity,
        shipments: d.shipments,
        method: d.method,
        target: d.target,
        discountPct: d.discountPct,
        unitCost: result.landedUnitCost,
        recommendedPrice: result.recommendedPrice,
        finalPrice: d.finalPrice && dec(d.finalPrice).gt(0) ? d.finalPrice : result.netPrice,
        result: JSON.parse(JSON.stringify({ ...result, minMarginPct: minMargin })),
        createdBy: u.id,
        components: { create: d.components.map((c, i) => ({ ...c, sort: i })) },
      },
    });
    await audit(db, { userId: u.id, action: "pricing.save", entity: "PricingScenario", entityId: s.id, summary: `Saved pricing scenario "${d.name}" — ${d.method.toLowerCase()} → $${result.netPrice}/unit` });
    return { ok: true, id: s.id };
  } catch (e) {
    if (e instanceof PricingError) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Invalid input" };
    if ((e as Error).name === "AuthError" || (e as { status?: number }).status) return { ok: false, error: (e as Error).message };
    return { ok: false, error: "Could not save the scenario." };
  }
}
