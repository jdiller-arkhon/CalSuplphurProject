import { describe, it, expect } from "vitest";
import { parsePrefs, DEFAULT_PREFS, WIDGET_IDS } from "@/lib/prefs";

describe("user preferences", () => {
  it("defaults when empty or garbage", () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs("x")).toEqual(DEFAULT_PREFS);
    expect(parsePrefs([1, 2])).toEqual(DEFAULT_PREFS);
    expect(DEFAULT_PREFS.theme).toBe("system");
    expect(DEFAULT_PREFS.landing).toBe("/");
  });
  it("falls back per field instead of rejecting the whole object", () => {
    const p = parsePrefs({ accent: "neon", density: "compact", motion: 7, landing: "/evil", textSize: "110" });
    expect(p.accent).toBe("navy");
    expect(p.density).toBe("compact");
    expect(p.motion).toBe("full");
    expect(p.landing).toBe("/");
    expect(p.textSize).toBe("110");
  });
  it("only accepts known pages for start page, pins and hidden items; never hides Overview", () => {
    const p = parsePrefs({ landing: "/analytics", pinned: ["/pricing", "/pricing", "https://x.test"], hiddenNav: ["/", "/documents"] });
    expect(p.landing).toBe("/analytics");
    expect(p.pinned).toEqual([]); // one invalid entry rejects the list
    expect(parsePrefs({ pinned: ["/pricing", "/pricing"] }).pinned).toEqual(["/pricing"]);
    expect(p.hiddenNav).toEqual(["/documents"]);
  });
  it("keeps the overview order complete and de-duplicated", () => {
    const p = parsePrefs({ overview: { order: ["movements", "movements", "financial"], hidden: ["insights"], wide: [] } });
    expect(p.overview.order.slice(0, 2)).toEqual(["movements", "financial"]);
    expect([...p.overview.order].sort()).toEqual([...WIDGET_IDS].sort());
    expect(p.overview.hidden).toEqual(["insights"]);
  });
  it("rejects unknown widget ids", () => {
    const p = parsePrefs({ overview: { order: ["bogus"], hidden: [], wide: [] } });
    expect(p.overview.order).toEqual(WIDGET_IDS);
  });
});
