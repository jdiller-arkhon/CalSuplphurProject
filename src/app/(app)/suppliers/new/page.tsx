import { requireUser } from "@/server/auth";
import { Card, PageHeader } from "@/components/ui";
import { PageForm } from "@/components/form-modal";
import { saveSupplier } from "@/server/actions/parties";
import { supplierFields } from "../../customers/fields";

export const metadata = { title: "New supplier" };
export default async function NewSupplier() {
  await requireUser("suppliers.manage");
  return (<><PageHeader title="New supplier" crumbs={[{ label: "Suppliers", href: "/suppliers" }, { label: "New" }]} /><Card className="max-w-3xl"><PageForm action={saveSupplier} fields={supplierFields()} submit="Create supplier" /></Card></>);
}
