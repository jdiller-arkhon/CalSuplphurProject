import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { today } from "@/server/lookups";
import { dec } from "@/lib/decimal";
import { PageHeader } from "@/components/ui";
import { InvoiceEditor } from "../editor";
import { editorData } from "../data";

export const metadata = { title: "New invoice" };

export default async function NewInvoice({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("invoices.manage");
  const sp = await searchParams;
  const d = await editorData();
  const issue = today();
  const due = new Date(issue + "T00:00:00Z"); due.setUTCDate(due.getUTCDate() + d.defaults.dueDays);
  const cust = d.customers.find((c) => c.id === sp.customer);
  // Optional: start from a sales order's lines (when Quotes & sales orders is switched on).
  const order = sp.order ? await db.salesOrder.findUnique({ where: { id: sp.order }, include: { lines: { include: { product: true } }, customer: true } }) : null;
  return (
    <>
      <PageHeader title="New invoice" crumbs={[{ label: "Invoices", href: "/invoices" }, { label: "New" }]} description="Pick the customer, add what they bought, and issue. Choose a stock lot on product lines to take the product out of inventory at the same time." />
      <InvoiceEditor customers={d.customers} products={d.products} lots={d.lots} agreed={d.agreed} defaultDueDays={d.defaults.dueDays}
        initial={{
          customerId: order?.customerId ?? cust?.id ?? "", issueDate: issue, dueDate: due.toISOString().slice(0, 10),
          paymentTerms: order?.paymentTerms ?? cust?.paymentTerms ?? d.defaults.paymentTerms, customerPo: "", taxPct: dec(d.defaults.taxPct).times(100).toString(),
          billTo: (order?.customer ?? cust)?.billingAddress ?? "", shipTo: (order?.customer ?? cust)?.shippingAddress ?? "", notes: d.defaults.footer,
          lines: order ? order.lines.map((l) => ({ productId: l.productId, description: l.product.name, quantity: l.quantity.toString(), unitLabel: l.product.unitCode, unitPrice: l.unitPrice.toString(), lotId: "" })) : [],
        }} />
    </>
  );
}
