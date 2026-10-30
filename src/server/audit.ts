import type { Prisma } from "@prisma/client";
import { db, type Tx } from "./db";

export async function audit(
  tx: Tx | typeof db,
  e: { userId?: string | null; action: string; entity: string; entityId?: string | null; summary: string; data?: unknown },
) {
  await tx.auditEvent.create({
    data: {
      userId: e.userId ?? null,
      action: e.action,
      entity: e.entity,
      entityId: e.entityId ?? null,
      summary: e.summary.slice(0, 500),
      data: e.data === undefined ? undefined : (JSON.parse(JSON.stringify(e.data)) as Prisma.InputJsonValue),
    },
  });
}

export function log(level: "info" | "warn" | "error", msg: string, ctx: Record<string, unknown> = {}) {
  // Structured, single-line JSON logs for the hosting platform's log drain.
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...ctx });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
