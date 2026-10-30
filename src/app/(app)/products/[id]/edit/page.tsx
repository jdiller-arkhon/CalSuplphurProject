import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { Card, PageHeader } from "@/components/ui";
import { ProductForm } from "../../product-form";

export default async function EditProduct({ params }: { params: Promise<{ id: string }> }) {
  await requireUser("products.manage");
  const p = await db.product.findUnique({ where: { id: (await params).id }, include: { category: true } });
  if (!p) notFound();
  return (
    <>
      <PageHeader title={`Edit ${p.name}`} crumbs={[{ label: "Products", href: "/products" }, { label: p.name, href: `/products/${p.id}` }, { label: "Edit" }]} />
      <Card className="max-w-3xl"><ProductForm product={p} /></Card>
    </>
  );
}
