/**
 * Development only: adds labeled "[Sample]" market prices and trackers for UI review.
 * Refuses to run unless APP_ENV=development and the database name contains "dev".
 */
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const day = (n: number) => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - n); return d; };
async function main() {
  if (process.env.APP_ENV !== "development" || !/dev/.test(process.env.DATABASE_URL ?? "")) throw new Error("Refusing: development database only.");
  if (await db.tracker.findFirst({ where: { name: { startsWith: "[Sample]" } } })) return console.log("Sample tracking data already present.");
  const owner = await db.user.findFirst({ where: { role: "OWNER" } });
  const products = await db.product.findMany({ where: { name: { startsWith: "[Sample]" } } });
  const prill = products.find((p) => /prill/i.test(p.name)) ?? products[0];
  const crushed = products.find((p) => /crushed/i.test(p.name));
  const plant = await db.location.findFirst({ where: { name: { startsWith: "[Sample]" } } });
  // Market prices: a gently rising market with a few outliers, mixed units and sources.
  const src = ["COMPETITOR_QUOTE", "CUSTOMER_FEEDBACK", "BROKER", "PUBLISHED_INDEX", "LOST_DEAL"] as const;
  const rows = [];
  for (let i = 0; i < 14; i++) {
    const age = 170 - i * 12;
    const base = 108 + i * 1.1 + ((i * 7) % 5) - 2;
    const st = i % 4 === 1;
    rows.push({ productId: prill.id, sourceType: src[i % src.length], source: `[Sample] ${["Competitor A", "Customer feedback", "Broker B", "Trade index", "Lost bid"][i % 5]}`, basis: i % 6 === 5 ? "DELIVERED" : "FOB", region: "[Sample] California", price: (st ? base * 0.90718474 : base).toFixed(2), unitCode: st ? "ST" : "MT", observedAt: day(age), createdBy: owner?.id });
  }
  if (crushed) for (let i = 0; i < 3; i++) rows.push({ productId: crushed.id, sourceType: "BROKER" as const, source: "[Sample] Broker B", basis: "FOB", price: (74 + i * 1.5).toFixed(2), unitCode: "MT", observedAt: day(80 - i * 25), createdBy: owner?.id });
  await db.marketRate.createMany({ data: rows });
  // Trackers in different units and aggregations.
  const mk = async (data: Parameters<typeof db.tracker.create>[0]["data"], gen: (i: number) => number | null, n: number, every: number, unit?: string) => {
    const t = await db.tracker.create({ data: { ...data, createdBy: owner?.id } });
    const entries = [];
    for (let i = n - 1; i >= 0; i--) { const v = gen(i); if (v === null) continue; entries.push({ trackerId: t.id, at: day(i * every), value: v.toFixed(4), enteredValue: v.toFixed(4), enteredUnit: unit ?? t.unitCode, createdBy: owner?.id }); }
    await db.trackerEntry.createMany({ data: entries });
  };
  await mk({ name: "[Sample] Tons loaded out", category: "Production", unitCode: "MT", aggregation: "SUM", frequency: "DAILY", target: "180", targetDirection: "AT_LEAST", decimals: 1, productId: prill.id, locationId: plant?.id }, (i) => (i % 7 === 6 ? null : 150 + ((i * 37) % 70)), 30, 1);
  await mk({ name: "[Sample] Pelletizer moisture", category: "Quality", unitCode: "PCT", aggregation: "AVERAGE", frequency: "WEEKLY", target: "0.5", targetDirection: "AT_MOST", decimals: 2 }, (i) => 0.42 + ((i * 13) % 9) / 50, 26, 3);
  await mk({ name: "[Sample] Diesel used", category: "Energy", unitCode: "GAL", aggregation: "SUM", frequency: "WEEKLY", decimals: 0 }, (i) => 900 + ((i * 53) % 260), 40, 2);
  await mk({ name: "[Sample] Molten tank level", category: "Production", unitCode: "MT", aggregation: "LATEST", frequency: "DAILY", target: "400", targetDirection: "AT_LEAST", decimals: 0 }, (i) => 380 + Math.round(120 * Math.sin(i / 4)), 21, 1);
  await mk({ name: "[Sample] Truck turnaround", category: "Logistics", unitCode: "H", aggregation: "AVERAGE", frequency: "WEEKLY", target: "1.5", targetDirection: "AT_MOST", decimals: 2 }, (i) => 1.3 + ((i * 11) % 7) / 10, 20, 4);
  await mk({ name: "[Sample] Near-miss reports", category: "Safety", unitCode: "EA", aggregation: "SUM", frequency: "MONTHLY", target: "2", targetDirection: "AT_MOST", decimals: 0 }, (i) => (i * 5) % 4, 10, 30);
  console.log("Sample tracking & market data loaded (all labeled [Sample]).");
}
main().finally(() => db.$disconnect());
