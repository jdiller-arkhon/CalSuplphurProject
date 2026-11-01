import type { Prisma } from "@prisma/client";
import { db, type Tx } from "../db";

export const SETTING_DEFAULTS = {
  "company.profile": { name: "", legalName: "", address: "", phone: "", email: "", website: "", baseCurrency: "USD", baseUnit: "MT", logoText: "CSC" },
  "inventory.allowNegativeAvailable": false,
  "inventory.costingMethod": "LOT_WEIGHTED_AVERAGE", // pending company confirmation — see BUSINESS_ASSUMPTIONS.md
  "pricing.defaultMinMarginPct": "0.10",
  "quotes.defaultValidityDays": 30,
  "quotes.defaultTerms": { delivery: "", payment: "" },
  "revenue.recognition": "ON_SHIPMENT", // operational view; not an accounting determination
  "alerts.thresholds": { quoteExpiryDays: 5, costChangePct: "0.10", overdueShipmentDays: 1, poOverdueDays: 0 },
  "setup.completed": false,
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

export async function getSetting<K extends SettingKey>(tx: Tx | typeof db, key: K): Promise<(typeof SETTING_DEFAULTS)[K] | Prisma.JsonValue> {
  const row = await tx.appSetting.findUnique({ where: { key } });
  return (row?.value ?? SETTING_DEFAULTS[key]) as (typeof SETTING_DEFAULTS)[K];
}

export async function getSettingTyped<K extends SettingKey>(key: K): Promise<(typeof SETTING_DEFAULTS)[K]> {
  const v = await getSetting(db, key);
  const d = SETTING_DEFAULTS[key];
  if (d && typeof d === "object" && !Array.isArray(d) && v && typeof v === "object") return { ...d, ...(v as object) } as (typeof SETTING_DEFAULTS)[K];
  return v as (typeof SETTING_DEFAULTS)[K];
}

export async function setSetting(tx: Tx | typeof db, key: SettingKey, value: unknown) {
  const json = JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  await tx.appSetting.upsert({ where: { key }, update: { value: json }, create: { key, value: json } });
}
