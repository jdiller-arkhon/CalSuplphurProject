import { PageForm, type FieldDef } from "@/components/form-modal";
import { saveProduct } from "@/server/actions/catalog";
import { lookups } from "@/server/lookups";
import type { Product, ProductCategory } from "@prisma/client";

export async function ProductForm({ product }: { product?: Product & { category: ProductCategory | null } }) {
  const l = await lookups();
  const pct = (v: unknown) => (v === null || v === undefined ? "" : String(Number(v) * 100));
  const specs = product?.specifications && typeof product.specifications === "object" ? Object.entries(product.specifications as Record<string, string>).map(([k, v]) => `${k}: ${v}`).join("\n") : "";
  const fields: FieldDef[] = [
    { name: "name", label: "Product name", required: true, defaultValue: product?.name, placeholder: "e.g. Formed sulphur prill" },
    { name: "sku", label: "SKU / internal ID", required: true, defaultValue: product?.sku, placeholder: "e.g. S-PRILL" },
    { name: "categoryName", label: "Category", defaultValue: product?.category?.name, placeholder: "e.g. Formed sulphur", hint: "New categories are created automatically." },
    { name: "grade", label: "Grade", defaultValue: product?.grade ?? "", placeholder: "Confirm with company" },
    { name: "unitCode", label: "Unit of measure", type: "select", required: true, options: l.unitOpts, defaultValue: product?.unitCode ?? "MT", hint: "Quantities and costs are stored per this unit." },
    { name: "defaultSupplierId", label: "Default supplier", type: "select", options: l.supplierOpts, defaultValue: product?.defaultSupplierId ?? "" },
    { name: "defaultCost", label: "Default cost per unit (USD)", type: "number", defaultValue: product?.defaultCost?.toString() ?? "", hint: "Used for quotes only when no stock cost exists." },
    { name: "standardPrice", label: "Standard selling price (USD)", type: "number", defaultValue: product?.standardPrice?.toString() ?? "" },
    { name: "minMarginPct", label: "Minimum acceptable gross margin (%)", type: "number", defaultValue: pct(product?.minMarginPct), hint: "Quotes below this require owner approval. Blank = company default." },
    { name: "reorderPoint", label: "Reorder point (available qty)", type: "number", defaultValue: product?.reorderPoint?.toString() ?? "" },
    { name: "description", label: "Description", type: "textarea", defaultValue: product?.description ?? "" },
    { name: "specifications", label: "Specifications", type: "textarea", defaultValue: specs, placeholder: "One per line, e.g.\nPurity: (per certificate)\nMoisture: (per certificate)", hint: "Key: value per line. Enter only values confirmed by lab/COA." },
  ];
  return <PageForm action={saveProduct} fields={fields} hidden={product ? { id: product.id } : undefined} submit={product ? "Save changes" : "Create product"} />;
}
