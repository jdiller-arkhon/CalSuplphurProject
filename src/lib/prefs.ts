import { z } from "zod";
import { NAV } from "@/components/nav";

/** Every page a user can choose as their start page or hide from the sidebar. */
export const NAV_HREFS = NAV.flatMap((g) => g.items.map((i) => i.href));

export const ACCENTS = {
  navy: { label: "Navy", light: "#365d83", lightSoft: "#e8eef5", dark: "#6f9cc7", darkSoft: "#172c44" },
  emerald: { label: "Emerald", light: "#1f7a5c", lightSoft: "#e3f2ec", dark: "#4cc39a", darkSoft: "#10302a" },
  crimson: { label: "Crimson", light: "#a3343f", lightSoft: "#f7e6e8", dark: "#e7727d", darkSoft: "#3a171b" },
  violet: { label: "Violet", light: "#5b4bb5", lightSoft: "#ecebf9", dark: "#9d90f0", darkSoft: "#231d45" },
  teal: { label: "Teal", light: "#16707f", lightSoft: "#e1f1f3", dark: "#4fc0d1", darkSoft: "#0f2e34" },
  graphite: { label: "Graphite", light: "#3f4752", lightSoft: "#eceef1", dark: "#a7b1bf", darkSoft: "#242a32" },
} as const;
export type Accent = keyof typeof ACCENTS;

export const WIDGETS = {
  pipeline: "Pipeline strip",
  financial: "Financial performance",
  insights: "Executive insights",
  stockProduct: "Stock by product",
  stockLocation: "Stock by location",
  profitCustomer: "Profit by customer",
  deliveries: "Upcoming deliveries",
  movements: "Recent inventory movements",
  changes: "Recent changes",
} as const;
export type WidgetId = keyof typeof WIDGETS;
export const WIDGET_IDS = Object.keys(WIDGETS) as WidgetId[];
const DEFAULT_WIDE: WidgetId[] = ["financial"];

const widgetId = z.enum(WIDGET_IDS as [WidgetId, ...WidgetId[]]);
const navHref = z.string().refine((h) => NAV_HREFS.includes(h));

export const PrefsSchema = z.object({
  theme: z.enum(["system", "light", "dark"]).catch("system"),
  accent: z.enum(Object.keys(ACCENTS) as [Accent, ...Accent[]]).catch("navy"),
  density: z.enum(["comfortable", "compact"]).catch("comfortable"),
  motion: z.enum(["full", "subtle", "off"]).catch("full"),
  hero: z.enum(["full", "compact", "minimal"]).catch("full"),
  textSize: z.enum(["90", "100", "110", "120"]).catch("100"),
  landing: navHref.catch("/"),
  sidebar: z.enum(["expanded", "collapsed"]).catch("expanded"),
  hiddenNav: z.array(navHref).catch([]),
  pinned: z.array(navHref).max(6).catch([]),
  shortcuts: z.boolean().catch(true),
  greeting: z.boolean().catch(true),
  overview: z.object({
    order: z.array(widgetId).catch(WIDGET_IDS),
    hidden: z.array(widgetId).catch([]),
    wide: z.array(widgetId).catch(DEFAULT_WIDE),
  }).catch({ order: WIDGET_IDS, hidden: [], wide: DEFAULT_WIDE }),
});
export type Prefs = z.infer<typeof PrefsSchema>;

/** Never throws: unknown or invalid values fall back to defaults field by field. */
export function parsePrefs(raw: unknown): Prefs {
  const base = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const p = PrefsSchema.parse({ ...base, overview: base.overview ?? undefined });
  // Keep the order complete and de-duplicated even if widgets were added since it was saved.
  const seen = new Set<WidgetId>();
  const order = [...p.overview.order, ...WIDGET_IDS].filter((w) => (seen.has(w) ? false : (seen.add(w), true)));
  return { ...p, hiddenNav: [...new Set(p.hiddenNav)].filter((h) => h !== "/"), pinned: [...new Set(p.pinned)], overview: { ...p.overview, order } };
}
export const DEFAULT_PREFS = parsePrefs({});
