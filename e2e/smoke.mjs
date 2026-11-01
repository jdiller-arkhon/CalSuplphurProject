// End-to-end smoke test against a running server (dev database only).
// Usage: BASE_URL=http://localhost:3001 OWNER_EMAIL=... OWNER_PASSWORD=... node e2e/smoke.mjs
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const EMAIL = process.env.OWNER_EMAIL, PASSWORD = process.env.OWNER_PASSWORD;
const failures = [];
const ok = (cond, msg) => { if (!cond) failures.push(msg); console.log(`${cond ? "✓" : "✗"} ${msg}`); };

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

// Unauthenticated access is blocked
const anon = await (await b.newContext()).request.get(`${BASE}/api/export/xlsx?report=inventory`, { maxRedirects: 0 });
ok([302, 303, 307, 401].includes(anon.status()), `anonymous export blocked (${anon.status()})`);
const anonApi = await (await b.newContext()).request.get(`${BASE}/api/search?q=sa`);
ok(anonApi.status() === 401, `anonymous search API blocked (${anonApi.status()})`);

await page.goto(`${BASE}/login`);
await page.fill("input[name=email]", EMAIL);
await page.fill("input[name=password]", PASSWORD);
await page.click("button[type=submit]");
await page.waitForURL(`${BASE}/`, { waitUntil: "commit", timeout: 60000 });

// Every sidebar link and key page renders without a 404 or crash
const links = await page.$$eval("aside a[href^='/']", (as) => [...new Set(as.map((a) => a.getAttribute("href")))]);
const extra = ["/setup", "/notifications", "/settings/users", "/settings/roles", "/settings/security", "/settings/import", "/settings/audit", "/inventory?view=intel", "/inventory?view=ledger", "/inventory?view=reservations", "/inventory/locations", "/operations?tab=production", "/operations?tab=trucks", "/analytics?tab=products", "/analytics?tab=customers", "/analytics?tab=orders", "/analytics?tab=inventory", "/analytics?tab=operations", "/sales?tab=orders", "/sales/quotes/new", "/sales/orders/new", "/purchasing/new", "/logistics/new", "/products/new", "/customers/new", "/suppliers/new"];
for (const href of [...links, ...extra]) {
  const res = await page.goto(BASE + href, { waitUntil: "domcontentloaded" });
  const text = await page.locator("main").innerText().catch(() => "");
  ok(res.status() === 200 && !/This page could not be found|Application error|Something went wrong/.test(text), `page ${href} (${res.status()})`);
}
// Detail pages reached through list links
for (const [list, sel] of [["/products", "table a[href^='/products/']"], ["/customers", "table a[href^='/customers/']"], ["/sales", "table a[href^='/sales/quotes/']"], ["/sales?tab=orders", "table a[href^='/sales/orders/']"], ["/purchasing", "table a[href^='/purchasing/']"], ["/logistics", "table a[href^='/logistics/']"], ["/suppliers", "table a[href^='/suppliers/']"]]) {
  await page.goto(BASE + list);
  const href = await page.locator(sel).first().getAttribute("href").catch(() => null);
  if (!href) { console.log(`- no records under ${list}`); continue; }
  const res = await page.goto(BASE + href);
  ok(res.status() === 200, `detail ${href}`);
}

// Global search API
const s = await page.request.get(`${BASE}/api/search?q=sample`);
ok(s.ok() && (await s.json()).results.length > 0, "search returns results");

// Exports
for (const r of ["inventory", "valuation", "catalog", "pricing", "sales", "purchasing", "shipments", "financial"]) {
  const res = await page.request.get(`${BASE}/api/export/xlsx?report=${r}&range=ytd`);
  const body = await res.body();
  ok(res.ok() && body.subarray(0, 2).toString() === "PK", `excel ${r} (${body.length} bytes)`);
}
for (const t of ["executive", "financial", "inventory", "sales", "operations"]) {
  const res = await page.request.get(`${BASE}/api/export/pptx?template=${t}&range=ytd`);
  const body = await res.body();
  ok(res.ok() && body.subarray(0, 2).toString() === "PK", `powerpoint ${t} (${body.length} bytes)`);
}
await page.goto(`${BASE}/sales`);
const qhref = await page.locator("table a[href^='/sales/quotes/']").first().getAttribute("href");
const pdf = await page.request.get(`${BASE}/api/quotes/${qhref.split("/").pop()}/pdf`);
ok(pdf.ok() && (await pdf.body()).subarray(0, 5).toString() === "%PDF-", "quote PDF");
const tmpl = await page.request.get(`${BASE}/api/import-template/products`);
ok(tmpl.ok(), "import template download");

// Scale ticket through the real form (no posting, so stock is unchanged)
await page.goto(`${BASE}/operations`);
await page.getByRole("button", { name: "Ticket in" }).click();
await page.locator("dialog[open] select[name=productId]").selectOption({ index: 1 });
await page.locator("dialog[open] input[name=grossKg]").fill("40250");
await page.locator("dialog[open] input[name=tareKg]").fill("15100");
await page.locator("dialog[open] button[type=submit]").click();
await page.waitForTimeout(1500);
ok((await page.locator("main").innerText()).includes("25,150"), "scale ticket saved with net 25,150 kg");

ok(errors.length === 0, `no browser errors (${errors.slice(0, 2).join(" | ")})`);
await b.close();
console.log(failures.length ? `\n${failures.length} FAILED` : "\nALL PASSED");
process.exit(failures.length ? 1 : 0);
