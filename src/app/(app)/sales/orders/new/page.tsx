import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { Card, PageHeader } from "@/components/ui";
import { lineProducts, agreedPriceMap } from "@/server/line-products";
import { createOrderAction } from "@/server/actions/sales";
import { SalesDocForm } from "../../doc-form";

export const metadata = { title: "New sales order" };

export default async function NewOrder() {
  await requireUser("orders.manage");
  const [products, customers] = await Promise.all([lineProducts(), db.customer.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, paymentTerms: true } })]);
  return (
    <>
      <PageHeader title="New sales order" crumbs={[{ label: "Sales", href: "/sales?tab=orders" }, { label: "New order" }]} description="For orders agreed without a formal quote. Estimated cost is snapshotted from current inventory cost." />
      <Card><SalesDocForm agreements={await agreedPriceMap()} kind="order" action={createOrderAction} products={products} customers={customers} initial={{}} /></Card>
    </>
  );
}
