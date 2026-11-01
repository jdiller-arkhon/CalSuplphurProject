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

/** Reference units for other kinds of measurement (factor to each kind's base unit). Mirrors migration 20261101180000. */
export const REFERENCE_UNITS: { code: string; name: string; toKg: string; dimension: string }[] = [
  { code: "G", name: "Gram", toKg: "0.001", dimension: "mass" },
  { code: "L", name: "Litre", toKg: "1", dimension: "volume" }, { code: "M3", name: "Cubic metre", toKg: "1000", dimension: "volume" }, { code: "GAL", name: "US gallon", toKg: "3.785411784", dimension: "volume" }, { code: "BBL", name: "Barrel (oil, 42 US gal)", toKg: "158.987294928", dimension: "volume" },
  { code: "M", name: "Metre", toKg: "1", dimension: "length" }, { code: "KM", name: "Kilometre", toKg: "1000", dimension: "length" }, { code: "FT", name: "Foot", toKg: "0.3048", dimension: "length" }, { code: "MI", name: "Mile", toKg: "1609.344", dimension: "length" },
  { code: "KWH", name: "Kilowatt-hour", toKg: "1", dimension: "energy" }, { code: "MWH", name: "Megawatt-hour", toKg: "1000", dimension: "energy" }, { code: "MMBTU", name: "Million BTU", toKg: "293.0710701722", dimension: "energy" }, { code: "THERM", name: "Therm", toKg: "29.30710701722", dimension: "energy" },
  { code: "H", name: "Hour", toKg: "1", dimension: "time" }, { code: "MIN", name: "Minute", toKg: "0.0166666666666667", dimension: "time" }, { code: "DAY", name: "Day", toKg: "24", dimension: "time" },
  { code: "EA", name: "Each", toKg: "1", dimension: "count" }, { code: "LOAD", name: "Truck load", toKg: "1", dimension: "count:loads" }, { code: "CONT", name: "Container", toKg: "1", dimension: "count:containers" }, { code: "RAIL", name: "Railcar", toKg: "1", dimension: "count:railcars" },
  { code: "PCT", name: "Percent", toKg: "1", dimension: "percent" }, { code: "PPM", name: "Parts per million", toKg: "0.0001", dimension: "percent" },
  { code: "USD", name: "US dollar", toKg: "1", dimension: "currency:USD" },
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

/** Unit families. Values convert only within the same family (the part before ":" for counted items). */
export const DIMENSIONS: Record<string, { label: string; base: string }> = {
  mass: { label: "Weight / mass", base: "kg" },
  volume: { label: "Volume", base: "litre" },
  length: { label: "Distance / length", base: "metre" },
  energy: { label: "Energy", base: "kWh" },
  time: { label: "Time", base: "hour" },
  count: { label: "Count", base: "each" },
  percent: { label: "Percent / concentration", base: "percent" },
};
export const dimensionLabel = (d: string) => DIMENSIONS[d]?.label ?? (d.startsWith("count:") ? `Count of ${d.slice(6)}` : d.startsWith("currency:") ? `Money (${d.slice(9)})` : d.replace(/^custom:/, "").replace(/^\w/, (c) => c.toUpperCase()));

export type UnitDef = { code: string; name: string; toKg: DecInput; dimension: string };

/** Converts between any two units of the same family using their base factors. */
export function convertUnits(quantity: DecInput, from: string, to: string, units: UnitDef[]): Dec {
  if (from === to) return dec(quantity);
  const f = units.find((u) => u.code === from), t = units.find((u) => u.code === to);
  if (!f) throw new UnitError(`Unknown unit: ${from}`);
  if (!t) throw new UnitError(`Unknown unit: ${to}`);
  if (f.dimension !== t.dimension) throw new UnitError(`Can't convert ${f.name} (${dimensionLabel(f.dimension)}) to ${t.name} (${dimensionLabel(t.dimension)}).`);
  const tf = dec(t.toKg);
  if (tf.isZero()) throw new UnitError(`Invalid zero factor for ${to}`);
  return dec(quantity).times(dec(f.toKg)).div(tf);
}
/** A price per `from` expressed per `to`. */
export function convertUnitRate(price: DecInput, from: string, to: string, units: UnitDef[]): Dec {
  return from === to ? dec(price) : dec(price).times(convertUnits(1, to, from, units));
}
export const compatible = (a: string, b: string, units: UnitDef[]) => { const x = units.find((u) => u.code === a), y = units.find((u) => u.code === b); return !!x && !!y && x.dimension === y.dimension; };
