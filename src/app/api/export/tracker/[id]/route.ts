import { NextResponse } from "next/server";
import { authorize, AuthError } from "@/server/auth";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { compatible, convertUnits } from "@/lib/units";

const cell = (v: string) => { const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let u;
  try { u = await authorize("tracking.use"); } catch (e) { return NextResponse.json({ error: e instanceof AuthError ? e.message : "Not authorized" }, { status: 403 }); }
  const { id } = await params;
  const t = await db.tracker.findUnique({ where: { id }, include: { entries: { orderBy: { at: "asc" } } } });
  if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const units = await db.unitOfMeasure.findMany();
  const want = new URL(req.url).searchParams.get("unit") ?? t.unitCode;
  const unit = compatible(want, t.unitCode, units) ? want : t.unitCode;
  const rows = [["Date", `Value (${unit})`, "Entered value", "Entered unit", "Note"].join(",")];
  for (const e of t.entries) rows.push([e.at.toISOString().slice(0, 10), convertUnits(e.value.toString(), t.unitCode, unit, units).toDecimalPlaces(6).toString(), e.enteredValue.toString(), e.enteredUnit, e.note ?? ""].map(cell).join(","));
  await audit(db, { userId: u.id, action: "export.tracker", entity: "Tracker", entityId: t.id, summary: `Exported tracker ${t.name} (CSV)` });
  const name = t.name.replace(/[^\w-]+/g, "-").slice(0, 60);
  return new NextResponse(rows.join("\r\n") + "\r\n", { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}.csv"`, "cache-control": "no-store" } });
}
