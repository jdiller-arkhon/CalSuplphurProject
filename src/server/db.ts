import { PrismaClient, Prisma } from "@prisma/client";

const g = globalThis as unknown as { prisma?: PrismaClient };
export const db = g.prisma ?? new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });
if (process.env.NODE_ENV !== "production") g.prisma = db;

export type Tx = Prisma.TransactionClient;

function isSerializationFailure(e: unknown): boolean {
  const err = e as { code?: string; meta?: { code?: string }; message?: string };
  if (err.code === "P2034" || err.code === "40001" || err.meta?.code === "40001" || err.meta?.code === "40P01") return true;
  return err.code === "P2010" && /\b(40001|40P01)\b/.test(err.message ?? "");
}

/** Run in a SERIALIZABLE transaction and retry on serialization conflicts (P2034). */
export async function serializable<T>(fn: (tx: Tx) => Promise<T>, attempts = 8): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await db.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 });
    } catch (e) {
      if (isSerializationFailure(e) && i < attempts - 1) {
        await new Promise((r) => setTimeout(r, Math.min(400, 20 * 2 ** i) + Math.random() * 50));
        continue;
      }
      throw e;
    }
  }
}

/** Gap-free, human-readable document numbers (Q-2026-00001). Must run inside a transaction. */
export async function nextNumber(tx: Tx, prefix: string): Promise<string> {
  const year = new Date().getUTCFullYear();
  const name = `${prefix}-${year}`;
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "Counter"(name, value) VALUES (${name}, 1)
    ON CONFLICT (name) DO UPDATE SET value = "Counter".value + 1
    RETURNING value`;
  return `${name}-${String(rows[0].value).padStart(5, "0")}`;
}
