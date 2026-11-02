/** Sections of the app that a company can switch on or off. Inventory is always on. */
export const MODULES = {
  inventory: { label: "Inventory & products", description: "Stock by lot and location, the movement ledger, products and locations.", paths: ["/inventory", "/products"], core: true, requires: [] },
  pricing: { label: "Pricing & market rates", description: "Pricing Studio and the market-rate guide.", paths: ["/pricing", "/market"], requires: [] },
  invoicing: { label: "Invoicing", description: "Invoices, payments received and what customers owe.", paths: ["/invoices"], requires: ["customers"] },
  customers: { label: "Customers", description: "Customer records, contacts, terms and agreed prices.", paths: ["/customers"], requires: [] },
  sales: { label: "Quotes & sales orders", description: "Quotes with approval, sales orders and stock allocation.", paths: ["/sales"], requires: ["customers"] },
  logistics: { label: "Shipping", description: "Truck, container and vessel shipments with freight cost.", paths: ["/logistics"], requires: [] },
  purchasing: { label: "Purchasing", description: "Purchase orders and receiving.", paths: ["/purchasing"], requires: ["suppliers"] },
  suppliers: { label: "Suppliers", description: "Supplier records and cost history.", paths: ["/suppliers"], requires: [] },
  operations: { label: "Plant operations", description: "Scale tickets, production runs, trucks and yard mode.", paths: ["/operations", "/yard"], requires: [] },
  tracking: { label: "Tracking", description: "Your own measures in any unit.", paths: ["/tracking"], requires: [] },
  analytics: { label: "Analytics", description: "Revenue, profit and inventory analysis.", paths: ["/analytics"], requires: [] },
  reports: { label: "Reports", description: "PowerPoint and Excel reports.", paths: ["/reports"], requires: [] },
  documents: { label: "Documents", description: "SDS, COA, specs and shipping papers.", paths: ["/documents"], requires: [] },
} as const satisfies Record<string, { label: string; description: string; paths: readonly string[]; core?: boolean; requires: readonly string[] }>;

export type ModuleKey = keyof typeof MODULES;
export const MODULE_KEYS = Object.keys(MODULES) as ModuleKey[];
export const SIMPLE_PRESET: ModuleKey[] = ["inventory", "pricing", "invoicing", "customers"];

/** Normalises a stored list: unknown keys dropped, core and required modules added. null means all on. */
export function normaliseModules(raw: unknown): ModuleKey[] {
  if (!Array.isArray(raw)) return [...MODULE_KEYS];
  const on = new Set<ModuleKey>(raw.filter((k): k is ModuleKey => MODULE_KEYS.includes(k as ModuleKey)));
  on.add("inventory");
  let changed = true;
  while (changed) { changed = false; for (const k of [...on]) for (const r of MODULES[k].requires as readonly ModuleKey[]) if (!on.has(r)) { on.add(r); changed = true; } }
  return MODULE_KEYS.filter((k) => on.has(k));
}

/** Which module owns a path (null for always-available pages like Overview and Settings). */
export function moduleForPath(path: string): ModuleKey | null {
  for (const k of MODULE_KEYS) if ((MODULES[k].paths as readonly string[]).some((p) => path === p || path.startsWith(p + "/"))) return k;
  return null;
}
