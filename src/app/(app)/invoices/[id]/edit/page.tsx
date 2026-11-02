import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { isoDate } from "@/server/lookups";
import { dec } from "@/lib/decimal";
import { PageHeader } from "@/components/ui";
import { InvoiceEditor } from "../../editor";
import { editorData } from "../../data";

export const metadata = { title: "Edit invoice" };

export default async function EditInvoice({ params }: { params: Promise<{ id: string }> }) {
  await requireUser("invoices.manage");
  const { id } = await params;
  const i = await db.invoice.findUnique({ where: { id }, include: { lines: { orderBy: { position: "asc" } } } });
  if (!i) notFound();
  if (i.status !== "DRAFT") redirect(`/invoices/${id}`);
  const d = await editorData();
  return (
    <>
      <PageHeader title="Edit draft invoice" crumbs={[{ label: "Invoices", href: "/invoices" }, { label: "Draft", href: `/invoices/${id}` }, { label: "Edit" }]} />
      <InvoiceEditor customers={d.customers} products={d.products} lots={d.lots} agreed={d.agreed} defaultDueDays={d.defaults.dueDays}
        initial={{ id, customerId: i.customerId, issueDate: isoDate(i.issueDate), dueDate: isoDate(i.dueDate), paymentTerms: i.paymentTerms ?? "", customerPo: i.customerPo ?? "", taxPct: dec(i.taxPct).times(100).toString(), billTo: i.billTo ?? "", shipTo: i.shipTo ?? "", notes: i.notes ?? "",
          lines: i.lines.map((l) => ({ productId: l.productId ?? "", description: l.description, quantity: l.quantity.toString(), unitLabel: l.unitLabel ?? "", unitPrice: l.unitPrice.toString(), lotId: l.lotId ?? "" })) }} />
    </>
  );
}
