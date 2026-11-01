/**
 * CSC Insights — a read-only assistant backed by a LOCALLY hosted model (OpenAI-compatible API:
 * llama.cpp server, Ollama, LM Studio). Company data is only sent to LOCAL_LLM_URL.
 *
 * Guarantees:
 *  - The model never computes figures. It only picks a tool; tools call the same metrics/pricing
 *    code as the rest of the app, with the user's permissions applied.
 *  - Every number in the model's wording must appear in the tool's facts; otherwise the answer is
 *    replaced by the plain facts (marked unverified wording was discarded).
 *  - No tool writes anything.
 */
import { dec, fmtMoney, fmtPct, fmtQty } from "@/lib/decimal";
import { calculatePrice, PricingError } from "@/lib/pricing";
import { db } from "../db";
import type { CurrentUser } from "../auth";
import type { Permission } from "../permissions";
import { financials, inventorySnapshot, parsePeriod, previousPeriod, gp, margin } from "./metrics";
import { getSettingTyped } from "./settings";

/** `headline` is the computed direct answer; the model's wording must contain its figures. */
export type ToolResult = { title: string; headline?: string; facts: string[]; table?: { head: string[]; rows: string[][] }; source: string; assumptions?: string[] };
type Args = Record<string, string | number | undefined>;
type Tool = { name: string; description: string; args: string; perm: Permission; run: (a: Args, u: CurrentUser) => Promise<ToolResult> };

const range = (a: Args) => (typeof a.period === "string" && ["30d", "90d", "mtd", "qtd", "ytd", "12m", "lm"].includes(a.period) ? a.period : "ytd");

/** Match a product from loose text: "Name (SKU)", a SKU, a name, or a few words like "prill". */
async function findProduct(name?: string | number) {
  if (!name) return null;
  const raw = String(name).trim();
  const sku = raw.match(/\(([^)]+)\)\s*$/)?.[1]?.trim();
  const q = raw.replace(/\([^)]*\)\s*$/, "").replace(/\[sample\]/i, "").trim();
  const exact = await db.product.findFirst({ where: { active: true, OR: [...(sku ? [{ sku: { equals: sku, mode: "insensitive" as const } }] : []), { sku: { equals: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } });
  if (exact) return exact;
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 2 && !["the", "and", "of", "sulphur", "sulfur"].includes(w));
  if (!words.length) return null;
  const all = await db.product.findMany({ where: { active: true } });
  return all.find((p) => words.every((w) => p.name.toLowerCase().includes(w) || p.sku.toLowerCase().includes(w))) ?? all.find((p) => words.some((w) => p.name.toLowerCase().includes(w))) ?? null;
}

export const TOOLS: Tool[] = [
  {
    name: "inventory_summary",
    description: "Current inventory: on hand, reserved/committed, available, by product and location.",
    args: "{}",
    perm: "inventory.view",
    run: async (_a, u) => {
      const s = await inventorySnapshot();
      const val = u.permissions.has("inventory.value");
      return {
        title: "Current inventory",
        headline: `Available inventory is ${fmtQty(s.totals.available)} ${s.unit} (${fmtQty(s.totals.onHand)} on hand, ${fmtQty(s.totals.reserved)} committed).`,
        facts: [`On hand: ${fmtQty(s.totals.onHand)} ${s.unit}`, `Committed to orders: ${fmtQty(s.totals.reserved)} ${s.unit}`, `Available: ${fmtQty(s.totals.available)} ${s.unit}`, ...(val ? [`Inventory value: ${fmtMoney(s.totals.value, "USD", 0)}`] : []), ...s.reorder.map((r) => `${r.name} is below its reorder point (${fmtQty(r.available)} available vs ${fmtQty(r.reorderPoint!)})`)],
        table: { head: ["Product", "On hand", "Committed", "Available", ...(val ? ["Value"] : [])], rows: s.products.map((p) => [p.name, fmtQty(p.onHand), fmtQty(p.reserved), fmtQty(p.available), ...(val ? [fmtMoney(p.value, "USD", 0)] : [])]) },
        source: `${s.lots.length} inventory lots`,
      };
    },
  },
  {
    name: "committed_inventory",
    description: "Inventory reserved for open sales orders, by order.",
    args: "{}",
    perm: "inventory.view",
    run: async () => {
      const res = await db.inventoryReservation.findMany({ where: { status: "ACTIVE" }, include: { lot: { include: { product: true } }, salesOrderLine: { include: { order: { include: { customer: true } } } } } });
      const total = res.reduce((t, r) => t.plus(dec(r.quantity).minus(dec(r.consumed))), dec(0));
      return {
        title: "Inventory committed to orders",
        headline: `${fmtQty(total)} is committed to open orders across ${res.length} reservation(s).`,
        facts: [`Total committed: ${fmtQty(total)}`, `${res.length} active reservation(s)`],
        table: { head: ["Order", "Customer", "Product", "Committed"], rows: res.map((r) => [r.salesOrderLine?.order.number ?? "Manual hold", r.salesOrderLine?.order.customer.name ?? r.note ?? "—", r.lot.product.name, fmtQty(dec(r.quantity).minus(dec(r.consumed)))]) },
        source: "Active inventory reservations",
      };
    },
  },
  {
    name: "product_margins",
    description: "Revenue, gross profit and gross margin by product for a period, highest margin first.",
    args: '{"period": "30d|90d|mtd|qtd|ytd|12m|lm"}',
    perm: "finance.view",
    run: async (a) => {
      const p = parsePeriod({ range: range(a) });
      const f = await financials(p);
      const rows = [...f.byProduct].sort((x, y) => (margin(y)?.toNumber() ?? -9) - (margin(x)?.toNumber() ?? -9));
      return {
        title: `Margins by product · ${p.label}`,
        headline: rows.length ? `${rows[0].label} has the highest gross margin at ${fmtPct(margin(rows[0]))}.` : undefined,
        facts: rows.length ? rows.map((x) => `${x.label}: gross margin ${fmtPct(margin(x))}, gross profit ${fmtMoney(gp(x), "USD", 0)} on revenue ${fmtMoney(x.revenue, "USD", 0)}`) : [`No dispatched sales in ${p.label}`],
        table: { head: ["Product", "Revenue", "Gross profit", "Margin"], rows: rows.map((x) => [x.label, fmtMoney(x.revenue, "USD", 0), fmtMoney(gp(x), "USD", 0), fmtPct(margin(x))]) },
        source: `${f.facts.length} dispatched shipment lines`,
        assumptions: ["Gross profit = revenue − cost of goods − direct freight. Not net profit."],
      };
    },
  },
  {
    name: "top_customers",
    description: "Customers ranked by quantity purchased (shipped), with revenue and profit, for a period.",
    args: '{"period": "30d|90d|mtd|qtd|ytd|12m|lm"}',
    perm: "finance.view",
    run: async (a) => {
      const p = parsePeriod({ range: range(a) });
      const f = await financials(p);
      const rows = [...f.byCustomer].sort((x, y) => y.quantity.cmp(x.quantity));
      return {
        title: `Customers by quantity · ${p.label}`,
        headline: rows.length ? `${rows[0].label} bought the most: ${fmtQty(rows[0].quantity)} shipped.` : undefined,
        facts: rows.length ? rows.slice(0, 5).map((x, i) => `${i + 1}. ${x.label}: ${fmtQty(x.quantity)} shipped, revenue ${fmtMoney(x.revenue, "USD", 0)}, gross profit ${fmtMoney(gp(x), "USD", 0)}`) : [`No dispatched sales in ${p.label}`],
        table: { head: ["Customer", "Quantity", "Revenue", "Gross profit"], rows: rows.map((x) => [x.label, fmtQty(x.quantity), fmtMoney(x.revenue, "USD", 0), fmtMoney(gp(x), "USD", 0)]) },
        source: `${f.facts.length} dispatched shipment lines`,
      };
    },
  },
  {
    name: "revenue_change",
    description: "Revenue, gross profit and margin for a period compared with the previous period of equal length (e.g. this month vs last month).",
    args: '{"period": "30d|90d|mtd|qtd|ytd|12m|lm"}',
    perm: "finance.view",
    run: async (a) => {
      const p = parsePeriod({ range: range(a) === "ytd" ? "mtd" : range(a) });
      const [c, pr] = await Promise.all([financials(p), financials(previousPeriod(p))]);
      const ch = pr.totals.revenue.isZero() ? null : c.totals.revenue.minus(pr.totals.revenue).div(pr.totals.revenue);
      return {
        title: `Revenue · ${p.label} vs prior period`,
        headline: `Revenue is ${fmtMoney(c.totals.revenue, "USD", 0)} this period vs ${fmtMoney(pr.totals.revenue, "USD", 0)} in the prior period.`,
        facts: [`Revenue this period: ${fmtMoney(c.totals.revenue, "USD", 0)}`, `Revenue prior period: ${fmtMoney(pr.totals.revenue, "USD", 0)}`, ch ? `Change: ${fmtPct(ch)}` : "Change: not available (no prior-period revenue)", `Gross margin this period: ${fmtPct(margin(c.totals))}`, `Gross margin prior period: ${fmtPct(margin(pr.totals))}`],
        source: `${c.facts.length} vs ${pr.facts.length} dispatched shipment lines`,
        assumptions: ["This shows what changed, not why."],
      };
    },
  },
  {
    name: "price_for_margin",
    description: "Selling price needed to reach a target gross margin, from a product's current cost or a given cost per unit.",
    args: '{"product": "name or SKU (optional)", "cost": "cost per unit (optional)", "margin": "target margin percent, e.g. 30"}',
    perm: "pricing.use",
    run: async (a) => {
      const prod = await findProduct(a.product);
      let cost = a.cost !== undefined && a.cost !== "" ? String(a.cost).replace(/[$,]/g, "") : undefined;
      let costSource = "cost you provided";
      if (!cost && prod) {
        const avg = await db.$queryRaw<{ avg: string | null }[]>`SELECT (SUM("onHand"*"unitCost")/NULLIF(SUM("onHand"),0))::text AS avg FROM "InventoryLot" WHERE "productId" = ${prod.id} AND "onHand" > 0`;
        cost = avg[0]?.avg ?? prod.defaultCost?.toString();
        costSource = avg[0]?.avg ? `weighted average cost of ${prod.name} in stock` : `default cost of ${prod.name}`;
      }
      const m = Number(String(a.margin ?? "").replace("%", ""));
      if (!cost || !/^\d+(\.\d+)?$/.test(cost)) return { title: "Price for target margin", facts: ["Unavailable: no cost found. Name a product with stock or a default cost, or give a cost per unit."], source: "—" };
      if (!(m >= 0 && m < 100)) return { title: "Price for target margin", facts: ["Unavailable: give a target margin between 0 and 99 percent."], source: "—" };
      try {
        const r = calculatePrice({ quantity: "1", shipments: 1, method: "MARGIN", target: (m / 100).toString(), components: [{ category: "ACQUISITION", label: "Cost", basis: "PER_UNIT", amount: cost }] });
        const unit = prod?.unitCode ?? "unit";
        return {
          title: `Price for a ${m}% gross margin`,
          headline: `Charge ${fmtMoney(r.recommendedPrice)} per ${unit} for a ${m}% gross margin.`,
          facts: [`Cost: ${fmtMoney(cost)} per ${unit} (${costSource})`, `Required selling price: ${fmtMoney(r.recommendedPrice)} per ${unit}`, `Gross profit: ${fmtMoney(r.grossProfitPerUnit)} per ${unit}`],
          source: "Pricing engine (price = cost ÷ (1 − margin))",
          assumptions: ["Product cost only — add freight and other costs in Pricing Studio for a full landed price."],
        };
      } catch (e) {
        return { title: "Price for target margin", facts: [`Unavailable: ${e instanceof PricingError ? e.message : "calculation failed"}`], source: "—" };
      }
    },
  },
  {
    name: "order_profit",
    description: "Estimated profit on a hypothetical order of a quantity of a product at a price (defaults to the standard price).",
    args: '{"product": "name or SKU", "quantity": "number", "price": "price per unit (optional)"}',
    perm: "pricing.use",
    run: async (a) => {
      const prod = await findProduct(a.product);
      const q = String(a.quantity ?? "").replace(/,/g, "");
      if (!prod) return { title: "Order profit", facts: ["Unavailable: name a product (by name or SKU)."], source: "—" };
      if (!/^\d+(\.\d+)?$/.test(q) || Number(q) <= 0) return { title: "Order profit", facts: ["Unavailable: give an order quantity."], source: "—" };
      const avg = await db.$queryRaw<{ avg: string | null }[]>`SELECT (SUM("onHand"*"unitCost")/NULLIF(SUM("onHand"),0))::text AS avg FROM "InventoryLot" WHERE "productId" = ${prod.id} AND "onHand" > 0`;
      const cost = avg[0]?.avg ?? prod.defaultCost?.toString();
      const price = a.price ? String(a.price).replace(/[$,]/g, "") : prod.standardPrice?.toString();
      if (!cost) return { title: "Order profit", facts: [`Unavailable: ${prod.name} has no stock cost or default cost.`], source: "—" };
      if (!price || !/^\d+(\.\d+)?$/.test(price)) return { title: "Order profit", facts: [`Unavailable: give a price, or set a standard price for ${prod.name}.`], source: "—" };
      const rev = dec(q).times(dec(price)), c = dec(q).times(dec(cost));
      return {
        title: `${fmtQty(q)} ${prod.unitCode} of ${prod.name}`,
        headline: `Estimated gross profit before freight is ${fmtMoney(rev.minus(c), "USD", 0)}.`,
        facts: [`Price: ${fmtMoney(price)} per ${prod.unitCode}${a.price ? "" : " (standard price)"}`, `Cost: ${fmtMoney(cost)} per ${prod.unitCode} (${avg[0]?.avg ? "weighted average in stock" : "default cost"})`, `Revenue: ${fmtMoney(rev, "USD", 0)}`, `Estimated gross profit before freight: ${fmtMoney(rev.minus(c), "USD", 0)}`, `Gross margin: ${fmtPct(rev.isZero() ? null : rev.minus(c).div(rev))}`],
        source: "Pricing engine and inventory cost",
        assumptions: ["Freight and other delivery costs are not included — use Pricing Studio for a landed price."],
      };
    },
  },
  {
    name: "shipment_costs",
    description: "Freight cost per unit for dispatched shipments, most expensive per ton first.",
    args: '{"period": "30d|90d|mtd|qtd|ytd|12m|lm"}',
    perm: "logistics.manage",
    run: async (a) => {
      const p = parsePeriod({ range: range(a) });
      const ships = await db.shipment.findMany({ where: { shippedAt: { gte: p.from, lte: p.to }, status: { not: "CANCELLED" } }, include: { lines: true, freightCosts: true } });
      const rows = ships
        .map((s) => { const q = s.lines.reduce((t, l) => t.plus(dec(l.quantity)), dec(0)); const f = s.freightCosts.reduce((t, x) => t.plus(dec(x.amount)), dec(0)); return { s, q, f, per: q.isZero() ? null : f.div(q) }; })
        .filter((r) => r.per)
        .sort((x, y) => y.per!.cmp(x.per!));
      return {
        title: `Freight per unit · ${p.label}`,
        headline: rows.length ? (() => { const top = rows.filter((x) => x.per!.eq(rows[0].per!)); return `Most expensive per unit: ${top.map((x) => `${x.s.number} (${x.s.mode.toLowerCase()})`).join(" and ")} at ${fmtMoney(rows[0].per!)} per unit.`; })() : undefined,
        facts: rows.length ? rows.slice(0, 5).map((r) => `${r.s.number} (${r.s.mode.toLowerCase()}): ${fmtMoney(r.per!)} per unit on ${fmtQty(r.q)} (freight ${fmtMoney(r.f, "USD", 0)})`) : [`No dispatched shipments with freight in ${p.label}`],
        table: { head: ["Shipment", "Mode", "Quantity", "Freight", "Per unit"], rows: rows.map((r) => [r.s.number, r.s.mode, fmtQty(r.q), fmtMoney(r.f, "USD", 0), fmtMoney(r.per!)]) },
        source: `${ships.length} dispatched shipments`,
      };
    },
  },
];

// ── Local model client ──
const llmUrl = () => (process.env.LOCAL_LLM_URL ?? "").replace(/\/$/, "");
export async function assistantStatus() {
  const enabled = ((await getSettingTyped("ai.enabled")) as boolean) === true;
  if (!llmUrl()) return { ready: false, enabled, reason: "No local model is configured (set LOCAL_LLM_URL)." };
  try {
    const r = await fetch(`${llmUrl()}/v1/models`, { signal: AbortSignal.timeout(3000) });
    const j = r.ok ? ((await r.json()) as { data?: { id: string }[] }) : null;
    return { ready: r.ok, enabled, model: j?.data?.[0]?.id, reason: r.ok ? undefined : `Model server responded ${r.status}.` };
  } catch {
    return { ready: false, enabled, reason: "The local model server is not reachable." };
  }
}

async function chat(messages: { role: string; content: string }[], json = false, maxTokens = 300): Promise<string> {
  const r = await fetch(`${llmUrl()}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: process.env.LOCAL_LLM_MODEL ?? "local", messages, temperature: 0, max_tokens: maxTokens, ...(json ? { response_format: { type: "json_object" } } : {}) }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!r.ok) throw new Error(`model server ${r.status}`);
  const j = (await r.json()) as { choices: { message: { content: string } }[] };
  return j.choices[0]?.message?.content ?? "";
}

/** Keyword fallback when the model's tool choice can't be parsed. */
function fallbackRoute(q: string): { tool: string; args: Args } | null {
  const s = q.toLowerCase();
  const pct = s.match(/(\d+(?:\.\d+)?)\s*%/)?.[1];
  const num = s.match(/(\d[\d,]*(?:\.\d+)?)\s*(?:-?\s*(?:metric\s*)?(?:tons?|mt|t)\b)/)?.[1];
  const period = /last month/.test(s) ? "lm" : /quarter/.test(s) ? "qtd" : /this month|month/.test(s) ? "mtd" : undefined;
  if (/committ|reserv|promised/.test(s)) return { tool: "committed_inventory", args: {} };
  if (pct && /price|charge/.test(s)) return { tool: "price_for_margin", args: { margin: pct } };
  if (num && /profit|make/.test(s)) return { tool: "order_profit", args: { quantity: num } };
  if (/freight|shipping cost|expensive|per ton/.test(s)) return { tool: "shipment_costs", args: { period } };
  if (/customer/.test(s)) return { tool: "top_customers", args: { period } };
  if (/margin|profitab/.test(s)) return { tool: "product_margins", args: { period } };
  if (/revenue|sales|changed|compare/.test(s)) return { tool: "revenue_change", args: { period: period ?? "mtd" } };
  if (/inventory|stock|on hand|available/.test(s)) return { tool: "inventory_summary", args: {} };
  return null;
}

const numbersIn = (s: string) => (s.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, "").replace(/\.0+$/, "")).filter((n) => n.length > 0);

export type InsightAnswer = { answer: string; verified: boolean; tool?: string; result?: ToolResult; note?: string };

export async function askInsights(question: string, user: CurrentUser): Promise<InsightAnswer> {
  const q = question.trim().slice(0, 500);
  const allowed = TOOLS.filter((t) => user.permissions.has(t.perm));
  if (!allowed.length) return { answer: "Your role doesn't include any data the assistant can read.", verified: true };
  const products = (await db.product.findMany({ where: { active: true }, select: { name: true, sku: true }, take: 50 })).map((p) => `${p.name} (${p.sku})`).join("; ");

  // 1) Tool choice
  let choice: { tool: string; args: Args } | null = null;
  try {
    const raw = await chat([
      { role: "system", content: `You route questions about a sulphur company's business data to ONE tool. Reply with JSON only: {"tool": "<name>", "args": {...}} or {"tool": "none"} if no tool fits.\nTools:\n${allowed.map((t) => `- ${t.name}: ${t.description} args ${t.args}`).join("\n")}\nKnown products: ${products || "none"}.\nPeriods: mtd=this month, lm=last month, qtd=this quarter, ytd=this year, 30d, 90d, 12m. Only include "period" if the question mentions a time; otherwise leave it out. For products, give just the product name.` },
      { role: "user", content: q },
    ], true, 120);
    const j = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    if (typeof j.tool === "string") choice = { tool: j.tool, args: (j.args ?? {}) as Args };
  } catch {
    /* fall through to keyword routing */
  }
  if (!choice || !allowed.some((t) => t.name === choice!.tool)) choice = fallbackRoute(q);
  const tool = allowed.find((t) => t.name === choice?.tool);
  if (!tool) return { answer: "I can answer questions about inventory, committed stock, margins by product, top customers, revenue changes, pricing for a target margin, profit on an order, and freight costs. That question isn't covered, or your role doesn't include that data.", verified: true };

  // 2) Run the tool (real figures, permission-scoped)
  const result = await tool.run(choice!.args, user);
  const factText = [result.title, ...(result.headline ? [`DIRECT ANSWER: ${result.headline}`] : []), ...result.facts, ...(result.table ? result.table.rows.map((r) => r.join(" | ")) : [])].join("\n");

  // 3) Word the answer, then verify every number against the facts
  let answer = "";
  try {
    answer = (await chat([
      { role: "system", content: "Answer the question in 1–3 plain sentences using ONLY the facts given. Start with the DIRECT ANSWER if one is given. Copy numbers exactly as written. If the facts say something is unavailable, say so. Never add numbers, causes or advice that are not in the facts." },
      { role: "user", content: `Question: ${q}\n\nFacts:\n${factText}` },
    ], false, 220)).trim();
  } catch {
    answer = "";
  }
  const known = new Set(numbersIn(factText));
  const bad = numbersIn(answer).filter((n) => !known.has(n) && !(Number(n) <= 3 && /^\d$/.test(n)));
  const said = new Set(numbersIn(answer));
  // The key figures are those outside brackets (brackets hold supporting detail).
  const missed = result.headline ? numbersIn(result.headline.replace(/\([^)]*\)/g, "")).filter((n) => !said.has(n)) : [];
  if (!answer || bad.length || missed.length) {
    const plain = result.headline ?? result.facts.join(". ") + ".";
    const note = !answer ? "The model didn't respond; showing the calculated answer directly." : bad.length ? "The model's wording contained figures not found in the data, so the calculated answer is shown instead." : "The model's wording didn't match the calculated answer, so the calculated answer is shown instead.";
    return { answer: plain, verified: true, tool: tool.name, result, note };
  }
  return { answer, verified: true, tool: tool.name, result };
}
