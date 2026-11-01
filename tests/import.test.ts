import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, fixture, db } from "./helpers";
import { autoMap, validateRows, commitImport, readSheet, templateWorkbook } from "@/server/services/import";

let f: Awaited<ReturnType<typeof fixture>>;
beforeEach(async () => {
  await resetDb();
  f = await fixture();
});

describe("spreadsheet import", () => {
  it("auto-maps common header names", () => {
    expect(autoMap("products", ["Item Code", "Product Name", "UOM", "Cost"])).toEqual({ sku: 0, name: 1, unit: 2, defaultCost: 3 });
  });
  it("reads CSV with quotes and validates rows without dropping any", async () => {
    const csv = 'SKU,Name,Unit,Cost\nNEW-1,"Prill, fine",MT,"$1,200.50"\nNEW-1,Dup in file,MT,10\nTEST-PRILL,Existing,MT,5\nX,Bad unit,ZZ,abc\n';
    const s = await readSheet(new File([csv], "p.csv", { type: "text/csv" }));
    const rows = await validateRows("products", s.rows, autoMap("products", s.headers));
    expect(rows).toHaveLength(4);
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].values.defaultCost).toBe("1200.50");
    expect(rows[1].errors).toContain("SKU appears twice in this file");
    expect(rows[2].duplicate).toBe("SKU already exists");
    expect(rows[3].errors.join(" ")).toMatch(/Unit ZZ.*number|number.*Unit ZZ/s);
  });
  it("refuses to commit with problem rows unless skipping is chosen, then records skipped rows", async () => {
    const csv = "Name,Email\nAcme,ops@acme.test\nBroken,not-an-email\n";
    const s = await readSheet(new File([csv], "c.csv", { type: "text/csv" }));
    const rows = await validateRows("customers", s.rows, autoMap("customers", s.headers));
    await expect(commitImport(f.ctx, "customers", "c.csv", rows, false)).rejects.toThrow(/problems/);
    expect(await db.customer.count()).toBe(1);
    const r = await commitImport(f.ctx, "customers", "c.csv", rows, true);
    expect(r).toEqual({ imported: 1, skipped: 1 });
    const run = await db.importRun.findFirstOrThrow();
    expect(run.rowsImported).toBe(1);
    expect(JSON.stringify(run.errors)).toContain("Email is not valid");
  });
  it("imports beginning inventory through the ledger", async () => {
    const csv = "SKU,Location,Lot,Qty,Unit cost,Date\nTEST-PRILL,PLT,OPEN-1,1250.5,81.25,2026-01-01\n";
    const s = await readSheet(new File([csv], "i.csv", { type: "text/csv" }));
    const rows = await validateRows("inventory", s.rows, autoMap("inventory", s.headers));
    expect(rows[0].errors).toEqual([]);
    await commitImport(f.ctx, "inventory", "i.csv", rows, false);
    const lot = await db.inventoryLot.findFirstOrThrow();
    expect(lot.onHand.toString()).toBe("1250.5");
    expect(await db.inventoryMovement.count({ where: { type: "RECEIPT" } })).toBe(1);
  });
  it("round-trips its own template", async () => {
    const buf = await templateWorkbook("suppliers");
    const s = await readSheet(new File([new Uint8Array(buf)], "t.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })).catch((e) => e);
    expect(String(s)).toMatch(/header row and at least one data row/);
  });
});
