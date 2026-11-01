import { Presentation, FileSpreadsheet, FileText } from "lucide-react";
import { requireUser, can } from "@/server/auth";
import { db } from "@/server/db";
import { Card, PageHeader, Table, Badge } from "@/components/ui";
import { PPTX_TEMPLATES, ALL_SECTIONS } from "@/server/reports/pptx";
import { XLSX_REPORTS } from "@/server/reports/xlsx";
import type { Permission } from "@/server/permissions";
import { ReportForm } from "./report-form";

export const metadata = { title: "Reports" };
const SECTION_LABELS: Record<string, string> = { summary: "Executive summary", financial: "Revenue & profit trend", products: "Product performance", customers: "Customer performance", pipeline: "Open quotes & orders", inventory: "Stock position", aging: "Aging & movement", operations: "Logistics by mode", production: "Pelletizer production", insights: "Findings & actions", definitions: "Definitions appendix" };

export default async function Reports() {
  const u = await requireUser("reports.generate");
  const runs = await db.reportRun.findMany({ orderBy: { createdAt: "desc" }, take: 15 });
  const users = new Map((await db.user.findMany({ select: { id: true, name: true } })).map((x) => [x.id, x.name]));
  const xlsx = Object.entries(XLSX_REPORTS).filter(([, v]) => can(u, v.perm as Permission));
  return (
    <>
      <PageHeader title="Reports" description="Presentation-ready PowerPoint decks and formatted Excel workbooks, built from current records. Charts and tables in the decks are editable." />
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Card title={<span className="flex items-center gap-2"><Presentation size={15} className="text-gold" />PowerPoint presentations</span>}>
          <ReportForm kind="pptx" templates={[...Object.entries(PPTX_TEMPLATES).map(([k, v]) => ({ value: k, label: v.label, sections: [...v.sections] })), { value: "custom", label: "Custom report builder", sections: [] }]} sections={ALL_SECTIONS.map((s) => ({ value: s, label: SECTION_LABELS[s] }))} />
        </Card>
        <Card title={<span className="flex items-center gap-2"><FileSpreadsheet size={15} className="text-pos" />Excel workbooks</span>}>
          <ReportForm kind="xlsx" templates={xlsx.map(([k, v]) => ({ value: k, label: v.label, sections: [] }))} sections={[]} />
        </Card>
      </div>
      <Card className="mt-6" title="Recently generated" pad={false}>
        <Table head={["When", "Report", "Format", "Period", "By"]}>
          {runs.map((r) => (
            <tr key={r.id}>
              <td className="text-fg-2">{r.createdAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</td>
              <td>{PPTX_TEMPLATES[r.template as keyof typeof PPTX_TEMPLATES]?.label ?? XLSX_REPORTS[r.template as keyof typeof XLSX_REPORTS]?.label ?? r.template}</td>
              <td><Badge tone={r.format === "PPTX" ? "gold" : "pos"}>{r.format}</Badge></td>
              <td className="text-fg-2">{r.periodStart && r.periodEnd ? `${r.periodStart.toLocaleDateString("en-US")} – ${r.periodEnd.toLocaleDateString("en-US")}` : "—"}</td>
              <td className="text-fg-2">{r.createdBy ? users.get(r.createdBy) : ""}</td>
            </tr>
          ))}
        </Table>
        {!runs.length && <p className="flex items-center gap-2 px-5 py-4 text-sm text-fg-2"><FileText size={14} />Nothing generated yet.</p>}
      </Card>
    </>
  );
}
