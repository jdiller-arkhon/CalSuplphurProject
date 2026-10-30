import { describe, it, expect } from "vitest";
import { calculatePrice, PricingError, sensitivityMatrix } from "@/lib/pricing";
import { convert, convertRate } from "@/lib/units";
import { dec, fmtMoney, money, ratio } from "@/lib/decimal";

const base = (over: Partial<Parameters<typeof calculatePrice>[0]> = {}) => ({
  quantity: "100",
  shipments: 1,
  method: "MARGIN" as const,
  target: "0.25",
  components: [{ category: "PRODUCT", label: "Acquisition", basis: "PER_UNIT" as const, amount: "75" }],
  ...over,
});

describe("pricing methods", () => {
  it("gross margin: price = cost / (1 - m)", () => {
    const r = calculatePrice(base());
    expect(r.recommendedPrice).toBe("100");
    expect(r.grossMarginPct).toBe("0.25");
    expect(r.markupPct).toBe("0.333333");
    expect(r.orderProfit).toBe("2500");
  });
  it("markup: price = cost × (1 + k)", () => {
    const r = calculatePrice(base({ method: "MARKUP", target: "0.25" }));
    expect(r.recommendedPrice).toBe("93.75");
    expect(r.markupPct).toBe("0.25");
  });
  it("target profit: price = cost + π", () => {
    const r = calculatePrice(base({ method: "TARGET_PROFIT", target: "12.5" }));
    expect(r.recommendedPrice).toBe("87.5");
    expect(r.grossProfitPerUnit).toBe("12.5");
  });
  it("margin and markup are distinct for identical inputs", () => {
    expect(calculatePrice(base()).recommendedPrice).not.toBe(calculatePrice(base({ method: "MARKUP" })).recommendedPrice);
  });
});

describe("cost allocation", () => {
  it("allocates per-shipment and per-order costs over quantity", () => {
    const r = calculatePrice(
      base({
        quantity: "500",
        shipments: 20,
        target: "0",
        components: [
          { category: "PRODUCT", label: "Acq", basis: "PER_UNIT", amount: "80" },
          { category: "FREIGHT", label: "Truck", basis: "PER_SHIPMENT", amount: "450" }, // 9000 / 500 = 18
          { category: "OTHER", label: "Docs", basis: "PER_ORDER", amount: "250" }, // 0.5
        ],
      }),
    );
    expect(r.fixedUnitCost).toBe("98.5");
    expect(r.breakEvenPrice).toBe("98.5");
  });
  it("solves price with commission as % of price", () => {
    const r = calculatePrice(
      base({ components: [{ category: "P", label: "Acq", basis: "PER_UNIT", amount: "70" }, { category: "C", label: "Commission", basis: "PERCENT_OF_PRICE", amount: "0.05" }] }),
    );
    // P = 70 / (1 - .25 - .05) = 100
    expect(r.recommendedPrice).toBe("100");
    expect(r.landedUnitCost).toBe("75");
    expect(r.grossMarginPct).toBe("0.25");
  });
  it("applies discount and recomputes margin on net price", () => {
    const r = calculatePrice(base({ discountPct: "0.1" }));
    expect(r.netPrice).toBe("90");
    expect(r.grossMarginPct).toBe("0.166667");
  });
  it("flags below minimum margin and computes min price", () => {
    const r = calculatePrice(base({ target: "0.1", minMarginPct: "0.15" }));
    expect(r.belowMinimumMargin).toBe(true);
    expect(r.minAcceptablePrice).toBe("88.2353");
  });
  it("warns on loss", () => {
    const r = calculatePrice(base({ method: "TARGET_PROFIT", target: "0", discountPct: "0.05" }));
    expect(r.warnings.join(" ")).toMatch(/break-even/);
  });
});

describe("validation", () => {
  it("rejects margin >= 100%", () => expect(() => calculatePrice(base({ target: "1" }))).toThrow(PricingError));
  it("rejects margin + pct-costs >= 100%", () =>
    expect(() => calculatePrice(base({ target: "0.6", components: [{ category: "c", label: "c", basis: "PERCENT_OF_PRICE", amount: "0.4" }] }))).toThrow(PricingError));
  it("rejects zero quantity (no division by zero)", () => expect(() => calculatePrice(base({ quantity: "0" }))).toThrow(PricingError));
  it("rejects negative costs", () => expect(() => calculatePrice(base({ components: [{ category: "x", label: "x", basis: "PER_UNIT", amount: "-1" }] }))).toThrow(PricingError));
  it("rejects fractional shipments", () => expect(() => calculatePrice(base({ shipments: 1.5 }))).toThrow(PricingError));
  it("handles extremely large quantities precisely", () => {
    const r = calculatePrice(base({ quantity: "9999999999.123456" }));
    expect(r.orderRevenue).toBe("999999999912.35");
  });
  it("zero cost returns zero price with warning", () => {
    const r = calculatePrice(base({ components: [] }));
    expect(r.recommendedPrice).toBe("0");
    expect(r.grossMarginPct).toBeNull();
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

describe("sensitivity", () => {
  it("builds a matrix", () => {
    const m = sensitivityMatrix(base(), [dec(90), dec(100)], [dec(0), dec(5)]);
    expect(m[0].cells[1].orderProfit).toBe("2500");
    expect(m[1].cells[0].profitPerUnit).toBe("10");
  });
});

describe("units & decimal", () => {
  it("converts exactly between MT and ST", () => {
    expect(convert(1, "ST", "KG").toString()).toBe("907.18474");
    expect(convert(2000, "LB", "ST").toString()).toBe("1");
    expect(convert(1, "MT", "LB").toDecimalPlaces(6).toString()).toBe("2204.622622");
  });
  it("converts rates inversely", () => {
    // $100/MT expressed per ST = 100 × 0.90718474
    expect(convertRate(100, "MT", "ST").toString()).toBe("90.718474");
  });
  it("avoids float error", () => {
    expect(dec("0.1").plus("0.2").toString()).toBe("0.3");
    expect(money("2.675").toString()).toBe("2.68");
  });
  it("ratio returns null on zero denominator", () => expect(ratio(1, 0)).toBeNull());
  it("formats currency", () => expect(fmtMoney("1234.5")).toBe("$1,234.50"));
});
