import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { D, dec, fmtMoney, fmtQty } from "@/lib/decimal";
import { Card, PageHeader, Table, StatusBadge, Stat, Badge } from "@/components/ui";
import { ActionButton, FormModal } from "@/components/form-modal";
import { issuePOAction, cancelPOAction, amendPOAction, receivePOAction } from "@/server/actions/ops";
import { lookups, today } from "@/server/lookups";
import { ReceiveForm } from "./receive-form";

export default async function PODetail({ params }: { params: Promise<{ id: string }> }) {
  await requireUser("purchasing.manage");
  const p = await db.purchaseOrder.findUnique({
    where: { id: (await params).id },
    include: { supplier: true, lines: { include: { product: true } }, receipts: { include: { lines: { include: { poLine: { include: { product: true } } } } }, orderBy: { receivedAt: "desc" } } },
  });
  if (!p) notFound();
  const l = await lookups();
  const locName = new Map(l.locations.map((x) => [x.id, x.code]));
  const value = p.lines.reduce((s, x) => s.plus(dec(x.quantity).times(dec(x.unitCost))), new D(0));
  const received = p.lines.reduce((s, x) => s.plus(dec(x.receivedQty).times(dec(x.unitCost))), new D(0));
  const open = ["ISSUED", "PARTIALLY_RECEIVED"].includes(p.status);
  const editable = ["DRAFT", "ISSUED", "PARTIALLY_RECEIVED"].includes(p.status);
  return (
    <>
      <PageHeader
        title={`Purchase order ${p.number}`}
        crumbs={[{ label: "Purchasing", href: "/purchasing" }, { label: p.number }]}
        description={<>From <Link className="text-accent" href={`/suppliers/${p.supplierId}`}>{p.supplier.name}</Link>{p.revision > 0 && ` · revision ${p.revision}`}</>}
        actions={
          <>
            {editable && <FormModal title={p.status === "DRAFT" ? "Cancel PO" : "Close PO"} trigger={p.status === "DRAFT" ? "Cancel" : "Close / cancel balance"} triggerVariant="ghost" triggerSize="md" action={cancelPOAction} hidden={{ id: p.id }} submit="Confirm" intro="Quantities already received stay in inventory. The open balance is closed." fields={[{ name: "reason", label: "Reason", required: true }]} />}
            {p.status === "DRAFT" && <ActionButton action={issuePOAction} hidden={{ id: p.id }} variant="primary" size="md">Issue PO</ActionButton>}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Lines" pad={false}>
          <Table head={["Product", "Ordered", "Received", "Open", "Unit cost", "Extended", ""]}>
            {p.lines.map((x) => {
              const openQty = D.max(0, dec(x.quantity).minus(dec(x.receivedQty)));
              const over = dec(x.receivedQty).gt(dec(x.quantity));
              return (
                <tr key={x.id}>
                  <td className="font-medium">{x.product.name}</td>
                  <td className="num">{fmtQty(x.quantity, 3)} {x.product.unitCode}</td>
                  <td className="num">{fmtQty(x.receivedQty, 3)} {over && <Badge tone="warn">over</Badge>}</td>
                  <td className="num font-medium">{fmtQty(openQty, 3)}</td>
                  <td className="num">{fmtMoney(x.unitCost, p.currency)}</td>
                  <td className="num">{fmtMoney(dec(x.quantity).times(dec(x.unitCost)), p.currency)}</td>
                  <td>{editable && <FormModal title={`Amend ${x.product.name}`} trigger="Amend" triggerVariant="ghost" action={amendPOAction} hidden={{ poLineId: x.id }} intro={`Cannot go below the ${fmtQty(x.receivedQty)} already received.`} fields={[{ name: "quantity", label: "Quantity", type: "number", required: true, defaultValue: x.quantity.toString() }, { name: "unitCost", label: "Unit cost", type: "number", required: true, defaultValue: x.unitCost.toString() }, { name: "reason", label: "Reason", required: true, span: 2 }]} />}</td>
                </tr>
              );
            })}
          </Table>
        </Card>
        <Card title="Summary">
          <Stat label="Status" value={<StatusBadge status={p.status} />} />
          <Stat label="Order date" value={p.orderDate.toLocaleDateString("en-US")} />
          <Stat label="Expected" value={p.expectedAt?.toLocaleDateString("en-US") ?? "—"} tone={p.expectedAt && p.expectedAt < new Date() && open ? "crit" : undefined} />
          <Stat label="PO value" value={fmtMoney(value, p.currency)} />
          <Stat label="Received value" value={fmtMoney(received, p.currency)} />
          <Stat label="Open value" value={fmtMoney(D.max(0, value.minus(received)), p.currency)} />
          {p.notes && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-xs text-fg-2">{p.notes}</p>}
        </Card>
      </div>
      {open && (
        <Card className="mt-6" title="Record receipt">
          <ReceiveForm action={receivePOAction} poId={p.id} today={today()} locations={l.locationOpts} lines={p.lines.map((x) => ({ id: x.id, name: x.product.name, unit: x.product.unitCode, open: D.max(0, dec(x.quantity).minus(dec(x.receivedQty))).toString(), unitCost: x.unitCost.toString() }))} />
        </Card>
      )}
      <Card className="mt-6" title="Receipt history" pad={false}>
        {p.receipts.length ? (
          <Table head={["Date", "Reference", "Product", "Location / lot", "Quantity", "Unit cost"]}>
            {p.receipts.flatMap((r) => r.lines.map((x) => (
              <tr key={x.id}>
                <td className="text-fg-2">{r.receivedAt.toLocaleDateString("en-US")}</td>
                <td>{r.reference ?? "—"}</td>
                <td>{x.poLine.product.name}</td>
                <td className="text-xs">{locName.get(x.locationId)}/{x.lotNumber}</td>
                <td className="num">{fmtQty(x.quantity, 3)}</td>
                <td className="num">{fmtMoney(x.unitCost)}</td>
              </tr>
            )))}
          </Table>
        ) : <p className="px-5 py-4 text-sm text-fg-2">Nothing received yet.</p>}
      </Card>
    </>
  );
}
