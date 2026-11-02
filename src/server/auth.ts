import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { authenticator } from "otplib";
import type { Role, User } from "@prisma/client";
import { db } from "./db";
import { moduleForPath } from "@/lib/modules";
import { moduleOn } from "./modules";
import { DEFAULT_ROLE_PERMISSIONS, LOCKED_OWNER, type Permission } from "./permissions";

export const SESSION_COOKIE = "csc_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h absolute
authenticator.options = { window: 1 };

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");

export const hashPassword = (pw: string) => hash(pw, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
export const verifyPassword = (h: string, pw: string) => verify(h, pw).catch(() => false);

export function passwordProblems(pw: string): string | null {
  if (pw.length < 12) return "Password must be at least 12 characters.";
  if (pw.length > 256) return "Password is too long.";
  if (!/[a-zA-Z]/.test(pw) || !/[0-9\W]/.test(pw)) return "Use letters plus at least one number or symbol.";
  return null;
}

export async function createSession(userId: string, mfaPassed: boolean) {
  const token = newToken();
  const h = await headers();
  await db.session.create({
    data: {
      id: sha256(token),
      userId,
      mfaPassed,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
    },
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function destroySession() {
  const c = await cookies();
  const t = c.get(SESSION_COOKIE)?.value;
  if (t) await db.session.deleteMany({ where: { id: sha256(t) } });
  c.delete(SESSION_COOKIE);
}

export type CurrentUser = Pick<User, "id" | "email" | "name" | "role"> & { mfaEnabled: boolean; permissions: Set<Permission> };

async function loadSession() {
  const t = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!t) return null;
  const s = await db.session.findUnique({ where: { id: sha256(t) }, include: { user: true } });
  if (!s || s.expiresAt < new Date() || !s.user.active) return null;
  return s;
}

export async function permissionsFor(role: Role): Promise<Set<Permission>> {
  const rows = await db.rolePermission.findMany({ where: { role } });
  const set = new Set<Permission>(rows.length ? (rows.map((r) => r.permission) as Permission[]) : DEFAULT_ROLE_PERMISSIONS[role]);
  if (role === "OWNER") LOCKED_OWNER.forEach((p) => set.add(p));
  return set;
}

/** Returns the authenticated, MFA-satisfied user or null. */
export async function currentUser(): Promise<CurrentUser | null> {
  const s = await loadSession();
  if (!s) return null;
  const mfaEnabled = !!s.user.mfaSecret;
  if (mfaEnabled && !s.mfaPassed) return null;
  return { id: s.user.id, email: s.user.email, name: s.user.name, role: s.user.role, mfaEnabled, permissions: await permissionsFor(s.user.role) };
}

/** Session exists but still awaits a TOTP code. */
export async function pendingMfaUser() {
  const s = await loadSession();
  if (!s || !s.user.mfaSecret || s.mfaPassed) return null;
  return s;
}

export async function markMfaPassed() {
  const t = (await cookies()).get(SESSION_COOKIE)?.value;
  if (t) await db.session.update({ where: { id: sha256(t) }, data: { mfaPassed: true } });
}

export class AuthError extends Error {
  constructor(public status: 401 | 403, message: string) {
    super(message);
  }
}

/** Page guard: redirects to login, or to a 403 page when lacking a permission. */
export async function requireUser(permission?: Permission): Promise<CurrentUser> {
  const u = await currentUser();
  if (!u) redirect("/login");
  if (permission && !u.permissions.has(permission)) redirect("/forbidden");
  // Sections switched off in Settings → Sections are unavailable (they are hidden from navigation too).
  const path = (await headers()).get("x-pathname");
  const mod = path ? moduleForPath(path) : null;
  if (mod && !(await moduleOn(mod))) redirect(`/section-off?m=${mod}`);
  return u;
}

/** Action/API guard: throws instead of redirecting. */
export async function authorize(permission?: Permission): Promise<CurrentUser> {
  const u = await currentUser();
  if (!u) throw new AuthError(401, "Not signed in.");
  if (permission && !u.permissions.has(permission)) throw new AuthError(403, "You do not have permission to do that.");
  return u;
}

export const can = (u: CurrentUser | null, p: Permission) => !!u?.permissions.has(p);

export const totp = {
  generateSecret: () => authenticator.generateSecret(),
  uri: (email: string, secret: string) => authenticator.keyuri(email, "CSC Command", secret),
  check: (code: string, secret: string) => /^\d{6}$/.test(code) && authenticator.check(code, secret),
};
