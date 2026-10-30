import { requireUser } from "@/server/auth";
import { Card, PageHeader } from "@/components/ui";
import { ProductForm } from "../product-form";

export const metadata = { title: "New product" };
export default async function NewProduct() {
  await requireUser("products.manage");
  return (
    <>
      <PageHeader title="New product" crumbs={[{ label: "Products", href: "/products" }, { label: "New" }]} description="Define a product grade. Inventory is added separately by receiving it into a location and lot." />
      <Card className="max-w-3xl"><ProductForm /></Card>
    </>
  );
}
