import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { Card, PageHeader } from "@/components/ui";
import { lineProducts } from "@/server/line-products";
import { createPOAction } from "@/server/actions/ops";
import { POForm } from "../po-form";

export const metadata = { title: "New purchase order" };
export default async function NewPO({ searchParams }: { searchParams: Promise<{ supplier?: string }> }) {
  await requireUser("purchasing.manage");
  const [products, suppliers] = await Promise.all([lineProducts(), db.supplier.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } })]);
  return (
    <>
      <PageHeader title="New purchase order" crumbs={[{ label: "Purchasing", href: "/purchasing" }, { label: "New" }]} description="Saved as a draft. Issue it when sent to the supplier." />
      <Card><POForm action={createPOAction} products={products} suppliers={suppliers} supplierId={(await searchParams).supplier} /></Card>
    </>
  );
}
