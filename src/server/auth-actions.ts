"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { audit } from "./audit";
import { rateLimit } from "./ratelimit";
import { createSession, destroySession, hashPassword, markMfaPassed, passwordProblems, pendingMfaUser, sha256, totp, verifyPassword, currentUser } from "./auth";
import { MAX_ACTIVE_USERS } from "./permissions";
import type { ActionState } from "./action";

const ip = async () => (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
const GENERIC = "Email or password is incorrect.";

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!(await rateLimit(`login:${await ip()}`, 10, 15 * 60_000)) || !(await rateLimit(`login:${email}`, 8, 15 * 60_000))) return { error: "Too many sign-in attempts. Wait 15 minutes and try again." };
  const user = await db.user.findUnique({ where: { email } });
  // Constant-ish work whether or not the account exists.
  const ok = user ? await verifyPassword(user.passwordHash, password) : (await hashPassword(password), false);
  if (!user || !user.active) return { error: GENERIC };
  if (user.lockedUntil && user.lockedUntil > new Date()) return { error: "This account is temporarily locked after repeated failures. Try again later." };
  if (!ok) {
    const failed = user.failedLogins + 1;
    await db.user.update({ where: { id: user.id }, data: { failedLogins: failed, lockedUntil: failed >= 8 ? new Date(Date.now() + 30 * 60_000) : null } });
    await audit(db, { userId: user.id, action: "auth.fail", entity: "User", entityId: user.id, summary: `Failed sign-in (${failed})` });
    return { error: GENERIC };
  }
  await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await createSession(user.id, !user.mfaSecret);
  await audit(db, { userId: user.id, action: "auth.login", entity: "User", entityId: user.id, summary: "Signed in" });
  redirect(user.mfaSecret ? "/login/mfa" : "/start");
}

export async function mfaAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await pendingMfaUser();
  if (!s) return { ok: true, redirect: "/login" };
  if (!(await rateLimit(`mfa:${s.userId}`, 6, 5 * 60_000))) return { error: "Too many attempts. Wait a few minutes." };
  const code = String(fd.get("code") ?? "").replace(/\s/g, "");
  if (!totp.check(code, s.user.mfaSecret!)) return { error: "That code is not valid. Check your authenticator app's clock and try again." };
  await markMfaPassed();
  redirect("/start");
}

export async function logout() {
  await destroySession();
}

/** First-run: create the owner account. Only works while no users exist. */
export async function setupOwnerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  if (!(await rateLimit(`setup:${await ip()}`, 5, 15 * 60_000))) return { error: "Too many attempts." };
  const p = z
    .object({ name: z.string().trim().min(2).max(100), email: z.string().trim().toLowerCase().email(), password: z.string(), setupToken: z.string().optional() })
    .safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: "Enter your name, a valid email and a password." };
  const expected = process.env.SETUP_TOKEN;
  if (process.env.NODE_ENV === "production" && (!expected || p.data.setupToken !== expected)) return { error: "A valid setup token is required. It is set in the SETUP_TOKEN environment variable." };
  const pwErr = passwordProblems(p.data.password);
  if (pwErr) return { error: pwErr };
  const created = await db.$transaction(async (tx) => {
    if ((await tx.user.count()) > 0) return null;
    return tx.user.create({ data: { name: p.data.name, email: p.data.email, role: "OWNER", passwordHash: await hashPassword(p.data.password) } });
  });
  if (!created) return { error: "Setup has already been completed. Sign in instead." };
  await audit(db, { userId: created.id, action: "user.create", entity: "User", entityId: created.id, summary: "Owner account created during first-run setup" });
  await createSession(created.id, true);
  redirect("/setup");
}

export async function acceptInviteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const token = String(fd.get("token") ?? "");
  const name = String(fd.get("name") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  if (name.length < 2) return { error: "Enter your name." };
  const pwErr = passwordProblems(password);
  if (pwErr) return { error: pwErr };
  const inv = await db.invitation.findUnique({ where: { tokenHash: sha256(token) } });
  if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) return { error: "This invitation is invalid or has expired. Ask the owner for a new one." };
  const hash = await hashPassword(password);
  const result = await db.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { email: inv.email } });
    if (existing) {
      // Account recovery: the owner issued a reset link for this user.
      await tx.invitation.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } });
      return tx.user.update({ where: { id: existing.id }, data: { passwordHash: hash, failedLogins: 0, lockedUntil: null } });
    }
    if ((await tx.user.count({ where: { active: true } })) >= MAX_ACTIVE_USERS) return "full" as const;
    const u = await tx.user.create({ data: { name, email: inv.email, role: inv.role, passwordHash: hash } });
    await tx.invitation.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } });
    return u;
  });
  if (result === "full") return { error: `This workspace already has the maximum of ${MAX_ACTIVE_USERS} active users.` };
  await audit(db, { userId: result.id, action: "user.create", entity: "User", entityId: result.id, summary: `Accepted invitation as ${inv.role}` });
  await createSession(result.id, true);
  redirect("/");
}

export async function changePasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await currentUser();
  if (!u) return { error: "Not signed in." };
  const user = await db.user.findUniqueOrThrow({ where: { id: u.id } });
  if (!(await verifyPassword(user.passwordHash, String(fd.get("current") ?? "")))) return { error: "Current password is incorrect." };
  const next = String(fd.get("next") ?? "");
  const pwErr = passwordProblems(next);
  if (pwErr) return { error: pwErr };
  await db.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(next) } });
  await audit(db, { userId: u.id, action: "auth.password", entity: "User", entityId: u.id, summary: "Changed password" });
  return { ok: true, message: "Password updated." };
}

export async function startMfaAction(): Promise<{ secret: string; uri: string } | { error: string }> {
  const u = await currentUser();
  if (!u) return { error: "Not signed in." };
  const secret = totp.generateSecret();
  await db.user.update({ where: { id: u.id }, data: { mfaPending: secret } });
  return { secret, uri: totp.uri(u.email, secret) };
}

export async function confirmMfaAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await currentUser();
  if (!u) return { error: "Not signed in." };
  const user = await db.user.findUniqueOrThrow({ where: { id: u.id } });
  if (!user.mfaPending) return { error: "Start MFA setup first." };
  if (!totp.check(String(fd.get("code") ?? "").replace(/\s/g, ""), user.mfaPending)) return { error: "Code did not match. Try the next code shown in your app." };
  await db.user.update({ where: { id: u.id }, data: { mfaSecret: user.mfaPending, mfaPending: null } });
  await db.session.updateMany({ where: { userId: u.id }, data: { mfaPassed: true } });
  await audit(db, { userId: u.id, action: "auth.mfa.enable", entity: "User", entityId: u.id, summary: "Enabled two-factor authentication" });
  return { ok: true, message: "Two-factor authentication is on." };
}

export async function disableMfaAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await currentUser();
  if (!u) return { error: "Not signed in." };
  const user = await db.user.findUniqueOrThrow({ where: { id: u.id } });
  if (!(await verifyPassword(user.passwordHash, String(fd.get("password") ?? "")))) return { error: "Password is incorrect." };
  await db.user.update({ where: { id: u.id }, data: { mfaSecret: null, mfaPending: null } });
  await audit(db, { userId: u.id, action: "auth.mfa.disable", entity: "User", entityId: u.id, summary: "Disabled two-factor authentication" });
  return { ok: true, message: "Two-factor authentication is off." };
}
