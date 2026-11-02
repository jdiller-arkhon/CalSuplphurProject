import { NextResponse } from "next/server";
import { currentUser } from "@/server/auth";
import { db } from "@/server/db";
import { getSetting } from "@/server/services/settings";
import { readStored } from "@/server/storage";

export async function GET() {
  if (!(await currentUser())) return new NextResponse("Not signed in", { status: 401 });
  const logo = (await getSetting(db, "company.logo")) as { key: string; mime: string } | null;
  if (!logo) return new NextResponse("No logo", { status: 404 });
  const buf = await readStored(logo.key);
  return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": logo.mime, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=300" } });
}
