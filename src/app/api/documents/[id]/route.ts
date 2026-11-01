import { NextResponse } from "next/server";
import { currentUser, can } from "@/server/auth";
import { db } from "@/server/db";
import { readStored } from "@/server/storage";
import { audit } from "@/server/audit";

/** Authorized download. Confidential files require documents.confidential. Inline only for PDFs/images. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u || !can(u, "documents.view")) return new NextResponse("Not found", { status: 404 });
  const doc = await db.document.findUnique({ where: { id: (await params).id } });
  if (!doc || (doc.confidential && !can(u, "documents.confidential"))) return new NextResponse("Not found", { status: 404 });
  const buf = await readStored(doc.storageKey);
  const inline = new URL(req.url).searchParams.get("inline") === "1" && /^(application\/pdf|image\/(png|jpeg|webp))$/.test(doc.mimeType);
  await audit(db, { userId: u.id, action: "document.download", entity: "Document", entityId: doc.id, summary: `Downloaded “${doc.title}”` });
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
