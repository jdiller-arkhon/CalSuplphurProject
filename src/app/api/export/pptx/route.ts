import { NextResponse } from "next/server";
import { currentUser, can } from "@/server/auth";
import { db } from "@/server/db";
import { audit, log } from "@/server/audit";
import { buildDeck, PPTX_TEMPLATES, ALL_SECTIONS, type PptxTemplate, type Section } from "@/server/reports/pptx";
import { parsePeriod } from "@/server/services/metrics";

export async function GET(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.redirect(new URL("/login", req.url));
  if (!can(u, "reports.generate")) return new NextResponse("Forbidden", { status: 403 });
  const url = new URL(req.url);
  const sp = Object.fromEntries(url.searchParams);
  const template = sp.template as PptxTemplate;
  if (template !== "custom" && !(template in PPTX_TEMPLATES)) return new NextResponse("Unknown template", { status: 400 });
  const sections = url.searchParams.getAll("s").filter((s): s is Section => (ALL_SECTIONS as readonly string[]).includes(s));
  const p = parsePeriod(sp);
  try {
    const buf = await buildDeck(template, u, p, sections);
    const fileName = `CSC-${template}-${new Date().toISOString().slice(0, 10)}.pptx`;
    await db.reportRun.create({ data: { template, format: "PPTX", periodStart: p.from, periodEnd: p.to, fileName, createdBy: u.id } });
    await audit(db, { userId: u.id, action: "report.pptx", entity: "ReportRun", summary: `Generated ${template} presentation (${p.label})` });
    return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation", "Content-Disposition": `attachment; filename="${fileName}"`, "Cache-Control": "no-store" } });
  } catch (e) {
    log("error", "pptx export failed", { err: String(e) });
    return new NextResponse("Export failed", { status: 500 });
  }
}
