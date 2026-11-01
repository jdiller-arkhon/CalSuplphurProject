"use server";
import { z } from "zod";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { authorize } from "../auth";
import { db } from "../db";
import { action } from "../action";
import { parsePrefs, type Prefs } from "@/lib/prefs";

async function store(userId: string, patch: Partial<Prefs>) {
  const row = await db.user.findUnique({ where: { id: userId }, select: { preferences: true } });
  const next = parsePrefs({ ...parsePrefs(row?.preferences), ...patch });
  await db.user.update({ where: { id: userId }, data: { preferences: next } });
  if (patch.theme) (await cookies()).set("theme", next.theme, { path: "/", maxAge: 31536000, sameSite: "lax" });
  revalidatePath("/", "layout");
  return next;
}

const list = (v: unknown) => (Array.isArray(v) ? v : v ? [v] : []);
const bool = (v: unknown) => v === "on" || v === "true";

const savePrefsImpl = action(null, z.record(z.string(), z.unknown()), async (d, u) => {
  await store(u.id, {
    theme: d.theme, accent: d.accent, density: d.density, motion: d.motion, hero: d.hero, textSize: d.textSize,
    landing: d.landing, sidebar: d.sidebar, hiddenNav: list(d.hiddenNav), pinned: list(d.pinned),
    shortcuts: bool(d.shortcuts), greeting: bool(d.greeting),
  } as Partial<Prefs>);
  return { message: "Preferences saved." };
});
export async function savePreferences(prev: Parameters<typeof savePrefsImpl>[0], fd: FormData) { return savePrefsImpl(prev, fd); }

const resetImpl = action(null, z.object({}).passthrough(), async (_d, u) => {
  await db.user.update({ where: { id: u.id }, data: { preferences: {} } });
  (await cookies()).set("theme", "system", { path: "/", maxAge: 31536000, sameSite: "lax" });
  revalidatePath("/", "layout");
  return { message: "Preferences reset to defaults." };
});
export async function resetPreferences(prev: Parameters<typeof resetImpl>[0], fd: FormData) { return resetImpl(prev, fd); }

/** Small patches from inline controls (sidebar collapse, overview layout, pins). */
export async function patchPreferences(patch: Partial<Prefs>) {
  const u = await authorize();
  const allowed: (keyof Prefs)[] = ["sidebar", "overview", "pinned", "theme", "hiddenNav"];
  const clean = Object.fromEntries(Object.entries(patch).filter(([k]) => allowed.includes(k as keyof Prefs))) as Partial<Prefs>;
  const next = await store(u.id, clean);
  return { ok: true, prefs: next };
}
