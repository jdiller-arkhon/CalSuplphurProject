import { NextResponse } from "next/server";
import { currentUser, can } from "@/server/auth";
import { IMPORT_KINDS, templateWorkbook, type ImportKind } from "@/server/services/import";

export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const u = await currentUser();
  if (!u || !can(u, "import.run")) return new NextResponse("Forbidden", { status: 403 });
  const { kind } = await params;
  if (!(kind in IMPORT_KINDS)) return new NextResponse("Unknown", { status: 400 });
  const buf = await templateWorkbook(kind as ImportKind);
  return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="CSC-${kind}-import-template.xlsx"` } });
}
