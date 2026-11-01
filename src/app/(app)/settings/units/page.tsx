import { Trash2 } from "lucide-react";
import { requireUser, can } from "@/server/auth";
import { db } from "@/server/db";
import { dimensionLabel, DIMENSIONS } from "@/lib/units";
import { dec } from "@/lib/decimal";
import { Card, Table, Badge } from "@/components/ui";
import { FormModal, ActionButton } from "@/components/form-modal";
import { saveUnit, deleteUnit } from "@/server/actions/units";

export const metadata = { title: "Units" };
const fmt = (v: string) => { const d = dec(v); return d.gte(1e6) || (d.lt(0.001) && !d.isZero()) ? d.toExponential(4) : d.toDecimalPlaces(8).toString(); };

export default async function UnitsPage() {
  const u = await requireUser();
  const manage = can(u, "products.manage");
  const units = await db.unitOfMeasure.findMany({ orderBy: [{ dimension: "asc" }, { toKg: "asc" }], include: { _count: { select: { products: true, trackers: true, trackerEntries: true, marketRates: true } } } });
  const dims = [...new Set(units.map((x) => x.dimension))];
  const base = (d: string) => units.find((x) => x.dimension === d && dec(x.toKg).eq(1));

  return (
    <div className="space-y-6">
      <Card title="Units of measure" action={manage && (
        <FormModal title="Add a unit" trigger="Add unit" triggerVariant="primary" wide action={saveUnit} submit="Add unit"
          intro="Add any unit your team uses. Pick the kind of measurement and say how it converts, e.g. a 'Bag' of 25 kg, a 'Super sack' of 1,000 kg, a 'Tote' of 1,040 L, or a brand-new kind like 'Pallets'. Units of the same kind convert automatically everywhere."
          fields={[
            { name: "code", label: "Short code", required: true, placeholder: "e.g. BAG25, SACK, TOTE" },
            { name: "name", label: "Name", required: true, placeholder: "e.g. 25 kg bag" },
            { name: "kind", label: "Kind of measurement", type: "select", required: true, options: [...dims.map((d) => ({ value: d, label: dimensionLabel(d) })), { value: "new", label: "Something new (no conversion to other units)…" }], defaultValue: "mass" },
            { name: "newKind", label: "New kind name (only if “something new”)", placeholder: "e.g. Pallets, Shifts, Inspections" },
            { name: "factor", label: "1 of this unit equals…", type: "number", step: "any", required: true, defaultValue: "1" },
            { name: "relativeTo", label: "…of this unit", type: "select", options: units.map((x) => ({ value: x.code, label: `${x.name} (${x.code}) — ${dimensionLabel(x.dimension)}` })), placeholder: "the kind's base unit", hint: "Must be the same kind." },
          ]} />
      )}>
        <p className="text-sm text-fg-2">Every value in CSC Command keeps the unit it was entered in, and converts exactly to any other unit of the same kind. Inventory, sales and purchasing use weight units; trackers and market prices can use any unit.</p>
      </Card>
      {dims.map((d) => (
        <Card key={d} title={<span className="flex items-center gap-2">{dimensionLabel(d)}{DIMENSIONS[d] ? null : <Badge tone="gold">Custom kind</Badge>}</span>} pad={false}>
          <Table head={["Code", "Name", `Equals (${base(d)?.code ?? "base"})`, "Used by", ""]}>
            {units.filter((x) => x.dimension === d).map((x) => {
              const used = Object.values(x._count).reduce((a, b) => a + b, 0);
              return (
                <tr key={x.code}>
                  <td className="num font-semibold">{x.code}</td>
                  <td>{x.name} {x.custom && <Badge tone="accent">Added</Badge>}</td>
                  <td className="num text-fg-2">{fmt(x.toKg.toString())} {base(d)?.code ?? ""}</td>
                  <td className="text-fg-3">{used ? `${used} record${used === 1 ? "" : "s"}` : "—"}</td>
                  <td className="text-right">{manage && x.custom && !used && <ActionButton action={deleteUnit} hidden={{ code: x.code }} variant="ghost" confirm={`Remove unit ${x.code}?`}><Trash2 size={13} /></ActionButton>}</td>
                </tr>
              );
            })}
          </Table>
        </Card>
      ))}
    </div>
  );
}
