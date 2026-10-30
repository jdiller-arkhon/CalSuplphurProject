import { requireUser } from "@/server/auth";
import { Card, PageHeader } from "@/components/ui";
import { PageForm } from "@/components/form-modal";
import { saveCustomer } from "@/server/actions/parties";
import { customerFields } from "../fields";

export const metadata = { title: "New customer" };
export default async function NewCustomer() {
  await requireUser("customers.manage");
  return (<><PageHeader title="New customer" crumbs={[{ label: "Customers", href: "/customers" }, { label: "New" }]} /><Card className="max-w-3xl"><PageForm action={saveCustomer} fields={customerFields()} submit="Create customer" /></Card></>);
}
