import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, fixture, db } from "./helpers";
import * as inv from "@/server/services/inventory";
import * as plant from "@/server/services/plant";
import * as sales from "@/server/services/sales";

let f: Awaited<ReturnType<typeof fixture>>;
beforeEach(async () => {
  await resetDb();
  f = await fixture();
});

describe("scale tickets", () => {
  it("computes net from gross minus tare and converts kg to MT", async () => {
    const t = await plant.recordScaleTicket(f.ctx, { direction: "IN", productId: f.product.id, grossKg: "38450", tareKg: "14200" });
    expect(t.netKg.toString()).toBe("24250");
    expect(t.netQty.toString()).toBe("24.25");
  });
  it("rejects tare >= gross", async () => {
    await expect(plant.recordScaleTicket(f.ctx, { direction: "IN", productId: f.product.id, grossKg: "1000", tareKg: "1000" })).rejects.toThrow(/Tare/);
  });
  it("posts an inbound ticket to inventory and an outbound ticket out of it", async () => {
    await plant.recordScaleTicket(f.ctx, { direction: "IN", productId: f.product.id, grossKg: "40000", tareKg: "15000", post: { locationId: f.plant.id, lotNumber: "T1", unitCost: "80" } });
    const lot = await db.inventoryLot.findFirstOrThrow();
    expect(lot.onHand.toString()).toBe("25");
    await plant.recordScaleTicket(f.ctx, { direction: "OUT", productId: f.product.id, grossKg: "25000", tareKg: "15000", post: { lotId: lot.id } });
    expect((await db.inventoryLot.findFirstOrThrow()).onHand.toString()).toBe("15");
  });
});

describe("production runs", () => {
  it("consumes input, produces output, and carries loss into output cost", async () => {
    const molten = await db.product.create({ data: { sku: "MOLT", name: "Molten", unitCode: "MT" } });
    const m = await inv.receive(f.ctx, { productId: molten.id, locationId: f.plant.id, lotNumber: "M1", quantity: "1000", unitCost: "70" });
    const run = await plant.recordProductionRun(f.ctx, { runDate: new Date(), inputLotId: m.lotId, inputQty: "500", outputProductId: f.product.id, outputLocationId: f.plant.id, outputLotNumber: "P1", outputQty: "490", processingCost: "4900" });
    // (500 × 70 + 4900) / 490 = 81.4286
    expect(run.outputUnitCost.toString()).toBe("81.4286");
    expect(run.yieldPct.toString()).toBe("0.98");
    expect((await db.inventoryLot.findUniqueOrThrow({ where: { id: m.lotId } })).onHand.toString()).toBe("500");
    const out = await db.inventoryLot.findFirstOrThrow({ where: { lotNumber: "P1" } });
    expect(out.onHand.toString()).toBe("490");
    expect(await db.inventoryMovement.count({ where: { type: "PRODUCTION_OUT" } })).toBe(1);
    expect(await db.inventoryMovement.count({ where: { type: "PRODUCTION_IN" } })).toBe(1);
    expect(await inv.reconcileLots(db as never)).toEqual([]);
  });
  it("refuses to consume more than is available", async () => {
    const molten = await db.product.create({ data: { sku: "MOLT", name: "Molten", unitCode: "MT" } });
    const m = await inv.receive(f.ctx, { productId: molten.id, locationId: f.plant.id, lotNumber: "M1", quantity: "100", unitCost: "70" });
    await expect(plant.recordProductionRun(f.ctx, { runDate: new Date(), inputLotId: m.lotId, inputQty: "150", outputProductId: f.product.id, outputLocationId: f.plant.id, outputLotNumber: "P1", outputQty: "140" })).rejects.toThrow(/Not enough/);
  });
  it("is idempotent", async () => {
    const molten = await db.product.create({ data: { sku: "MOLT", name: "Molten", unitCode: "MT" } });
    const m = await inv.receive(f.ctx, { productId: molten.id, locationId: f.plant.id, lotNumber: "M1", quantity: "100", unitCost: "70" });
    const args = { runDate: new Date(), inputLotId: m.lotId, inputQty: "50", outputProductId: f.product.id, outputLocationId: f.plant.id, outputLotNumber: "P1", outputQty: "49", idempotencyKey: "k" };
    const a = await plant.recordProductionRun(f.ctx, args);
    const b = await plant.recordProductionRun(f.ctx, args);
    expect(a.id).toBe(b.id);
    expect(await db.productionRun.count()).toBe(1);
  });
});

describe("vessel loading", () => {
  it("records one row per day and replaces on re-entry", async () => {
    const s = await sales.createShipment(f.ctx, { mode: "VESSEL", lines: [{ lotId: (await inv.receive(f.ctx, { productId: f.product.id, locationId: f.plant.id, lotNumber: "L", quantity: "100", unitCost: "1" })).lotId, quantity: "10" }] });
    await plant.recordVesselDay(f.ctx, { shipmentId: s.id, day: new Date("2026-11-01"), quantity: "8500" });
    await plant.recordVesselDay(f.ctx, { shipmentId: s.id, day: new Date("2026-11-01"), quantity: "9100" });
    const rows = await db.vesselLoadDay.findMany();
    expect(rows.length).toBe(1);
    expect(rows[0].quantity.toString()).toBe("9100");
  });
});
