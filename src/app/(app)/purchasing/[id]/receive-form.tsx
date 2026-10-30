"use client";

import { ActionForm, Submit, type ActionFn } from "@/components/forms";
import { Field, Input, cx, inputClass } from "@/components/ui";

export function ReceiveForm({ action, poId, lines, locations, today }: { action: ActionFn; poId: string; lines: { id: string; name: string; unit: string; open: string; unitCost: string }[]; locations: { value: string; label: string }[]; today: string }) {
  return (
    <ActionForm action={action} className="space-y-4" resetOnSuccess>
      <input type="hidden" name="poId" value={poId} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Receipt date" name="receivedAt"><Input type="date" name="receivedAt" defaultValue={today} /></Field>
        <Field label="Reference" name="reference" className="sm:col-span-2"><Input name="reference" placeholder="Scale ticket, BOL, delivery note…" /></Field>
      </div>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[720px] text-sm">
          <thead><tr className="border-b border-line bg-surface-2 text-left text-[11px] font-semibold uppercase tracking-wider text-fg-3"><th className="px-3 py-2">Product</th><th className="px-3 py-2 text-right">Open</th><th className="w-32 px-3 py-2">Receive qty</th><th className="w-48 px-3 py-2">Location</th><th className="w-36 px-3 py-2">Lot number</th><th className="w-32 px-3 py-2">Unit cost</th></tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.id} className="border-b border-line last:border-0">
                <td className="px-3 py-2 font-medium">{l.name}<input type="hidden" name={`lines.${i}.poLineId`} value={l.id} /></td>
                <td className="num px-3 py-2 text-right text-fg-2">{l.open} {l.unit}</td>
                <td className="px-3 py-2"><input name={`lines.${i}.quantity`} inputMode="decimal" aria-label={`Quantity for ${l.name}`} className={cx(inputClass, "num h-8 text-right")} /></td>
                <td className="px-3 py-2"><select name={`lines.${i}.locationId`} aria-label="Location" className={cx(inputClass, "h-8")} defaultValue={locations[0]?.value}>{locations.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></td>
                <td className="px-3 py-2"><input name={`lines.${i}.lotNumber`} aria-label="Lot number" className={cx(inputClass, "h-8")} /></td>
                <td className="px-3 py-2"><input name={`lines.${i}.unitCost`} inputMode="decimal" defaultValue={l.unitCost} aria-label="Unit cost" className={cx(inputClass, "num h-8 text-right")} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-fg-3">Leave quantity blank for lines not in this delivery. Over-receipts are allowed and flagged.</p>
      <div className="flex justify-end"><Submit>Post receipt</Submit></div>
    </ActionForm>
  );
}
