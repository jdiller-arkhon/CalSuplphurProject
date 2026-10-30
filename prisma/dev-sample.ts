/**
 * DEVELOPMENT-ONLY sample data for UI review. Every record is labeled "[Sample]".
 * Refuses to run unless APP_ENV=development and the database name contains "dev".
 * All inventory, sales and logistics records are posted through the real services,
 * so balances, ledger entries and costs are genuine outputs of the business logic.
 * Figures are illustrative placeholders, NOT California Sulphur Company data.
 */
import { db } from "../src/server/db";
import * as inv from "../src/server/services/inventory";
import * as sales from "../src/server/services/sales";
import * as po from "../src/server/services/purchasing";

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (process.env.APP_ENV !== "development" || !/\/[^/]*dev[^/]*$/.test(url.split("?")[0])) throw new Error("Refusing: dev-sample runs only against a development database.");
  if (await db.product.count({ where: { name: { startsWith: "[Sample]" } } })) return console.log("Sample data already present.");
  const owner = await db.user.findFirst({ where: { role: "OWNER" } });
  if (!owner) throw new Error("Create the owner account first (visit /first-run).");
  const ctx = { userId: owner.id };
  const days = (n: number) => new Date(Date.now() - n * 864e5);

  const cat = await db.productCategory.upsert({ where: { name: "[Sample] Sulphur" }, update: {}, create: { name: "[Sample] Sulphur" } });
  const prill = await db.product.create({ data: { sku: "SMP-PRILL", name: "[Sample] Formed sulphur prill", categoryId: cat.id, grade: "Sample grade A", unitCode: "MT", defaultCost: "82", standardPrice: "118", minMarginPct: "0.15", reorderPoint: "1500", description: "Illustrative product for UI review." } });
  const molten = await db.product.create({ data: { sku: "SMP-MOLTEN", name: "[Sample] Molten sulphur", categoryId: cat.id, grade: "Sample liquid", unitCode: "MT", defaultCost: "74", standardPrice: "101", minMarginPct: "0.12", reorderPoint: "800" } });
  const crushed = await db.product.create({ data: { sku: "SMP-CRUSH", name: "[Sample] Crushed sulphur", categoryId: cat.id, unitCode: "MT", defaultCost: "68", standardPrice: "92", minMarginPct: "0.12" } });

  const plant = await db.location.create({ data: { code: "SMP-PLT", name: "[Sample] Plant storage", kind: "PLANT", capacity: "20000" } });
  const pad = await db.location.create({ data: { code: "SMP-PAD", name: "[Sample] Outdoor pad", kind: "WAREHOUSE", capacity: "8000" } });
  const berth = await db.location.create({ data: { code: "SMP-BRT", name: "[Sample] Berth staging", kind: "BERTH", capacity: "6000" } });

  const sup = await db.supplier.create({ data: { name: "[Sample] Refinery Supplier A", contactName: "Sample Contact", paymentTerms: "Net 30" } });
  await db.supplier.create({ data: { name: "[Sample] Refinery Supplier B", paymentTerms: "Net 45" } });
  await db.product.updateMany({ where: { id: { in: [prill.id, molten.id] } }, data: { defaultSupplierId: sup.id } });
  const c1 = await db.customer.create({ data: { name: "[Sample] Fertilizer Customer", paymentTerms: "Net 30", shippingAddress: "Sample delivery address" } });
  const c2 = await db.customer.create({ data: { name: "[Sample] Export Trader", paymentTerms: "Net 15" } });
  const c3 = await db.customer.create({ data: { name: "[Sample] Industrial User", paymentTerms: "Net 30" } });

  await inv.receive(ctx, { productId: prill.id, locationId: plant.id, lotNumber: "S-24-101", quantity: "6200", unitCost: "80.50", receivedAt: days(150), reference: "[Sample] opening balance" });
  await inv.receive(ctx, { productId: prill.id, locationId: pad.id, lotNumber: "S-24-117", quantity: "3400", unitCost: "84.25", receivedAt: days(60), reference: "[Sample] scale ticket" });
  await inv.receive(ctx, { productId: molten.id, locationId: plant.id, lotNumber: "M-24-033", quantity: "1250", unitCost: "73.10", receivedAt: days(20), reference: "[Sample] receipt" });
  await inv.receive(ctx, { productId: crushed.id, locationId: pad.id, lotNumber: "C-24-008", quantity: "900", unitCost: "66.00", receivedAt: days(220), reference: "[Sample] opening balance" });
  const lot = await db.inventoryLot.findFirstOrThrow({ where: { lotNumber: "S-24-101" } });
  await inv.transfer(ctx, { lotId: lot.id, toLocationId: berth.id, quantity: "1800", reference: "[Sample] stage for vessel" });
  await inv.adjust(ctx, { lotId: lot.id, delta: "-12.5", reason: "[Sample] cycle count variance" });

  const p = await po.createPO(ctx, { supplierId: sup.id, expectedAt: days(-7), lines: [{ productId: molten.id, quantity: "2000", unitCost: "75.40" }] });
  await po.issuePO(ctx, p.id);
  const pol = await db.purchaseOrderLine.findFirstOrThrow({ where: { poId: p.id } });
  await po.receivePO(ctx, { poId: p.id, reference: "[Sample] partial delivery", lines: [{ poLineId: pol.id, quantity: "650", locationId: plant.id, lotNumber: "M-24-041" }] });

  const mk = async (customerId: string, productId: string, qty: string, price: string) => {
    const q = await sales.createQuote(ctx, { customerId, validUntil: days(-30), lines: [{ productId, quantity: qty, unitPrice: price }] });
    await sales.submitQuote(ctx, q.id);
    const o = await sales.convertQuote(ctx, q.id);
    await sales.allocateOrder(ctx, o.id);
    return o;
  };
  const shipAll = async (orderId: string, mode: string, carrier: string, freight: string, deliver: boolean, n = 1) => {
    const res = await db.inventoryReservation.findMany({ where: { status: "ACTIVE", salesOrderLine: { orderId } } });
    for (let i = 0; i < n; i++) {
      const lines = res.map((r) => ({ salesOrderLineId: r.salesOrderLineId!, lotId: r.lotId, quantity: (Number(r.quantity) / n).toFixed(3) }));
      const s = await sales.createShipment(ctx, { orderId, mode, carrier, origin: "[Sample] Plant", destination: "[Sample] Customer site", scheduledAt: days(10 - i * 3), lines, freight: [{ category: "FREIGHT", amount: freight }] });
      await sales.postShipment(ctx, s.id);
      if (deliver) await sales.deliverShipment(ctx, s.id);
    }
  };
  const o1 = await mk(c1.id, prill.id, "1200", "119.50");
  await shipAll(o1.id, "TRUCK", "[Sample] Own fleet", "1650", true, 3);
  const o2 = await mk(c2.id, prill.id, "1800", "116.00");
  await shipAll(o2.id, "VESSEL", "[Sample] Bulk carrier", "14200", false);
  const o3 = await mk(c3.id, molten.id, "400", "99.75");
  await shipAll(o3.id, "TRUCK", "[Sample] Tank carrier", "2100", true, 2);
  const o4 = await mk(c1.id, prill.id, "900", "121.00");
  const res4 = await db.inventoryReservation.findMany({ where: { status: "ACTIVE", salesOrderLine: { orderId: o4.id } } });
  await sales.createShipment(ctx, { orderId: o4.id, mode: "CONTAINER", carrier: "[Sample] Drayage Co.", destination: "[Sample] Port", scheduledAt: days(-3), lines: res4.map((r) => ({ salesOrderLineId: r.salesOrderLineId!, lotId: r.lotId, quantity: r.quantity.toString() })), freight: [{ category: "LOADING", amount: "780" }] });
  await sales.createQuote(ctx, { customerId: c2.id, validUntil: days(-20), lines: [{ productId: prill.id, quantity: "3000", unitPrice: "94" }] }).then((q) => sales.submitQuote(ctx, q.id));
  console.log("Sample data loaded (all records labeled [Sample]).");
}
main().finally(() => db.$disconnect());
