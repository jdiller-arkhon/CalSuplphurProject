import { db } from "./db";

export async function lookups() {
  const [products, locations, units, customers, suppliers, categories] = await Promise.all([
    db.product.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, sku: true, unitCode: true, defaultCost: true, standardPrice: true, minMarginPct: true } }),
    db.location.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
    db.unitOfMeasure.findMany({ orderBy: { code: "asc" } }),
    db.customer.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, paymentTerms: true, currency: true } }),
    db.supplier.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.productCategory.findMany({ orderBy: { name: "asc" } }),
  ]);
  return {
    products,
    locations,
    units,
    customers,
    suppliers,
    categories,
    productOpts: products.map((p) => ({ value: p.id, label: `${p.name} (${p.sku})` })),
    locationOpts: locations.map((l) => ({ value: l.id, label: `${l.code} — ${l.name}` })),
    unitOpts: units.filter((u) => u.dimension === "mass").map((u) => ({ value: u.code, label: `${u.code} — ${u.name}` })),
    allUnitOpts: units.map((u) => ({ value: u.code, label: `${u.name} (${u.code})` })),
    customerOpts: customers.map((c) => ({ value: c.id, label: c.name })),
    supplierOpts: suppliers.map((s) => ({ value: s.id, label: s.name })),
  };
}

export const today = () => new Date().toISOString().slice(0, 10);
export const isoDate = (d?: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
