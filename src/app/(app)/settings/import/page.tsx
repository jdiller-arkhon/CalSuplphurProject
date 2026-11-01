import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { Card, Table, Badge } from "@/components/ui";
import { IMPORT_KINDS } from "@/server/services/import";
import { previewImport, runImport } from "@/server/actions/importing";
import { ImportWizard } from "./wizard";

export const metadata = { title: "Import data" };

export default async function ImportPage() {
  await requireUser("import.run");
  const runs = await db.importRun.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
  const users = new Map((await db.user.findMany({ select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const kinds = Object.fromEntries(Object.entries(IMPORT_KINDS).map(([k, v]) => [k, { label: v.label, note: v.note, fields: v.fields.map((f) => ({ key: f.key, label: f.label, required: f.required })) }]));
  return (
    <div className="space-y-6">
      <ImportWizard kinds={kinds} preview={previewImport} run={runImport} />
      <Card title="Import history" pad={false}>
        <Table head={["When", "Type", "File", "Imported", "Skipped", "By"]}>
          {runs.map((r) => {
            const skipped = r.rowsTotal - r.rowsImported;
            return (
              <tr key={r.id}>
                <td className="text-fg-2">{r.createdAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</td>
                <td>{IMPORT_KINDS[r.kind]?.label ?? r.kind}</td>
                <td className="max-w-[260px] truncate">{r.fileName}</td>
                <td className="num">{r.rowsImported}</td>
                <td className="num">{skipped ? <span title={JSON.stringify(r.errors)}><Badge tone="warn">{skipped}</Badge></span> : "0"}</td>
                <td className="text-fg-2">{r.createdBy ? users.get(r.createdBy) : ""}</td>
              </tr>
            );
          })}
        </Table>
        {!runs.length && <p className="px-5 py-4 text-sm text-fg-2">No imports yet.</p>}
      </Card>
    </div>
  );
}
