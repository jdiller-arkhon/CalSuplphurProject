import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { parsePrefs } from "@/lib/prefs";

/** Post-sign-in landing: sends each user to the start page they chose. */
export default async function Start() {
  const u = await requireUser();
  const row = await db.user.findUnique({ where: { id: u.id }, select: { preferences: true } });
  redirect(parsePrefs(row?.preferences).landing);
}
