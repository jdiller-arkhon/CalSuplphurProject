import { NextResponse } from "next/server";
import { destroySession } from "@/server/auth";

export async function POST(req: Request) {
  // Same-origin check (CSRF): browsers always send Origin on POST.
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) return new NextResponse("Forbidden", { status: 403 });
  await destroySession();
  return NextResponse.redirect(new URL("/login", req.url), 303);
}
