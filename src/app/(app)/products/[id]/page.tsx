import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Calculator, FileText } from "lucide-react";
import { requireUser, can } from "@/server/auth";
import { db } from "@/server/db";
import { dec, fmtMoney, fmtPct, fmtQty } from "@/lib/decimal";
import { Card, PageHeader, LinkButton, Table, Badge, Stat, StatusBadge } from "@/components/ui";
import { ActionButton } from "@/components/form-modal";
import { setProductActive } from "@/server/actions/catalog";
import { getSettingTyped } from "@/server/services/settings";

export default async function ProductDetail({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser("inventory.view");
  const p = await db.product.findUnique({
    where: { id: (await params).id },
    include: {
      category: true,
      defaultSupplier: true,
      lots: { include: { location: true }, orderBy: { receivedAt: "asc" } },
      movements: { take: 25, orderBy: { at: "desc" }, include: { lot: { include: { location: true } } } },
      documents: { where: { archived: false }, orderBy: { createdAt: "desc" } },
      quoteLines: { take: 10, orderBy: { quote: { createdAt: "desc" } }, include: { quote: { include: { customer: true } } } },
    },
  });
  if (!p) notFound();
  const val = can(u, "inventory.value");
  const defMin = await getSettingTyped("pricing.defaultMinMarginPct");
  const onHand = p.lots.reduce((s, l) => s.plus(dec(l.onHand)), dec(0));
  const reserved = p.lots.reduce((s, l) => s.plus(dec(l.reserved)), dec(0));
  const value = p.lots.reduce((s, l) => s.plus(dec(l.onHand).times(dec(l.unitCost))), dec(0));
  const specs = p.specifications && typeof p.specifications === "object" ? Object.entries(p.specifications as Record<string, string>) : [];
  const docs = p.documents.filter((d) => !d.confidential || can(u, "documents.confidential"));
  return (
    <>
      <PageHeader
        title={p.name}
        crumbs={[{ label: "Products", href: "/products" }, { label: p.sku }]}
        description={[p.category?.name, p.grade, p.unitCode].filter(Boolean).join(" · ")}
        actions={
          <>
            {can(u, "pricing.use") && <LinkButton variant="secondary" href={`/pricing?product=${p.id}`}><Calculator size={14} /> Price it</LinkButton>}
            {can(u, "products.manage") && <ActionButton action={setProductActive} hidden={{ id: p.id, active: p.active ? "false" : "true" }} confirm={p.active ? "Archive this product? It will be hidden from new transactions; history is kept." : undefined}>{p.active ? "Archive" : "Restore"}</ActionButton>}
            {can(u, "products.manage") && <LinkButton href={`/products/${p.id}/edit`}><Pencil size={14} /> Edit</LinkButton>}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Position">
          <Stat label="On hand" value={`${fmtQty(onHand, 3)} ${p.unitCode}`} />
          <Stat label="Reserved" value={`${fmtQty(reserved, 3)} ${p.unitCode}`} />
          <Stat label="Available" value={`${fmtQty(onHand.minus(reserved), 3)} ${p.unitCode}`} tone={p.reorderPoint && onHand.minus(reserved).lt(dec(p.reorderPoint)) ? "crit" : undefined} />
          {p.reorderPoint && <Stat label="Reorder point" value={`${fmtQty(p.reorderPoint)} ${p.unitCode}`} />}
          {val && <Stat label="Inventory value" value={fmtMoney(value)} />}
          {val && <Stat label="Weighted avg cost" value={onHand.gt(0) ? `${fmtMoney(value.div(onHand))}/${p.unitCode}` : "—"} />}
        </Card>
        <Card title="Commercial policy">
          {val ? (
            <>
              <Stat label="Default cost" value={p.defaultCost ? fmtMoney(p.defaultCost) : "—"} />
              <Stat label="Standard price" value={p.standardPrice ? fmtMoney(p.standardPrice) : "—"} />
              <Stat label="Minimum margin" value={p.minMarginPct ? fmtPct(p.minMarginPct) : `${fmtPct(defMin)} (default)`} />
            </>
          ) : (
            <p className="text-sm text-fg-2">Pricing details are restricted for your role.</p>
          )}
          <Stat label="Default supplier" value={p.defaultSupplier ? <Link className="text-accent" href={`/suppliers/${p.defaultSupplier.id}`}>{p.defaultSupplier.name}</Link> : "—"} />
          <Stat label="Status" value={p.active ? <Badge tone="pos">active</Badge> : <Badge>archived</Badge>} />
        </Card>
        <Card title="Specifications & documents">
          {specs.length ? (
            <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {specs.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-fg-2">{k}</dt>
                  <dd className="text-fg">{String(v)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mb-4 text-sm text-fg-2">No specifications recorded.</p>
          )}
          <ul className="space-y-1.5">
            {docs.map((d) => (
              <li key={d.id}><a className="flex items-center gap-2 text-sm text-accent" href={`/api/documents/${d.id}`}><FileText size={13} />{d.title} <Badge>{d.category}</Badge></a></li>
            ))}
          </ul>
          <Link href={`/documents?productId=${p.id}`} className="mt-3 inline-block text-xs font-medium text-accent">Manage documents →</Link>
        </Card>
      </div>
      <Card className="mt-6" title="Lots" pad={false}>
        <Table head={["Location", "Lot", "Received", "On hand", "Reserved", "Available", ...(val ? ["Unit cost", "Value"] : [])]}>
          {p.lots.map((l) => (
            <tr key={l.id}>
              <td>{l.location.code} — {l.location.name}</td>
              <td className="font-mono text-xs">{l.lotNumber}</td>
              <td className="text-fg-2">{l.receivedAt.toLocaleDateString("en-US")}</td>
              <td className="num">{fmtQty(l.onHand, 3)}</td>
              <td className="num">{fmtQty(l.reserved, 3)}</td>
              <td className="num">{fmtQty(dec(l.onHand).minus(dec(l.reserved)), 3)}</td>
              {val && <><td className="num">{fmtMoney(l.unitCost, "USD", 4)}</td><td className="num">{fmtMoney(dec(l.onHand).times(dec(l.unitCost)))}</td></>}
            </tr>
          ))}
        </Table>
        {!p.lots.length && <p className="px-5 py-6 text-sm text-fg-2">No inventory has been received for this product. <Link className="text-accent" href="/inventory?action=receive">Receive inventory →</Link></p>}
      </Card>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Recent movements" pad={false}>
          <Table head={["Date", "Type", "Lot", "Qty", "Reference"]}>
            {p.movements.map((m) => (
              <tr key={m.id}>
                <td className="text-fg-2">{m.at.toLocaleDateString("en-US")}</td>
                <td><Badge tone={dec(m.quantity).gte(0) ? "pos" : "warn"}>{m.type.replace("_", " ").toLowerCase()}</Badge></td>
                <td className="text-xs">{m.lot.location.code}/{m.lot.lotNumber}</td>
                <td className="num">{fmtQty(m.quantity, 3)}</td>
                <td className="truncate text-fg-2">{m.reference ?? m.reason ?? ""}</td>
              </tr>
            ))}
          </Table>
        </Card>
        {can(u, "quotes.manage") && (
          <Card title="Recent quotes" pad={false}>
            <Table head={["Quote", "Customer", "Qty", "Price", "Status"]}>
              {p.quoteLines.map((l) => (
                <tr key={l.id}>
                  <td><Link className="text-accent" href={`/sales/quotes/${l.quoteId}`}>{l.quote.number}</Link></td>
                  <td>{l.quote.customer.name}</td>
                  <td className="num">{fmtQty(l.quantity)}</td>
                  <td className="num">{fmtMoney(l.unitPrice)}</td>
                  <td><StatusBadge status={l.quote.status} /></td>
                </tr>
              ))}
            </Table>
          </Card>
        )}
      </div>
    </>
  );
}
