import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { Card, PageHeader } from "@/components/ui";
import { PageForm } from "@/components/form-modal";
import { saveSupplier } from "@/server/actions/parties";
import { supplierFields } from "../../../customers/fields";

export default async function EditSupplier({ params }: { params: Promise<{ id: string }> }) {
  await requireUser("suppliers.manage");
  const s = await db.supplier.findUnique({ where: { id: (await params).id } });
  if (!s) notFound();
  return (<><PageHeader title={`Edit ${s.name}`} crumbs={[{ label: "Suppliers", href: "/suppliers" }, { label: s.name, href: `/suppliers/${s.id}` }, { label: "Edit" }]} /><Card className="max-w-3xl"><PageForm action={saveSupplier} fields={supplierFields(s)} hidden={{ id: s.id }} submit="Save changes" /></Card></>);
}
