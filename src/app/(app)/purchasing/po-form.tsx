"use client";

import { ActionForm, Submit, FieldError, type ActionFn } from "@/components/forms";
import { LineEditor, type LineProduct } from "@/components/line-editor";
import { Field, Input, Select, Textarea } from "@/components/ui";

export function POForm({ action, products, suppliers, supplierId }: { action: ActionFn; products: LineProduct[]; suppliers: { id: string; name: string }[]; supplierId?: string }) {
  return (
    <ActionForm action={action} className="space-y-6">
      {(s) => (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Supplier *" name="supplierId" className="sm:col-span-2">
              <Select name="supplierId" required defaultValue={supplierId ?? ""}>
                <option value="">Select supplier…</option>
                {suppliers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </Select>
              <FieldError state={s} name="supplierId" />
            </Field>
            <Field label="Expected delivery" name="expectedAt"><Input type="date" name="expectedAt" /></Field>
          </div>
          <div>
            <div className="mb-2 text-[12px] font-medium text-fg-2">Lines</div>
            <LineEditor products={products} priceLabel="Unit cost" showMargin={false} costField />
          </div>
          <Field label="Notes" name="notes"><Textarea name="notes" /></Field>
          <div className="flex justify-end border-t border-line pt-5"><Submit>Create draft PO</Submit></div>
        </>
      )}
    </ActionForm>
  );
}
