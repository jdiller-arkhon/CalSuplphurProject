/**
 * Reference data only — units of measure and default role permissions.
 * Safe for production: inserts NO business data (no products, customers, prices or inventory).
 */
import { PrismaClient } from "@prisma/client";
import { STANDARD_UNITS } from "../src/lib/units";

const db = new PrismaClient();
async function main() {
  for (const u of STANDARD_UNITS) {
    await db.unitOfMeasure.upsert({ where: { code: u.code }, update: {}, create: { code: u.code, name: u.name, toKg: u.toKg } });
  }
  console.log(`Reference data ready: ${STANDARD_UNITS.length} units of measure.`);
}
main().finally(() => db.$disconnect());
