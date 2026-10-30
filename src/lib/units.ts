import { D, dec, type Dec, type DecInput } from "./decimal";

/**
 * Exact mass conversion factors to kilograms.
 * 1 lb is defined as exactly 0.45359237 kg (International yard and pound agreement, 1959).
 * Short ton = 2000 lb, long ton = 2240 lb, metric ton = 1000 kg.
 */
export const STANDARD_UNITS: { code: string; name: string; toKg: string }[] = [
  { code: "MT", name: "Metric ton", toKg: "1000" },
  { code: "KG", name: "Kilogram", toKg: "1" },
  { code: "LB", name: "Pound", toKg: "0.45359237" },
  { code: "ST", name: "Short ton", toKg: "907.18474" },
  { code: "LT", name: "Long ton", toKg: "1016.0469088" },
];

export type UnitTable = Record<string, DecInput>;

export const STANDARD_TABLE: UnitTable = Object.fromEntries(STANDARD_UNITS.map((u) => [u.code, u.toKg]));

export class UnitError extends Error {}

export function convert(quantity: DecInput, from: string, to: string, table: UnitTable = STANDARD_TABLE): Dec {
  if (from === to) return dec(quantity);
  const f = table[from];
  const t = table[to];
  if (f === undefined) throw new UnitError(`Unknown unit: ${from}`);
  if (t === undefined) throw new UnitError(`Unknown unit: ${to}`);
  const tf = dec(t);
  if (tf.isZero()) throw new UnitError(`Invalid zero factor for ${to}`);
  return dec(quantity).times(dec(f)).div(tf);
}

/** Price per `from` unit expressed per `to` unit (inverse of quantity conversion). */
export function convertRate(pricePerUnit: DecInput, from: string, to: string, table: UnitTable = STANDARD_TABLE): Dec {
  if (from === to) return dec(pricePerUnit);
  return dec(pricePerUnit).times(convert(1, to, from, table));
}

export { D };
