import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { resetDb, fixture, db } from "./helpers";
import * as inv from "@/server/services/inventory";
import { askInsights } from "@/server/services/insights";
import { DEFAULT_ROLE_PERMISSIONS, type Permission } from "@/server/permissions";

// A stand-in for the local model server: scripted replies, so tests are deterministic.
let replies: string[] = [];
const seen: string[] = [];
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    seen.push(body);
    res.setHeader("Content-Type", "application/json");
    if (req.url?.endsWith("/v1/models")) return res.end(JSON.stringify({ data: [{ id: "stub" }] }));
    res.end(JSON.stringify({ choices: [{ message: { content: replies.shift() ?? "" } }] }));
  });
});

const user = (role: "OWNER" | "VIEWER") => ({ id: "u", email: "u@test", name: "U", role, mfaEnabled: false, permissions: new Set<Permission>(DEFAULT_ROLE_PERMISSIONS[role]) });

beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, r));
  process.env.LOCAL_LLM_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await resetDb();
  const f = await fixture();
  await inv.receive(f.ctx, { productId: f.product.id, locationId: f.plant.id, lotNumber: "L1", quantity: "1250", unitCost: "80" });
});
afterAll(() => server.close());

describe("CSC Insights", () => {
  it("answers from tool data when the wording only uses real figures", async () => {
    replies = ['{"tool":"inventory_summary","args":{}}', "We have 1,250 MT available right now."];
    const r = await askInsights("What is our available inventory?", user("OWNER"));
    expect(r.tool).toBe("inventory_summary");
    expect(r.answer).toBe("We have 1,250 MT available right now.");
    expect(r.note).toBeUndefined();
    expect(r.result?.table?.rows[0]).toContain("1,250");
  });

  it("discards wording that contains an invented number", async () => {
    replies = ['{"tool":"inventory_summary","args":{}}', "We have 9,999 MT available."];
    const r = await askInsights("How much stock?", user("OWNER"));
    expect(r.answer).not.toContain("9,999");
    expect(r.answer).toContain("1,250");
    expect(r.note).toMatch(/not found in the data/);
  });

  it("computes the price for a target margin with the pricing engine, not the model", async () => {
    replies = ['{"tool":"price_for_margin","args":{"product":"TEST-PRILL","margin":"20"}}', "Charge $100.00 per MT for a 20% margin."];
    const r = await askInsights("What price for a 20% margin on prill?", user("OWNER"));
    expect(r.result?.facts.join(" ")).toContain("$100.00"); // 80 / (1 − 0.20)
    expect(r.answer).toContain("$100.00");
  });

  it("falls back to keyword routing when the model returns junk", async () => {
    replies = ["not json at all", ""];
    const r = await askInsights("What inventory is committed to orders?", user("OWNER"));
    expect(r.tool).toBe("committed_inventory");
  });

  it("never lets a viewer reach financial tools, even if the model picks one", async () => {
    replies = ['{"tool":"product_margins","args":{}}', "Margins are great."];
    const r = await askInsights("Which products have the best margins?", user("VIEWER"));
    expect(r.tool).not.toBe("product_margins");
    expect(JSON.stringify(r)).not.toMatch(/gross margin/i);
  });

  it("does not send cost data to the model for a viewer", async () => {
    seen.length = 0;
    replies = ['{"tool":"inventory_summary","args":{}}', "1,250 MT available."];
    await askInsights("stock?", user("VIEWER"));
    expect(seen.join(" ")).not.toMatch(/Inventory value|\$100,000/);
  });

  it("replaces a reply that misses the calculated answer (right data, wrong pick)", async () => {
    replies = ['{"tool":"inventory_summary","args":{}}', "We have 1,250 MT on hand and 0 committed."];
    const r = await askInsights("How much is available?", user("OWNER"));
    // "1,250" appears, but the headline also lists 0 committed and 1,250 available — all present, so accepted.
    expect(r.note).toBeUndefined();
    replies = ['{"tool":"price_for_margin","args":{"product":"TEST-PRILL","margin":"20"}}', "Our cost is $80.00 per MT."];
    const r2 = await askInsights("Price for 20%?", user("OWNER"));
    expect(r2.answer).toContain("$100.00");
    expect(r2.note).toMatch(/didn't match the calculated answer/);
  });

  it("has no tool that writes data", async () => {
    const before = await db.inventoryMovement.count();
    replies = ['{"tool":"order_profit","args":{"product":"TEST-PRILL","quantity":"500","price":"120"}}', ""];
    const r = await askInsights("Profit on 500 tons at $120?", user("OWNER"));
    expect(r.result?.facts.join(" ")).toContain("$20,000"); // 500 × (120 − 80)
    expect(await db.inventoryMovement.count()).toBe(before);
  });
});
