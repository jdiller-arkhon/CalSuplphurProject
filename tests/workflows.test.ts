import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, fixture, db } from "./helpers";
import * as inv from "@/server/services/inventory";
import * as sales from "@/server/services/sales";
import * as po from "@/server/services/purchasing";

let f: Awaited<ReturnType<typeof fixture>>;
beforeEach(async () => {
  await resetDb();
  f = await fixture();
});
const lot = (id: string) => db.inventoryLot.findUniqueOrThrow({ where: { id } });

describe("inventory ledger", () => {
  it("receives into a lot with weighted-average cost", async () => {
    const m1 = await inv.receive(f.ctx, { productId: f.product.id, locationId: f.plant.id, lotNumber: "L1", quantity: "100", unitCost: "80" });
    await inv.receive(f.ctx, { productId: f.product.id, locationId: f.plant.id, lotNumber: "L1", quantity: "300", unitCost: "100" });
    const l = await lot(m1.lotId);
    expect(l.onHand.toString()).toBe("400");
    expect(l.unitCost.toString()).toBe("95");
    expect(await db.inventoryMovement.count()).toBe(2);
  });

  it("is idempotent for duplicate requests", async () => {
    const a = await inv.receive(f.ctx, { productId: f.product.id, locationId: f.plant.id, lotNumber: "L1", quantity: "10", unitCost: "1", idempotencyKey: "k1" });
    const b = await inv.receive(f.ctx, { productId: f.product.id, locationId: f.plant.id, lotNumber: "L1", quantity: "10", unitCost: "1", idempotencyKey: "k1" });
    expect(a.id).toBe(b.id);
    expect((await lot(a.lotId)).onHand.toString()).toBe("10");
  });

  it("prevents negative available stock and over-reservation", async () => {
    const m = await inv.receive(f.ctx, { productId: f.product.id, locationId: f.plant.id, lotNumber: "L1", quantity: "50", unitCost: "80" });
    await inv.reserve(f.ctx, { lotId: m.lotId, quantity: "40" });
    await expect(inv.reserve(f.ctx, { lotId: m.lotId, quantity: "11" })).rejects.toThrow(/available/);
    await expect(inv.adjust(f.ctx, { lotId: m.lotId, delta: "-20", reason: "count" })).rejects.toThrow(/reserved/);
    await expect(inv.shipOut(f.ctx, { lotId: m.lotId, quantity: "11" })).rejects.toThrow(/available/);
    await expect(inv.transfer(f.ctx, { lotId: m.lotId, toLocationId: f.port.id, quantity: "11" })).rejects.toThrow(/available/);
  });

  it("transfers preserve lot and cost and balance", async () => {
    const m = await inv.receive(f.ctx, { productId: f.product.id, locationId: f.plant.id, lotNumber: "L1", quantity: "50", unitCost: "80" });
    await inv.transfer(f.ctx, { lotId: m.lotId, toLocationId: f.port.id, quantity: "20" });
    const lots = await db.inventoryLot.findMany({ orderBy: { createdAt: "asc" } });
    expect(lots.map((l) => [l.lotNumber, l.onHand.toString(), l.unitCost.toString()])).toEqual([["L1", "30", "80"], ["L1", "20", "80"]]);
    const mv = await db.inventoryMovement.findMany({ where: { type: { in: ["TRANSFER_IN", "TRANSFER_OUT"] } } });
    expect(new Set(mv.map((x) => x.transferGroup)).size).toBe(1);
  });

  it("reverses an adjustment without editing history, and only once", async () => {
    const m = await inv.receive(f.ctx, { productId: f.product.id, locationId: f.plant.id, lotNumber: "L1", quantity: "50", unitCost: "80" });
    const adj = await inv.adjust(f.ctx, { lotId: m.lotId, delta: "-5", reason: "moisture" });
    await inv.reverse(f.ctx, adj.id, "count error");
    expect((await lot(m.lotId)).onHand.toString()).toBe("50");
    await expect(inv.reverse(f.ctx, adj.id, "again")).rejects.toThrow(/already/);
    expect(await db.inventoryMovement.count()).toBe(3);
  });

  it("reversing a receipt backs out its cost from the blend", async () => {
    await inv.receive(f.ctx, { productId: f.product.id, locationId: f.plant.id, lotNumber: "L1", quantity: "100", unitCost: "80" });
    const r2 = await inv.receive(f.ctx, { productId: f.product.id, locationId: f.plant.id, lotNumber: "L1", quantity: "100", unitCost: "120" });
    await inv.reverse(f.ctx, r2.id, "wrong receipt");
    const l = await lot(r2.lotId);
    expect(l.onHand.toString()).toBe("100");
    expect(l.unitCost.toString()).toBe("80");
  });

  it("balances reconcile to ledger", async () => {
    const m = await inv.receive(f.ctx, { productId: f.product.id, locationId: f.plant.id, lotNumber: "L1", quantity: "50", unitCost: "80" });
    await inv.adjust(f.ctx, { lotId: m.lotId, delta: "-1.5", reason: "x" });
    await inv.transfer(f.ctx, { lotId: m.lotId, toLocationId: f.port.id, quantity: "10" });
    expect(await inv.reconcileLots(db as never)).toEqual([]);
  });

  it("serializes concurrent reservations without overselling", async () => {
    const m = await inv.receive(f.ctx, { productId: f.product.id, locationId: f.plant.id, lotNumber: "L1", quantity: "100", unitCost: "80" });
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => inv.reserve(f.ctx, { lotId: m.lotId, quantity: "30" })));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    expect(ok).toBe(3);
    expect((await lot(m.lotId)).reserved.toString()).toBe("90");
  });
});

describe("quote → order → allocation → shipment", () => {
  async function stock() {
    await inv.receive(f.ctx, { productId: f.product.id, locationId: f.plant.id, lotNumber: "OLD", quantity: "60", unitCost: "80", receivedAt: new Date("2026-01-01") });
    await inv.receive(f.ctx, { productId: f.product.id, locationId: f.plant.id, lotNumber: "NEW", quantity: "100", unitCost: "90", receivedAt: new Date("2026-02-01") });
  }

  it("requires approval below minimum margin", async () => {
    const q = await sales.createQuote(f.ctx, { customerId: f.customer.id, validUntil: new Date(Date.now() + 864e5), lines: [{ productId: f.product.id, quantity: "10", unitPrice: "90", unitCost: "80" }] });
    expect(q.belowMinMargin).toBe(true);
    expect((await sales.submitQuote(f.ctx, q.id)).status).toBe("PENDING_APPROVAL");
    await expect(sales.convertQuote(f.ctx, q.id)).rejects.toThrow(/approved/);
    await expect(sales.decideQuote({ ...f.ctx, canApprove: false }, q.id, true)).rejects.toThrow();
    await sales.decideQuote({ ...f.ctx, canApprove: true }, q.id, true);
    const o = await sales.convertQuote(f.ctx, q.id);
    expect(o.number).toMatch(/^SO-\d{4}-00001$/);
    const again = await sales.convertQuote(f.ctx, q.id);
    expect(again.id).toBe(o.id);
  });

  it("auto-approves at or above margin and runs partial fulfilment end to end", async () => {
    await stock();
    const q = await sales.createQuote(f.ctx, { customerId: f.customer.id, validUntil: new Date(Date.now() + 864e5), lines: [{ productId: f.product.id, quantity: "120", unitPrice: "120" }] });
    expect(q.belowMinMargin).toBe(false);
    expect((await sales.submitQuote(f.ctx, q.id)).status).toBe("APPROVED");
    const o = await sales.convertQuote(f.ctx, q.id);
    const { shortages } = await sales.allocateOrder(f.ctx, o.id);
    expect(shortages).toEqual([]);
    const res = await db.inventoryReservation.findMany({ include: { lot: true }, orderBy: { createdAt: "asc" } });
    expect(res.map((r) => [r.lot.lotNumber, r.quantity.toString()])).toEqual([["OLD", "60"], ["NEW", "60"]]); // FIFO

    // re-allocation does not double reserve
    await sales.allocateOrder(f.ctx, o.id);
    expect(await db.inventoryReservation.count()).toBe(2);

    const line = (await db.salesOrderLine.findFirstOrThrow({ where: { orderId: o.id } })).id;
    const oldLot = res[0].lotId;
    const s1 = await sales.createShipment(f.ctx, { orderId: o.id, mode: "TRUCK", lines: [{ salesOrderLineId: line, lotId: oldLot, quantity: "25" }], freight: [{ category: "FREIGHT", amount: "500" }] });
    await sales.postShipment(f.ctx, s1.id);
    await sales.postShipment(f.ctx, s1.id); // duplicate dispatch is a no-op
    expect((await lot(oldLot)).onHand.toString()).toBe("35");
    expect((await lot(oldLot)).reserved.toString()).toBe("35");
    expect((await db.salesOrder.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("PARTIALLY_SHIPPED");

    await expect(sales.createShipment(f.ctx, { orderId: o.id, mode: "TRUCK", lines: [{ salesOrderLineId: line, lotId: oldLot, quantity: "96" }] })).rejects.toThrow(/exceed/);

    const s2 = await sales.createShipment(f.ctx, { orderId: o.id, mode: "TRUCK", lines: [{ salesOrderLineId: line, lotId: oldLot, quantity: "35" }, { salesOrderLineId: line, lotId: res[1].lotId, quantity: "60" }] });
    await sales.postShipment(f.ctx, s2.id);
    expect((await db.salesOrder.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("SHIPPED");
    await sales.deliverShipment(f.ctx, s1.id);
    await sales.deliverShipment(f.ctx, s2.id);
    expect((await db.salesOrder.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("COMPLETED");
    expect((await lot(res[1].lotId)).onHand.toString()).toBe("40");
    expect((await lot(res[1].lotId)).reserved.toString()).toBe("0");
    expect(await inv.reconcileLots(db as never)).toEqual([]);
  });

  it("cancelling an order releases reservations", async () => {
    await stock();
    const o = await sales.createOrder(f.ctx, { customerId: f.customer.id, lines: [{ productId: f.product.id, quantity: "50", unitPrice: "120" }] });
    await sales.allocateOrder(f.ctx, o.id);
    await sales.cancelOrder(f.ctx, o.id, "customer cancelled");
    const lots = await db.inventoryLot.findMany();
    expect(lots.every((l) => l.reserved.toString() === "0")).toBe(true);
  });

  it("reports shortages", async () => {
    const o = await sales.createOrder(f.ctx, { customerId: f.customer.id, lines: [{ productId: f.product.id, quantity: "5", unitPrice: "120" }] });
    const { shortages } = await sales.allocateOrder(f.ctx, o.id);
    expect(shortages[0]).toMatch(/short 5/);
  });
});

describe("purchasing", () => {
  it("partial receipts post to the ledger and close the PO", async () => {
    const p = await po.createPO(f.ctx, { supplierId: f.supplier.id, lines: [{ productId: f.product.id, quantity: "1000", unitCost: "70" }] });
    await expect(po.receivePO(f.ctx, { poId: p.id, lines: [] })).rejects.toThrow(/issued/);
    await po.issuePO(f.ctx, p.id);
    const line = await db.purchaseOrderLine.findFirstOrThrow({ where: { poId: p.id } });
    await po.receivePO(f.ctx, { poId: p.id, idempotencyKey: "r1", lines: [{ poLineId: line.id, quantity: "400", locationId: f.plant.id, lotNumber: "P1" }] });
    await po.receivePO(f.ctx, { poId: p.id, idempotencyKey: "r1", lines: [{ poLineId: line.id, quantity: "400", locationId: f.plant.id, lotNumber: "P1" }] });
    expect((await db.purchaseOrder.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("PARTIALLY_RECEIVED");
    await expect(po.amendPOLine(f.ctx, { poLineId: line.id, quantity: "300", unitCost: "70", reason: "x" })).rejects.toThrow(/already been received/);
    await po.receivePO(f.ctx, { poId: p.id, lines: [{ poLineId: line.id, quantity: "600", locationId: f.plant.id, lotNumber: "P1" }] });
    expect((await db.purchaseOrder.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("RECEIVED");
    const l = await db.inventoryLot.findFirstOrThrow();
    expect(l.onHand.toString()).toBe("1000");
    expect(await db.inventoryMovement.count({ where: { purchaseReceiptLineId: { not: null } } })).toBe(2);
  });
});
