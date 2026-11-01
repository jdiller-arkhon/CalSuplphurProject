"use client";

import { ActionForm, Submit, Modal, FieldError, type ActionFn } from "@/components/forms";
import { Button, Field, Input, Select, buttonClass } from "@/components/ui";
import { Upload } from "lucide-react";

const CATS = [["SDS", "Safety Data Sheet"], ["COA", "Certificate of Analysis"], ["SPEC", "Product specification"], ["SHIPPING", "Shipping (BOL, weight ticket, export)"], ["PURCHASE", "Purchase document"], ["QUOTE", "Quote"], ["INVOICE", "Invoice"], ["REPORT", "Internal report"], ["OTHER", "Other"]];
type Opt = { value: string; label: string };

export function UploadDocument({ action, products, customers, suppliers, shipments, preset, replaces, label = "Upload" }: { action: ActionFn; products: Opt[]; customers: Opt[]; suppliers: Opt[]; shipments: Opt[]; preset?: Record<string, string>; replaces?: { id: string; title: string; category: string }; label?: string }) {
  return (
    <Modal title={replaces ? `New version of “${replaces.title}”` : "Upload document"} trigger={(open) => <Button onClick={open} variant={replaces ? "ghost" : "primary"} size={replaces ? "sm" : "md"}>{!replaces && <Upload size={14} />}{label}</Button>}>
      {(close) => (
        <ActionForm action={action} onSuccess={close} className="space-y-4">
          {(s) => (
            <>
              {replaces && <input type="hidden" name="replacesId" value={replaces.id} />}
              <Field label="File *" name="file" hint="PDF, image, Excel, Word, PowerPoint, CSV or text — up to 25 MB."><input id="file" name="file" type="file" required className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-accent-soft file:px-3 file:py-1.5 file:text-accent" /><FieldError state={s} name="file" /></Field>
              <Field label="Title" name="title" hint="Defaults to the file name."><Input name="title" defaultValue={replaces?.title} /></Field>
              <Field label="Category *" name="category"><Select name="category" required defaultValue={replaces?.category ?? preset?.category ?? "SDS"}>{CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
              {!replaces && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {([["productId", "Product", products], ["customerId", "Customer", customers], ["supplierId", "Supplier", suppliers], ["shipmentId", "Shipment", shipments]] as const).map(([n, l, o]) => (
                    <Field key={n} label={`Link to ${l.toLowerCase()}`} name={n}><Select name={n} defaultValue={preset?.[n] ?? ""}><option value="">— None —</option>{o.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</Select></Field>
                  ))}
                </div>
              )}
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confidential" className="accent-[var(--accent)]" /> Confidential (owner and manager only)</label>
              <div className="flex justify-end gap-2 border-t border-line pt-4"><button type="button" className={buttonClass("ghost")} onClick={close}>Cancel</button><Submit>Upload</Submit></div>
            </>
          )}
        </ActionForm>
      )}
    </Modal>
  );
}
