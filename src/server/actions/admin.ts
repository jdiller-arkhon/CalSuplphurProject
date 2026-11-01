"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { db } from "../db";
import { audit } from "../audit";
import { action, zReq, zOpt, zBool, zDec, UserError } from "../action";
import type { ActionState } from "../action";
import { newToken, sha256 } from "../auth";
import { MAX_ACTIVE_USERS, PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, LOCKED_OWNER, type Permission } from "../permissions";
import { setSetting, getSettingTyped } from "../services/settings";
import { saveFile, validateUpload } from "../storage";
import { refreshAlerts } from "../services/alerts";
import type { Role } from "@prisma/client";

// ── Company & policy settings ──
const saveCompanyImpl = action(
  "settings.manage",
  z.object({ name: zReq("Company name"), legalName: zOpt(200), address: zOpt(400), phone: zOpt(50), email: zOpt(200), website: zOpt(200), baseCurrency: z.string().regex(/^[A-Z]{3}$/).default("USD"), baseUnit: zReq("Base unit") }),
  async (d, u) => {
    await setSetting(db, "company.profile", { ...d, logoText: "CSC" });
    await audit(db, { userId: u.id, action: "settings.company", entity: "AppSetting", summary: "Updated company profile" });
    return "Company profile saved.";
  },
);

const savePoliciesImpl = action(
  "settings.manage",
  z.object({
    defaultMinMarginPct: zDec("Default minimum margin", { min: 0 }),
    quoteValidityDays: z.coerce.number().int().min(1).max(365),
    deliveryTerms: zOpt(200),
    paymentTerms: zOpt(200),
    allowNegative: zBool,
    quoteExpiryDays: z.coerce.number().int().min(0).max(90),
    overdueShipmentDays: z.coerce.number().int().min(0).max(90),
  }),
  async (d, u) => {
    if (Number(d.defaultMinMarginPct) >= 100) throw new UserError("Minimum margin must be below 100%.");
    await setSetting(db, "pricing.defaultMinMarginPct", (Number(d.defaultMinMarginPct) / 100).toString());
    await setSetting(db, "quotes.defaultValidityDays", d.quoteValidityDays);
    await setSetting(db, "quotes.defaultTerms", { delivery: d.deliveryTerms ?? "", payment: d.paymentTerms ?? "" });
    await setSetting(db, "inventory.allowNegativeAvailable", d.allowNegative);
    const t = await getSettingTyped("alerts.thresholds");
    await setSetting(db, "alerts.thresholds", { ...t, quoteExpiryDays: d.quoteExpiryDays, overdueShipmentDays: d.overdueShipmentDays });
    await audit(db, { userId: u.id, action: "settings.policies", entity: "AppSetting", summary: "Updated pricing, quote and alert policies", data: d });
    return "Policies saved.";
  },
);

const completeSetupImpl = action("settings.manage", z.object({}), async (_d, u) => {
  await setSetting(db, "setup.completed", true);
  await audit(db, { userId: u.id, action: "setup.complete", entity: "AppSetting", summary: "Marked guided setup complete" });
  return { message: "Setup complete.", redirect: "/" };
});

// ── Users & invitations ──
const inviteUserImpl = action("users.manage", z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email"), role: z.enum(["MANAGER", "VIEWER", "OWNER"]) }), async (d, u) => {
  const active = await db.user.count({ where: { active: true } });
  const pending = await db.invitation.count({ where: { acceptedAt: null, expiresAt: { gt: new Date() } } });
  if (active + pending >= MAX_ACTIVE_USERS) throw new UserError(`CSC Command allows ${MAX_ACTIVE_USERS} users. Deactivate a user or cancel a pending invitation first.`);
  if (await db.user.findUnique({ where: { email: d.email } })) throw new UserError("A user with that email already exists.");
  const token = newToken();
  await db.invitation.create({ data: { email: d.email, role: d.role, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 7 * 864e5), invitedBy: u.id } });
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  await audit(db, { userId: u.id, action: "user.invite", entity: "Invitation", summary: `Invited ${d.email} as ${d.role}` });
  // Link is shown once to the owner; CSC Command does not email it.
  return { message: "Invitation created. Copy the link below and send it yourself — it works once and expires in 7 days.", data: { link: `${origin}/invite/${token}` } };
});

const cancelInviteImpl = action("users.manage", z.object({ id: zReq("id") }), async (d, u) => {
  const i = await db.invitation.delete({ where: { id: d.id } });
  await audit(db, { userId: u.id, action: "user.invite.cancel", entity: "Invitation", summary: `Cancelled invitation for ${i.email}` });
  return "Invitation cancelled.";
});

const setUserRoleImpl = action("users.manage", z.object({ id: zReq("id"), role: z.enum(["OWNER", "MANAGER", "VIEWER"]) }), async (d, u) => {
  if (d.id === u.id && d.role !== "OWNER") {
    const owners = await db.user.count({ where: { role: "OWNER", active: true } });
    if (owners <= 1) throw new UserError("You are the only owner. Make someone else an owner first.");
  }
  const t = await db.user.update({ where: { id: d.id }, data: { role: d.role } });
  await db.session.deleteMany({ where: { userId: d.id } });
  await audit(db, { userId: u.id, action: "user.role", entity: "User", entityId: t.id, summary: `Changed ${t.email} to ${d.role}` });
  return "Role updated. They'll need to sign in again.";
});

const setUserActiveImpl = action("users.manage", z.object({ id: zReq("id"), active: zBool }), async (d, u) => {
  if (d.id === u.id) throw new UserError("You can't deactivate your own account.");
  if (d.active && (await db.user.count({ where: { active: true } })) >= MAX_ACTIVE_USERS) throw new UserError(`Only ${MAX_ACTIVE_USERS} active users are allowed.`);
  const t = await db.user.update({ where: { id: d.id }, data: { active: d.active } });
  if (!d.active) await db.session.deleteMany({ where: { userId: d.id } });
  await audit(db, { userId: u.id, action: d.active ? "user.activate" : "user.deactivate", entity: "User", entityId: t.id, summary: `${d.active ? "Reactivated" : "Deactivated"} ${t.email}` });
  return d.active ? "User reactivated." : "User deactivated and signed out.";
});

/** Account recovery: owner issues a one-time reset link (an invitation for the same email that replaces the password). */
const resetUserAccessImpl = action("users.manage", z.object({ id: zReq("id") }), async (d, u) => {
  const t = await db.user.findUniqueOrThrow({ where: { id: d.id } });
  const token = newToken();
  await db.user.update({ where: { id: t.id }, data: { mfaSecret: null, mfaPending: null, failedLogins: 0, lockedUntil: null } });
  await db.session.deleteMany({ where: { userId: t.id } });
  await db.invitation.create({ data: { email: t.email, role: t.role, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 864e5), invitedBy: u.id } });
  const h = await headers();
  await audit(db, { userId: u.id, action: "user.reset", entity: "User", entityId: t.id, summary: `Issued account recovery link for ${t.email}` });
  return { message: "Recovery link created (valid 24 hours). Their two-factor setting was cleared.", data: { link: `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}/invite/${token}?reset=1` } };
});

const saveRolePermissionsImpl = action("users.manage", z.object({ role: z.enum(["MANAGER", "VIEWER"]), perms: z.array(z.string()).optional().default([]) }), async (d, u) => {
  const valid = d.perms.filter((p): p is Permission => p in PERMISSIONS && !LOCKED_OWNER.includes(p as Permission));
  await db.$transaction([db.rolePermission.deleteMany({ where: { role: d.role as Role } }), db.rolePermission.createMany({ data: valid.map((permission) => ({ role: d.role as Role, permission })) })]);
  await db.session.deleteMany({ where: { user: { role: d.role as Role } } });
  await audit(db, { userId: u.id, action: "roles.update", entity: "RolePermission", summary: `Updated ${d.role} permissions (${valid.length})`, data: { valid } });
  return `${d.role.toLowerCase()} permissions saved.`;
});

const resetRolePermissionsImpl = action("users.manage", z.object({ role: z.enum(["MANAGER", "VIEWER"]) }), async (d, u) => {
  await db.rolePermission.deleteMany({ where: { role: d.role } });
  await audit(db, { userId: u.id, action: "roles.reset", entity: "RolePermission", summary: `Reset ${d.role} permissions to defaults` });
  return `Restored default ${d.role.toLowerCase()} permissions (${DEFAULT_ROLE_PERMISSIONS[d.role].length}).`;
});

// ── Notifications ──
const markReadImpl = action(null, z.object({ id: zOpt(40) }), async (d, u) => {
  const where = { readAt: null, OR: [{ userId: null }, { userId: u.id }], ...(d.id ? { id: d.id } : {}) };
  await db.notification.updateMany({ where, data: { readAt: new Date() } });
  return d.id ? undefined : "All notifications marked as read.";
});

const refreshNowImpl = action(null, z.object({}), async () => {
  await refreshAlerts(true);
  return "Alerts refreshed.";
});

// ── Documents ──
const CATEGORIES = ["SPEC", "SDS", "COA", "PURCHASE", "SHIPPING", "QUOTE", "INVOICE", "REPORT", "OTHER"] as const;
const uploadDocumentImpl = action(
  "documents.manage",
  z.object({ file: z.instanceof(File, { message: "Choose a file" }), title: zOpt(200), category: z.enum(CATEGORIES), confidential: zBool, productId: zOpt(40), customerId: zOpt(40), supplierId: zOpt(40), shipmentId: zOpt(40), replacesId: zOpt(40) }),
  async (d, u) => {
    const buf = Buffer.from(await d.file.arrayBuffer());
    validateUpload(d.file, buf);
    const { key, sha256: hash } = await saveFile(buf);
    let version = 1;
    if (d.replacesId) {
      const prev = await db.document.update({ where: { id: d.replacesId }, data: { archived: true } });
      version = prev.version + 1;
    }
    const doc = await db.document.create({
      data: { title: d.title || d.file.name.replace(/\.[^.]+$/, ""), category: d.category, fileName: d.file.name.slice(0, 200), mimeType: d.file.type, size: d.file.size, storageKey: key, sha256: hash, version, previousId: d.replacesId, confidential: d.confidential, productId: d.productId, customerId: d.customerId, supplierId: d.supplierId, shipmentId: d.shipmentId, uploadedBy: u.id },
    });
    await audit(db, { userId: u.id, action: "document.upload", entity: "Document", entityId: doc.id, summary: `Uploaded ${doc.category} “${doc.title}”${version > 1 ? ` (v${version})` : ""}` });
    return "Document uploaded.";
  },
);

const archiveDocumentImpl = action("documents.manage", z.object({ id: zReq("id"), archived: zBool }), async (d, u) => {
  const doc = await db.document.update({ where: { id: d.id }, data: { archived: d.archived } });
  await audit(db, { userId: u.id, action: d.archived ? "document.archive" : "document.restore", entity: "Document", entityId: doc.id, summary: `${d.archived ? "Archived" : "Restored"} “${doc.title}”` });
  return d.archived ? "Document archived." : "Document restored.";
});

// Server Action exports must be async functions (Next.js requirement for "use server" files).
export async function saveCompany(prev: ActionState, fd: FormData) {
  return saveCompanyImpl(prev, fd);
}
export async function savePolicies(prev: ActionState, fd: FormData) {
  return savePoliciesImpl(prev, fd);
}
export async function completeSetup(prev: ActionState, fd: FormData) {
  return completeSetupImpl(prev, fd);
}
export async function inviteUser(prev: ActionState, fd: FormData) {
  return inviteUserImpl(prev, fd);
}
export async function cancelInvite(prev: ActionState, fd: FormData) {
  return cancelInviteImpl(prev, fd);
}
export async function setUserRole(prev: ActionState, fd: FormData) {
  return setUserRoleImpl(prev, fd);
}
export async function setUserActive(prev: ActionState, fd: FormData) {
  return setUserActiveImpl(prev, fd);
}
export async function resetUserAccess(prev: ActionState, fd: FormData) {
  return resetUserAccessImpl(prev, fd);
}
export async function saveRolePermissions(prev: ActionState, fd: FormData) {
  return saveRolePermissionsImpl(prev, fd);
}
export async function resetRolePermissions(prev: ActionState, fd: FormData) {
  return resetRolePermissionsImpl(prev, fd);
}
export async function markRead(prev: ActionState, fd: FormData) {
  return markReadImpl(prev, fd);
}
export async function refreshNow(prev: ActionState, fd: FormData) {
  return refreshNowImpl(prev, fd);
}
export async function uploadDocument(prev: ActionState, fd: FormData) {
  return uploadDocumentImpl(prev, fd);
}
export async function archiveDocument(prev: ActionState, fd: FormData) {
  return archiveDocumentImpl(prev, fd);
}
