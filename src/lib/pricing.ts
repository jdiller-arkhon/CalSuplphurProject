import { D, dec, unitAmt, money, type Dec } from "./decimal";

export type PricingMethod = "MARGIN" | "MARKUP" | "TARGET_PROFIT";
export type CostBasis = "PER_UNIT" | "PER_SHIPMENT" | "PER_ORDER" | "PERCENT_OF_PRICE";

export interface CostComponentInput {
  category: string;
  label: string;
  basis: CostBasis;
  /** PER_UNIT/PER_SHIPMENT/PER_ORDER: currency amount. PERCENT_OF_PRICE: fraction (0.02 = 2%). */
  amount: string | number;
}

export interface PricingInput {
  quantity: string | number; // order quantity in the product unit
  shipments: number; // number of shipments the order is split into (for per-shipment costs)
  method: PricingMethod;
  /** MARGIN/MARKUP: fraction (0.25 = 25%). TARGET_PROFIT: profit per unit in currency. */
  target: string | number;
  components: CostComponentInput[];
  discountPct?: string | number; // fraction applied to the recommended price
  minMarginPct?: string | number | null; // product policy floor (fraction)
}

export interface PricingResult {
  quantity: string;
  fixedUnitCost: string; // landed cost per unit excluding price-dependent costs
  percentOfPriceRate: string; // sum of PERCENT_OF_PRICE fractions (e.g. commissions)
  landedUnitCost: string; // at the recommended price, including price-dependent costs
  breakdown: { category: string; label: string; basis: CostBasis; perUnit: string; total: string }[];
  recommendedPrice: string; // before discount
  netPrice: string; // after discount — the price the profit metrics below describe
  grossProfitPerUnit: string;
  grossMarginPct: string | null;
  markupPct: string | null;
  orderRevenue: string;
  orderCost: string;
  orderProfit: string;
  breakEvenPrice: string;
  minAcceptablePrice: string | null;
  belowMinimumMargin: boolean;
  warnings: string[];
}

export class PricingError extends Error {}

function validate(input: PricingInput) {
  const q = dec(input.quantity);
  if (!q.isFinite() || q.lte(0)) throw new PricingError("Quantity must be greater than zero.");
  if (!Number.isInteger(input.shipments) || input.shipments < 1) throw new PricingError("Shipments must be a whole number of at least 1.");
  const t = dec(input.target);
  if (input.method === "MARGIN") {
    if (t.lt(0)) throw new PricingError("Target margin cannot be negative.");
    if (t.gte(1)) throw new PricingError("Gross margin target must be below 100%.");
  }
  if (input.method === "MARKUP" && t.lt(0)) throw new PricingError("Markup cannot be negative.");
  const disc = dec(input.discountPct ?? 0);
  if (disc.lt(0) || disc.gte(1)) throw new PricingError("Discount must be between 0% and 100%.");
  for (const c of input.components) {
    const a = dec(c.amount);
    if (!a.isFinite()) throw new PricingError(`Invalid amount for ${c.label}.`);
    if (a.lt(0)) throw new PricingError(`Cost "${c.label}" cannot be negative.`);
    if (c.basis === "PERCENT_OF_PRICE" && a.gte(1)) throw new PricingError(`"${c.label}" must be below 100% of price.`);
  }
}

/**
 * Per-unit cost excluding price-dependent costs.
 * PER_SHIPMENT costs × shipments ÷ quantity; PER_ORDER ÷ quantity.
 */
function fixedUnitCost(input: PricingInput) {
  const q = dec(input.quantity);
  const rows = input.components
    .filter((c) => c.basis !== "PERCENT_OF_PRICE")
    .map((c) => {
      const a = dec(c.amount);
      const total = c.basis === "PER_UNIT" ? a.times(q) : c.basis === "PER_SHIPMENT" ? a.times(input.shipments) : a;
      return { c, perUnit: total.div(q), total };
    });
  return { rows, perUnit: rows.reduce<Dec>((s, r) => s.plus(r.perUnit), new D(0)) };
}

/**
 * Solve for the price P given fixed unit cost F and price-dependent rate r (P·r is a cost):
 *   MARGIN:        (P − F − rP)/P = m      →  P = F / (1 − m − r)
 *   MARKUP:        P = (F + rP)(1 + k)     →  P = F(1 + k) / (1 − r(1 + k))
 *   TARGET_PROFIT: P − F − rP = π          →  P = (F + π) / (1 − r)
 * With r = 0 these reduce to the canonical formulas in the specification.
 */
export function solvePrice(method: PricingMethod, F: Dec, r: Dec, target: Dec): Dec {
  if (method === "MARGIN") {
    const den = new D(1).minus(target).minus(r);
    if (den.lte(0)) throw new PricingError("Target margin plus price-based costs must total less than 100%.");
    return F.div(den);
  }
  if (method === "MARKUP") {
    const k1 = new D(1).plus(target);
    const den = new D(1).minus(r.times(k1));
    if (den.lte(0)) throw new PricingError("Markup combined with price-based costs cannot be satisfied.");
    return F.times(k1).div(den);
  }
  const den = new D(1).minus(r);
  if (den.lte(0)) throw new PricingError("Price-based costs must total less than 100%.");
  return F.plus(target).div(den);
}

export function calculatePrice(input: PricingInput): PricingResult {
  validate(input);
  const q = dec(input.quantity);
  const { rows, perUnit: F } = fixedUnitCost(input);
  const pctRows = input.components.filter((c) => c.basis === "PERCENT_OF_PRICE");
  const r = pctRows.reduce<Dec>((s, c) => s.plus(dec(c.amount)), new D(0));
  const warnings: string[] = [];
  if (F.isZero()) warnings.push("No costs entered — price is computed from zero cost.");

  const recommended = unitAmt(solvePrice(input.method, F, r, dec(input.target)));
  const disc = dec(input.discountPct ?? 0);
  const net = unitAmt(recommended.times(new D(1).minus(disc)));

  const landed = F.plus(net.times(r));
  const gpUnit = net.minus(landed);
  const margin = net.isZero() ? null : gpUnit.div(net);
  const markup = landed.isZero() ? null : gpUnit.div(landed);

  const breakEven = unitAmt(solvePrice("TARGET_PROFIT", F, r, new D(0)));
  let minPrice: Dec | null = null;
  let below = false;
  if (input.minMarginPct !== undefined && input.minMarginPct !== null && input.minMarginPct !== "") {
    const mm = dec(input.minMarginPct);
    if (mm.gte(0) && mm.lt(1) && new D(1).minus(mm).minus(r).gt(0)) {
      minPrice = unitAmt(solvePrice("MARGIN", F, r, mm));
      below = margin === null ? true : margin.lt(mm);
      if (below) warnings.push(`Net price is below the minimum acceptable margin of ${mm.times(100).toFixed(1)}%.`);
    }
  }
  if (gpUnit.lt(0)) warnings.push("Net price is below break-even — this sale loses money.");

  const breakdown = [
    ...rows.map((x) => ({ category: x.c.category, label: x.c.label, basis: x.c.basis, perUnit: unitAmt(x.perUnit).toString(), total: money(x.total).toString() })),
    ...pctRows.map((c) => {
      const pu = net.times(dec(c.amount));
      return { category: c.category, label: c.label, basis: c.basis, perUnit: unitAmt(pu).toString(), total: money(pu.times(q)).toString() };
    }),
  ];

  return {
    quantity: q.toString(),
    fixedUnitCost: unitAmt(F).toString(),
    percentOfPriceRate: r.toString(),
    landedUnitCost: unitAmt(landed).toString(),
    breakdown,
    recommendedPrice: recommended.toString(),
    netPrice: net.toString(),
    grossProfitPerUnit: unitAmt(gpUnit).toString(),
    grossMarginPct: margin ? margin.toDecimalPlaces(6).toString() : null,
    markupPct: markup ? markup.toDecimalPlaces(6).toString() : null,
    orderRevenue: money(net.times(q)).toString(),
    orderCost: money(landed.times(q)).toString(),
    orderProfit: money(gpUnit.times(q)).toString(),
    breakEvenPrice: breakEven.toString(),
    minAcceptablePrice: minPrice ? minPrice.toString() : null,
    belowMinimumMargin: below,
    warnings,
  };
}

/** Profit outcomes for a matrix of selling prices × unit-cost deltas. */
export function sensitivityMatrix(input: PricingInput, priceSteps: Dec[], costDeltas: Dec[]) {
  const q = dec(input.quantity);
  const { perUnit: F } = fixedUnitCost(input);
  const r = input.components.filter((c) => c.basis === "PERCENT_OF_PRICE").reduce<Dec>((s, c) => s.plus(dec(c.amount)), new D(0));
  return costDeltas.map((delta) => ({
    costDelta: delta.toString(),
    cells: priceSteps.map((p) => {
      const cost = F.plus(delta).plus(p.times(r));
      const gp = p.minus(cost);
      return {
        price: p.toString(),
        profitPerUnit: unitAmt(gp).toString(),
        orderProfit: money(gp.times(q)).toString(),
        margin: p.isZero() ? null : gp.div(p).toDecimalPlaces(6).toString(),
      };
    }),
  }));
}
