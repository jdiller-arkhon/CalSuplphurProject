// Verifies server-side permission enforcement for a Viewer account created through the real invite flow.
// Usage: BASE_URL=... OWNER_EMAIL=... OWNER_PASSWORD=... node e2e/permissions.mjs   (dev database only)
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const failures = [];
const ok = (c, m) => { if (!c) failures.push(m); console.log(`${c ? "✓" : "✗"} ${m}`); };
const b = await chromium.launch();

// Owner creates an invitation
const owner = await (await b.newContext()).newPage();
await owner.goto(`${BASE}/login`);
await owner.fill("input[name=email]", process.env.OWNER_EMAIL);
await owner.fill("input[name=password]", process.env.OWNER_PASSWORD);
await owner.click("button[type=submit]");
await owner.waitForURL(`${BASE}/`, { waitUntil: "commit" });
await owner.goto(`${BASE}/settings/users`);
const email = `viewer.${Date.now()}@example.test`;
await owner.getByRole("button", { name: "Invite user" }).click();
await owner.locator("dialog[open] input[name=email]").fill(email);
await owner.locator("dialog[open] select[name=role]").selectOption("VIEWER");
await owner.locator("dialog[open] button[type=submit]").click();
const link = await owner.locator("dialog[open] input[aria-label='Invitation link']").inputValue({ timeout: 15000 });
ok(link.includes("/invite/"), "owner received a one-time invitation link");

// Viewer accepts
const v = await (await b.newContext()).newPage();
await v.goto(link);
await v.fill("input[name=name]", "Test Viewer");
await v.fill("input[name=password]", "viewer-pass-12345!");
await v.click("button[type=submit]");
await v.waitForURL(`${BASE}/`, { waitUntil: "commit", timeout: 30000 });
ok(true, "viewer account created via invitation");

// Link is single-use
const again = await (await b.newContext()).newPage();
await again.goto(link);
ok((await again.locator("body").innerText()).includes("Invitation unavailable"), "invitation link cannot be reused");

// Pages outside the Viewer role redirect to /forbidden
for (const p of ["/pricing", "/sales", "/analytics", "/purchasing", "/settings/users", "/settings/audit", "/reports"]) {
  await v.goto(BASE + p);
  ok(v.url().includes("/forbidden"), `viewer blocked from ${p}`);
}
// Allowed pages work, but financial values are hidden
await v.goto(`${BASE}/inventory`);
ok(!v.url().includes("/forbidden"), "viewer can open inventory");
ok(!(await v.locator("main").innerText()).includes("Valuation"), "viewer does not see inventory valuation");
const nav = await v.$$eval("aside a", (as) => as.map((a) => a.textContent.trim()));
ok(!nav.includes("Pricing Studio") && !nav.includes("Analytics"), "restricted sections are hidden from the viewer's sidebar");

// APIs enforce permissions server-side
for (const url of ["/api/export/xlsx?report=sales", "/api/export/xlsx?report=valuation", "/api/export/pptx?template=executive"]) {
  const r = await v.request.get(BASE + url);
  ok(r.status() === 403, `viewer gets 403 from ${url} (${r.status()})`);
}
const s = await (await v.request.get(`${BASE}/api/search?q=sample`)).json();
ok(!s.results.some((x) => ["Quote", "Order", "PO", "Supplier"].includes(x.type)), "search hides records the viewer can't access");

// Owner deactivates the viewer → session ends immediately
await owner.goto(`${BASE}/settings/users`);
owner.on("dialog", (d) => d.accept());
const row = owner.locator("tr", { hasText: email });
await row.hover();
await row.getByRole("button", { name: "Deactivate" }).click();
await owner.waitForTimeout(1500);
await v.goto(`${BASE}/inventory`);
ok(v.url().includes("/login"), "deactivated viewer is signed out");

await b.close();
console.log(failures.length ? `\n${failures.length} FAILED` : "\nALL PASSED");
process.exit(failures.length ? 1 : 0);
