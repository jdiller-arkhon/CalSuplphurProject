import { MapPin, Plus } from "lucide-react";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { dec, fmtQty } from "@/lib/decimal";
import { Card, PageHeader, Table, Empty, Badge } from "@/components/ui";
import { FormModal, type FieldDef } from "@/components/form-modal";
import { saveLocation } from "@/server/actions/catalog";

export const metadata = { title: "Locations" };
const KINDS = [
  { value: "PLANT", label: "Plant / processing" },
  { value: "TERMINAL", label: "Terminal" },
  { value: "WAREHOUSE", label: "Warehouse / storage" },
  { value: "BERTH", label: "Port berth" },
  { value: "OTHER", label: "Other" },
];

export default async function Locations() {
  await requireUser("products.manage");
  const locs = await db.location.findMany({ orderBy: { code: "asc" }, include: { lots: true } });
  const fields = (l?: (typeof locs)[number]): FieldDef[] => [
    { name: "code", label: "Code", required: true, defaultValue: l?.code, placeholder: "e.g. WIL" },
    { name: "name", label: "Name", required: true, defaultValue: l?.name, placeholder: "e.g. Wilmington plant" },
    { name: "kind", label: "Type", type: "select", required: true, options: KINDS, defaultValue: l?.kind },
    { name: "capacity", label: "Storage capacity (MT)", type: "number", defaultValue: l?.capacity?.toString() ?? "", hint: "Used for utilization. Leave blank if unknown." },
    { name: "address", label: "Address", span: 2, defaultValue: l?.address ?? "" },
  ];
  return (
    <>
      <PageHeader
        title="Storage locations"
        crumbs={[{ label: "Inventory", href: "/inventory" }, { label: "Locations" }]}
        description="Plants, terminals, warehouses and berths where inventory is held."
        actions={<FormModal title="Add location" trigger="Add location" icon={<Plus size={14} />} triggerVariant="primary" triggerSize="md" action={saveLocation} fields={fields()} />}
      />
      <Card pad={false}>
        {locs.length ? (
          <Table head={["Code", "Name", "Type", "On hand (MT)", "Capacity", "Utilization", ""]}>
            {locs.map((l) => {
              const onHand = l.lots.reduce((s, x) => s.plus(dec(x.onHand)), dec(0));
              return (
                <tr key={l.id}>
                  <td className="font-mono text-xs">{l.code}</td>
                  <td className="font-medium">{l.name}</td>
                  <td><Badge>{l.kind}</Badge></td>
                  <td className="num">{fmtQty(onHand)}</td>
                  <td className="num">{l.capacity ? fmtQty(l.capacity) : "—"}</td>
                  <td className="num">{l.capacity && !dec(l.capacity).isZero() ? `${onHand.div(dec(l.capacity)).times(100).toFixed(1)}%` : "—"}</td>
                  <td><FormModal title={`Edit ${l.code}`} trigger="Edit" triggerVariant="ghost" action={saveLocation} hidden={{ id: l.id }} fields={fields(l)} /></td>
                </tr>
              );
            })}
          </Table>
        ) : (
          <Empty icon={MapPin} title="No locations yet">
            The company&apos;s public website describes a plant at 2250 E. Pacific Coast Highway, Wilmington, with storage capacity of over 90,000 metric tons, and vessel loading at Port of Long Beach Berth 214. Add the locations you actually track inventory in.
          </Empty>
        )}
      </Card>
    </>
  );
}
