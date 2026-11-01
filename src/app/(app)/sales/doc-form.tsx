"use client";

import { useState } from "react";

import { ActionForm, Submit, FieldError, type ActionFn } from "@/components/forms";
import { LineEditor, type LineInit, type LineProduct } from "@/components/line-editor";
import { Field, Input, Select, Textarea } from "@/components/ui";

export function SalesDocForm({ kind, action, products, customers, agreements, initial }: { kind: "quote" | "order"; action: ActionFn; products: LineProduct[]; customers: { id: string; name: string; paymentTerms: string | null }[]; agreements?: Record<string, Record<string, string>>; initial: { customerId?: string; scenarioId?: string; validUntil?: string; deliveryTerms?: string; paymentTerms?: string; notes?: string; lines?: LineInit[] } }) {
  const [customerId, setCustomerId] = useState(initial.customerId ?? "");
  return (
    <ActionForm action={action} className="space-y-6">
      {(s) => (
        <>
          {initial.scenarioId && <input type="hidden" name="scenarioId" value={initial.scenarioId} />}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Customer *" name="customerId" className="lg:col-span-2">
              <Select name="customerId" required value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">Select customer…</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <FieldError state={s} name="customerId" />
            </Field>
            {kind === "quote" ? (
              <Field label="Valid until *" name="validUntil"><Input type="date" name="validUntil" required defaultValue={initial.validUntil} /><FieldError state={s} name="validUntil" /></Field>
            ) : (
              <Field label="Requested delivery" name="requestedDate"><Input type="date" name="requestedDate" /></Field>
            )}
            <div />
            <Field label="Delivery terms" name="deliveryTerms" className="lg:col-span-2"><Input name="deliveryTerms" defaultValue={initial.deliveryTerms} placeholder="e.g. FOB plant, delivered, FAS vessel (confirm Incoterms)" /></Field>
            <Field label="Payment terms" name="paymentTerms" className="lg:col-span-2"><Input name="paymentTerms" defaultValue={initial.paymentTerms} placeholder="Defaults to the customer's terms" /></Field>
          </div>
          <div>
            <div className="mb-2 text-[12px] font-medium text-fg-2">Lines</div>
            <LineEditor products={products} initial={initial.lines} agreedPrices={agreements?.[customerId]} />
            <FieldError state={s} name="lines" />
          </div>
          <Field label="Notes (printed on the document)" name="notes"><Textarea name="notes" defaultValue={initial.notes} /></Field>
          <div className="flex justify-end border-t border-line pt-5"><Submit>{kind === "quote" ? "Create quote" : "Create order"}</Submit></div>
        </>
      )}
    </ActionForm>
  );
}
