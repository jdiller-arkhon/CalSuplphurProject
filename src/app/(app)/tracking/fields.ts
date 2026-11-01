import type { FieldDef } from "@/components/form-modal";
import { dimensionLabel } from "@/lib/units";
import { today } from "@/server/lookups";

type U = { code: string; name: string; dimension: string };
export const groupedUnitOpts = (units: U[]) => [...units].sort((a, b) => dimensionLabel(a.dimension).localeCompare(dimensionLabel(b.dimension)) || a.name.localeCompare(b.name)).map((u) => ({ value: u.code, label: `${dimensionLabel(u.dimension)} — ${u.name} (${u.code})` }));

export function trackerFields(units: U[], products: { value: string; label: string }[], locations: { value: string; label: string }[], t?: { name: string; description: string | null; category: string | null; unitCode: string; aggregation: string; frequency: string; target: string | null; targetDirection: string | null; decimals: number; productId: string | null; locationId: string | null }): FieldDef[] {
  return [
    { name: "name", label: "What do you want to track?", required: true, placeholder: "e.g. Tons loaded at Berth 2, Pelletizer moisture, Diesel used", defaultValue: t?.name, span: 2 },
    { name: "unitCode", label: "Unit", type: "select", required: true, options: groupedUnitOpts(units), defaultValue: t?.unitCode ?? "MT", hint: "Need another unit? Add it under Settings → Units." },
    { name: "category", label: "Group (optional)", placeholder: "e.g. Production, Safety, Energy", defaultValue: t?.category ?? undefined },
    { name: "aggregation", label: "How values combine", type: "select", required: true, defaultValue: t?.aggregation ?? "SUM", options: [{ value: "SUM", label: "Add up (totals: tons, hours, cost)" }, { value: "AVERAGE", label: "Average (rates: moisture %, purity)" }, { value: "LATEST", label: "Latest reading (levels: tank level, stock count)" }] },
    { name: "frequency", label: "Show by", type: "select", required: true, defaultValue: t?.frequency ?? "DAILY", options: [{ value: "DAILY", label: "Day" }, { value: "WEEKLY", label: "Week" }, { value: "MONTHLY", label: "Month" }, { value: "AS_NEEDED", label: "Month (irregular readings)" }] },
    { name: "target", label: "Target (optional)", type: "number", step: "any", defaultValue: t?.target ?? undefined, hint: "In the unit above, per period." },
    { name: "targetDirection", label: "Target means", type: "select", defaultValue: t?.targetDirection ?? "AT_LEAST", options: [{ value: "AT_LEAST", label: "At least this much (higher is better)" }, { value: "AT_MOST", label: "At most this much (lower is better)" }] },
    { name: "productId", label: "Related product (optional)", type: "select", options: products, defaultValue: t?.productId ?? undefined, placeholder: "None" },
    { name: "locationId", label: "Related location (optional)", type: "select", options: locations, defaultValue: t?.locationId ?? undefined, placeholder: "None" },
    { name: "decimals", label: "Decimal places shown", type: "number", defaultValue: String(t?.decimals ?? 2) },
    { name: "description", label: "Notes (optional)", type: "textarea", defaultValue: t?.description ?? undefined, span: 2 },
  ];
}

export function logFields(unitOpts: { value: string; label: string }[], unit: string): FieldDef[] {
  return [
    { name: "value", label: "Value", type: "number", step: "any", required: true },
    { name: "unit", label: "Entered in", type: "select", required: true, options: unitOpts, defaultValue: unit, hint: "Converted automatically." },
    { name: "at", label: "Date", type: "date", required: true, defaultValue: today() },
    { name: "note", label: "Note (optional)" },
  ];
}
