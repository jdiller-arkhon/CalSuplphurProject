import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = [/^\/login/, /^\/first-run/, /^\/invite\//, /^\/forbidden/, /^\/_next\//, /^\/favicon/, /^\/api\/health/];

/** Coarse gate: requests without a session cookie never reach app pages or APIs. Full validation happens server-side per request. */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();
  if (!req.cookies.get("csc_session")) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", req.url));
  }
  // Pass the path to server components so page guards can check whether the section is switched on.
  const headers = new Headers(req.headers);
  headers.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers } });
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
