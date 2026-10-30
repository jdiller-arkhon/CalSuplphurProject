import "server-only";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { authorize, AuthError, type CurrentUser } from "./auth";
import type { Permission } from "./permissions";
import { log } from "./audit";

export type ActionState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string>; message?: string; redirect?: string; data?: unknown } | null;

/** Parse FormData into a nested object. Supports "lines.0.qty" and "tags[]" notations. */
export function formToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [rawKey, value] of fd.entries()) {
    if (rawKey.startsWith("$ACTION")) continue;
    if (typeof value !== "string") {
      out[rawKey] = value;
      continue;
    }
    const isArr = rawKey.endsWith("[]");
    const parts = (isArr ? rawKey.slice(0, -2) : rawKey).split(".");
    let node: Record<string, unknown> = out;
    parts.forEach((p, i) => {
      const last = i === parts.length - 1;
      if (last) {
        if (isArr) ((node[p] ??= []) as unknown[]).push(value);
        else node[p] = value;
      } else {
        const nextIsIndex = /^\d+$/.test(parts[i + 1]);
        node[p] ??= nextIsIndex ? [] : {};
        node = node[p] as Record<string, unknown>;
      }
    });
  }
  // Compact sparse arrays (rows removed client-side).
  const compact = (v: unknown): unknown => (Array.isArray(v) ? v.filter((x) => x !== undefined).map(compact) : v && typeof v === "object" && !(v instanceof File) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, compact(x)])) : v);
  return compact(out) as Record<string, unknown>;
}

/** Errors whose messages are safe to show to the user. */
const USER_ERRORS = ["InventoryError", "SalesError", "PurchasingError", "PricingError", "UnitError", "UserError", "ImportError"];
export class UserError extends Error {
  name = "UserError";
}

type Result = void | string | { message?: string; redirect?: string; data?: unknown };

export function action<S extends z.ZodTypeAny>(permission: Permission | null, schema: S, fn: (data: z.infer<S>, user: CurrentUser) => Promise<Result>, opts: { revalidate?: string[] } = {}) {
  return async (_prev: ActionState, fd: FormData): Promise<ActionState> => {
    let user: CurrentUser;
    try {
      user = await authorize(permission ?? undefined);
    } catch (e) {
      return { error: e instanceof AuthError ? e.message : "Not authorized." };
    }
    const parsed = schema.safeParse(formToObject(fd));
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const i of parsed.error.issues) fieldErrors[i.path.join(".")] ??= i.message;
      return { error: "Please correct the highlighted fields.", fieldErrors };
    }
    try {
      const r = await fn(parsed.data, user);
      (opts.revalidate ?? ["/"]).forEach((p) => revalidatePath(p, "layout"));
      if (typeof r === "string") return { ok: true, message: r };
      return { ok: true, ...(r ?? {}) };
    } catch (e) {
      const err = e as Error & { code?: string };
      if (USER_ERRORS.includes(err.constructor?.name) || USER_ERRORS.includes(err.name)) return { error: err.message };
      if (err.code === "P2002") return { error: "A record with that identifier already exists." };
      if (err.code === "P2025") return { error: "The record no longer exists." };
      if (err instanceof AuthError) return { error: err.message };
      log("error", "action failed", { err: err.message, stack: err.stack?.split("\n").slice(0, 4).join(" | ") });
      return { error: "Something went wrong. Nothing was saved. Please try again." };
    }
  };
}

// Reusable field schemas
export const zStr = (max = 200) => z.string().trim().max(max);
export const zReq = (label: string, max = 200) => z.string().trim().min(1, `${label} is required`).max(max);
export const zOpt = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));
export const zDec = (label: string, { min, allowZero = true }: { min?: number; allowZero?: boolean } = {}) =>
  z
    .string()
    .trim()
    .regex(/^-?\d{1,14}(\.\d{1,6})?$/, `${label} must be a number`)
    .refine((v) => (min === undefined ? true : Number(v) >= min), `${label} must be at least ${min}`)
    .refine((v) => allowZero || Number(v) !== 0, `${label} cannot be zero`);
export const zDecOpt = (label: string) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => v === undefined || /^-?\d{1,14}(\.\d{1,6})?$/.test(v), `${label} must be a number`);
/** Percent typed by user as "25" → fraction "0.25". */
export const zPct = (label: string) =>
  zDec(label).transform((v) => (Number(v) / 100).toFixed(6).replace(/0+$/, "").replace(/\.$/, ""));
export const zDate = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .refine((v) => !Number.isNaN(Date.parse(v)), `${label} is not a valid date`)
    .transform((v) => new Date(v));
export const zDateOpt = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? new Date(v) : undefined))
  .refine((v) => v === undefined || !Number.isNaN(v.getTime()), "Invalid date");
export const zBool = z
  .string()
  .optional()
  .transform((v) => v === "on" || v === "true" || v === "1");
