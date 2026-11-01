// Integration tests run against an isolated database (csc_test) configured in vitest.config.ts.

import { db } from "@/server/db";
import { STANDARD_UNITS, REFERENCE_UNITS } from "@/lib/units";

export async function resetDb() {
  if (!process.env.DATABASE_URL?.includes("test")) throw new Error("Refusing to truncate a non-test database.");
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(",")} RESTART IDENTITY CASCADE`);
  for (const u of STANDARD_UNITS) await db.unitOfMeasure.create({ data: { code: u.code, name: u.name, toKg: u.toKg } });
  await db.unitOfMeasure.createMany({ data: REFERENCE_UNITS });
}

export async function fixture() {
  const user = await db.user.create({ data: { email: "owner@test.local", name: "Test Owner", role: "OWNER", passwordHash: "x" } });
  const product = await db.product.create({ data: { sku: "TEST-PRILL", name: "Test Prill", unitCode: "MT", minMarginPct: "0.15", defaultCost: "80" } });
  const plant = await db.location.create({ data: { code: "PLT", name: "Plant", kind: "PLANT" } });
  const port = await db.location.create({ data: { code: "PRT", name: "Port", kind: "BERTH" } });
  const customer = await db.customer.create({ data: { name: "Test Customer" } });
  const supplier = await db.supplier.create({ data: { name: "Test Supplier" } });
  return { ctx: { userId: user.id }, user, product, plant, port, customer, supplier };
}

export { db };
