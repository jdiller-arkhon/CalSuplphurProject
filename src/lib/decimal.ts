import Decimal from "decimal.js";

// One shared configuration: 40 significant digits, banker's rounding is NOT used —
// commercial documents conventionally round half away from zero.
export const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type Dec = InstanceType<typeof D>;
export type DecInput = Dec | string | number | { toString(): string } | null | undefined;

export function dec(v: DecInput): Dec {
  if (v === null || v === undefined || v === "") return new D(0);
  if (v instanceof D) return v;
  return new D(typeof v === "number" || typeof v === "string" ? v : v.toString());
}

/** Rounding policy — money to cents for presentation/persistence of document totals. */
export const MONEY_DP = 2;
/** Unit prices and unit costs are carried to 4dp (stored Decimal(18,4)). */
export const UNIT_DP = 4;
/** Quantities are carried to 6dp in the product's base unit. */
export const QTY_DP = 6;

export const money = (v: DecInput) => dec(v).toDecimalPlaces(MONEY_DP, D.ROUND_HALF_UP);
export const unitAmt = (v: DecInput) => dec(v).toDecimalPlaces(UNIT_DP, D.ROUND_HALF_UP);
export const qty = (v: DecInput) => dec(v).toDecimalPlaces(QTY_DP, D.ROUND_HALF_UP);

export function sum(values: DecInput[]): Dec {
  return values.reduce<Dec>((acc, v) => acc.plus(dec(v)), new D(0));
}

/** Safe ratio: returns null instead of dividing by zero. */
export function ratio(n: DecInput, d: DecInput): Dec | null {
  const den = dec(d);
  if (den.isZero()) return null;
  return dec(n).div(den);
}

export function fmtMoney(v: DecInput, currency = "USD", dp = 2): string {
  const n = dec(v).toDecimalPlaces(dp).toNumber();
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: dp, maximumFractionDigits: dp }).format(n);
}

export function fmtQty(v: DecInput, dp = 2): string {
  const n = dec(v).toDecimalPlaces(dp).toNumber();
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: dp }).format(n);
}

export function fmtPct(v: DecInput | null, dp = 1): string {
  if (v === null || v === undefined) return "—";
  return `${dec(v).times(100).toDecimalPlaces(dp).toFixed(dp)}%`;
}
