import { db } from "./db";

/** Fixed-window limiter stored in Postgres (works across instances; no extra infra). */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const now = new Date();
  const reset = new Date(now.getTime() + windowMs);
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit"(key, count, "resetAt") VALUES (${key}, 1, ${reset})
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN "RateLimit"."resetAt" < ${now} THEN 1 ELSE "RateLimit".count + 1 END,
      "resetAt" = CASE WHEN "RateLimit"."resetAt" < ${now} THEN ${reset} ELSE "RateLimit"."resetAt" END
    RETURNING count`;
  return rows[0].count <= limit;
}
