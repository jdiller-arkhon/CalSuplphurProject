import { db } from "@/server/db";
import { agreedPriceMap } from "@/server/line-products";
import { getSettingTyped } from "@/server/services/settings";
import type { EdCustomer, EdLot, EdProduct } from "./editor";

export async function editorData() {
  const [customers, products, lots, agreed, defaults] = await Promise.all([
    db.customer.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, paymentTerms: true, billingAddress: true, shippingAddress: true } }),
    db.product.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, unitCode: true, standardPrice: true } }),
    db.inventoryLot.findMany({ where: { onHand: { gt: 0 } }, include: { location: true }, orderBy: { receivedAt: "asc" } }),
    agreedPriceMap(),
    getSettingTyped("invoices.defaults"),
  ]);
  return {
    customers: customers as EdCustomer[],
    products: products.map((p): EdProduct => ({ id: p.id, name: p.name, unit: p.unitCode, price: p.standardPrice?.toString() ?? null })),
    lots: lots.map((l): EdLot => ({ id: l.id, productId: l.productId, label: `${l.location.code} / ${l.lotNumber}`, available: l.onHand.minus(l.reserved).toString() })),
    agreed,
    defaults,
  };
}
