import { NextResponse } from "next/server";
import { currentUser, can } from "@/server/auth";
import { db } from "@/server/db";
import { audit, log } from "@/server/audit";
import { buildWorkbook, XLSX_REPORTS, type XlsxReport } from "@/server/reports/xlsx";
import { parsePeriod } from "@/server/services/metrics";

export async function GET(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.redirect(new URL("/login", req.url));
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const report = sp.report as XlsxReport;
  const def = XLSX_REPORTS[report];
  if (!def) return new NextResponse("Unknown report", { status: 400 });
  if (!can(u, "reports.generate") || !can(u, def.perm)) return new NextResponse("Forbidden", { status: 403 });
  const p = parsePeriod(sp);
  try {
    const buf = await buildWorkbook(report, u, p);
    const fileName = `CSC-${report}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    await db.reportRun.create({ data: { template: report, format: "XLSX", periodStart: p.from, periodEnd: p.to, fileName, createdBy: u.id } });
    await audit(db, { userId: u.id, action: "report.xlsx", entity: "ReportRun", summary: `Exported ${def.label} (Excel)` });
    return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${fileName}"`, "Cache-Control": "no-store" } });
  } catch (e) {
    log("error", "xlsx export failed", { err: String(e) });
    return new NextResponse("Export failed", { status: 500 });
  }
}
