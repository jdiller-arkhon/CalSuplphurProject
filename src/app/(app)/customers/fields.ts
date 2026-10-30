import type { FieldDef } from "@/components/form-modal";
import type { Customer, Supplier } from "@prisma/client";

export const customerFields = (c?: Customer | null): FieldDef[] => [
  { name: "name", label: "Company name", required: true, defaultValue: c?.name },
  { name: "code", label: "Customer code", defaultValue: c?.code ?? "" },
  { name: "email", label: "Email", type: "email", defaultValue: c?.email ?? "" },
  { name: "phone", label: "Phone", type: "tel", defaultValue: c?.phone ?? "" },
  { name: "paymentTerms", label: "Payment terms", defaultValue: c?.paymentTerms ?? "", placeholder: "e.g. Net 30" },
  { name: "currency", label: "Currency", defaultValue: c?.currency ?? "USD", hint: "ISO code. Exchange rates are never assumed." },
  { name: "billingAddress", label: "Billing address", type: "textarea", defaultValue: c?.billingAddress ?? "" },
  { name: "shippingAddress", label: "Shipping / delivery address", type: "textarea", defaultValue: c?.shippingAddress ?? "" },
  { name: "notes", label: "Notes", type: "textarea", defaultValue: c?.notes ?? "" },
];

export const supplierFields = (s?: Supplier | null): FieldDef[] => [
  { name: "name", label: "Supplier name", required: true, defaultValue: s?.name },
  { name: "code", label: "Supplier code", defaultValue: s?.code ?? "" },
  { name: "contactName", label: "Primary contact", defaultValue: s?.contactName ?? "" },
  { name: "email", label: "Email", type: "email", defaultValue: s?.email ?? "" },
  { name: "phone", label: "Phone", type: "tel", defaultValue: s?.phone ?? "" },
  { name: "paymentTerms", label: "Payment terms", defaultValue: s?.paymentTerms ?? "" },
  { name: "address", label: "Address", type: "textarea", defaultValue: s?.address ?? "" },
  { name: "notes", label: "Notes", type: "textarea", defaultValue: s?.notes ?? "" },
];
