"use client";

import { useRouter } from "next/navigation";
import { ActionForm, Submit, type ActionFn } from "@/components/forms";
import { Field, Input, Select, Textarea, cx, inputClass } from "@/components/ui";

export type ShipLine = { salesOrderLineId?: string; lotId: string; label: string; lot: string; unit: string; max: string; reserved: boolean };
const MODES = ["TRUCK", "CONTAINER", "VESSEL", "RAIL", "OTHER"];
const FREIGHT = [["FREIGHT", "Freight"], ["FUEL_SURCHARGE", "Fuel surcharge"], ["LOADING", "Loading"], ["UNLOADING", "Unloading"], ["DEMURRAGE", "Demurrage"], ["OTHER", "Other"]];

export function ShipmentForm({ action, orders, orderId, lines, destination, origin }: { action: ActionFn; orders: { id: string; label: string }[]; orderId?: string; lines: ShipLine[]; destination?: string; origin?: string }) {
  const router = useRouter();
  return (
    <ActionForm action={action} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Sales order" name="orderId" className="lg:col-span-2">
          <Select name="orderId" value={orderId ?? ""} onChange={(e) => router.push(e.target.value ? `/logistics/new?order=${e.target.value}` : "/logistics/new")}>
            <option value="">— Not for a sales order —</option>
            {orders.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </Select>
        </Field>
        <Field label="Mode *" name="mode"><Select name="mode" required defaultValue="TRUCK">{MODES.map((m) => <option key={m}>{m}</option>)}</Select></Field>
        <Field label="Scheduled date" name="scheduledAt"><Input type="date" name="scheduledAt" /></Field>
        <Field label="Carrier" name="carrier"><Input name="carrier" placeholder="Own fleet, carrier name…" /></Field>
        <Field label="Vehicle / container / vessel ref" name="vehicleRef"><Input name="vehicleRef" /></Field>
        <Field label="Origin" name="origin"><Input name="origin" defaultValue={origin} /></Field>
        <Field label="Destination" name="destination"><Input name="destination" defaultValue={destination} /></Field>
      </div>
      <div>
        <div className="mb-2 text-[12px] font-medium text-fg-2">Quantities</div>
        {lines.length ? (
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="border-b border-line bg-surface-2 text-left text-[11px] font-semibold uppercase tracking-wider text-fg-3"><th className="px-3 py-2">Product</th><th className="px-3 py-2">Lot</th><th className="px-3 py-2 text-right">{orderId ? "Reserved, unplanned" : "Available"}</th><th className="w-40 px-3 py-2">Ship qty</th></tr></thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td className="px-3 py-2">{l.label}{l.salesOrderLineId && <input type="hidden" name={`lines.${i}.salesOrderLineId`} value={l.salesOrderLineId} />}<input type="hidden" name={`lines.${i}.lotId`} value={l.lotId} /></td>
                    <td className="px-3 py-2 text-xs">{l.lot}</td>
                    <td className="num px-3 py-2 text-right text-fg-2">{l.max} {l.unit}</td>
                    <td className="px-3 py-2"><input name={`lines.${i}.quantity`} inputMode="decimal" aria-label={`Quantity from ${l.lot}`} className={cx(inputClass, "num h-8 text-right")} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">{orderId ? "This order has no active reservations. Allocate inventory on the order first." : "No available stock."}</p>
        )}
      </div>
      <div>
        <div className="mb-2 text-[12px] font-medium text-fg-2">Freight & handling costs (optional, can be added later)</div>
        <div className="grid gap-2 sm:grid-cols-3">
          {FREIGHT.slice(0, 3).map(([k, label], i) => (
            <div key={k} className="flex items-center gap-2">
              <input type="hidden" name={`freight.${i}.category`} value={k} />
              <span className="w-28 text-sm text-fg-2">{label}</span>
              <input name={`freight.${i}.amount`} inputMode="decimal" placeholder="$0.00" aria-label={`${label} amount`} className={cx(inputClass, "num h-8 text-right")} />
            </div>
          ))}
        </div>
      </div>
      <Field label="Notes" name="notes"><Textarea name="notes" /></Field>
      <div className="flex justify-end border-t border-line pt-5"><Submit>Plan shipment</Submit></div>
    </ActionForm>
  );
}
