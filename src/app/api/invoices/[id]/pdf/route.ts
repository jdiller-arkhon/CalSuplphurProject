import { NextResponse } from "next/server";
import { currentUser, can } from "@/server/auth";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { invoicePdf } from "@/server/reports/pdf";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u) return NextResponse.redirect(new URL("/login", req.url));
  if (!can(u, "invoices.view")) return new NextResponse("Forbidden", { status: 403 });
  const { id } = await params;
  const i = await db.invoice.findUnique({ where: { id } });
  if (!i) return new NextResponse("Not found", { status: 404 });
  const buf = await invoicePdf(id);
  await audit(db, { userId: u.id, action: "invoice.pdf", entity: "Invoice", entityId: id, summary: `Downloaded PDF for ${i.number ?? "draft invoice"}` });
  const name = (i.number ?? "draft-invoice").replace(/[^\w-]/g, "");
  return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}.pdf"`, "Cache-Control": "private, no-store" } });
}
