import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { Card, PageHeader } from "@/components/ui";
import { PageForm } from "@/components/form-modal";
import { saveCustomer } from "@/server/actions/parties";
import { customerFields } from "../../fields";

export default async function EditCustomer({ params }: { params: Promise<{ id: string }> }) {
  await requireUser("customers.manage");
  const c = await db.customer.findUnique({ where: { id: (await params).id } });
  if (!c) notFound();
  return (<><PageHeader title={`Edit ${c.name}`} crumbs={[{ label: "Customers", href: "/customers" }, { label: c.name, href: `/customers/${c.id}` }, { label: "Edit" }]} /><Card className="max-w-3xl"><PageForm action={saveCustomer} fields={customerFields(c)} hidden={{ id: c.id }} submit="Save changes" /></Card></>);
}
