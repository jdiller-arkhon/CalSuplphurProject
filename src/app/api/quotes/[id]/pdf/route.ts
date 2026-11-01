import { NextResponse } from "next/server";
import { currentUser, can } from "@/server/auth";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { quotePdf } from "@/server/reports/pdf";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u) return NextResponse.redirect(new URL("/login", req.url));
  if (!can(u, "quotes.manage")) return new NextResponse("Forbidden", { status: 403 });
  const { id } = await params;
  const q = await db.quote.findUnique({ where: { id } });
  if (!q) return new NextResponse("Not found", { status: 404 });
  const buf = await quotePdf(id);
  await audit(db, { userId: u.id, action: "quote.pdf", entity: "Quote", entityId: id, summary: `Downloaded PDF for ${q.number}` });
  return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${q.number}.pdf"`, "Cache-Control": "private, no-store" } });
}
