import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Plus, Trash2, FileText } from "lucide-react";
import { requireUser, can } from "@/server/auth";
import { db } from "@/server/db";
import { D, dec, fmtMoney, fmtPct, fmtQty, type Dec } from "@/lib/decimal";
import { Card, PageHeader, LinkButton, Table, StatusBadge, Stat, Badge, Kpi } from "@/components/ui";
import { FormModal, ActionButton } from "@/components/form-modal";
import { addContact, removeContact, setCustomerActive, addAgreement } from "@/server/actions/parties";
import { lookups, today } from "@/server/lookups";

export default async function CustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser("customers.view");
  const c = await db.customer.findUnique({
    where: { id: (await params).id },
    include: {
      contacts: { orderBy: [{ primary: "desc" }, { name: "asc" }] },
      quotes: { include: { lines: true }, orderBy: { createdAt: "desc" }, take: 20 },
      orders: { include: { lines: { include: { product: true, shipmentLines: { where: { posted: true } } } }, shipments: { include: { freightCosts: true } } }, orderBy: { orderDate: "desc" } },
      agreements: { orderBy: { validFrom: "desc" } },
      documents: { where: { archived: false }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!c) notFound();
  const l = await lookups();
  const fin = can(u, "finance.view");
  const manage = can(u, "customers.manage");
  // Lifetime actuals from dispatched shipment lines.
  let rev = new D(0), cogs = new D(0), freight = new D(0), qty = new D(0);
  const productMix = new Map<string, { name: string; qty: Dec; rev: Dec }>();
  for (const o of c.orders) {
    for (const line of o.lines)
      for (const s of line.shipmentLines) {
        const q = dec(s.quantity);
        rev = rev.plus(q.times(dec(line.unitPrice)));
        cogs = cogs.plus(q.times(dec(s.unitCost)));
        qty = qty.plus(q);
        const pm = productMix.get(line.productId) ?? { name: line.product.name, qty: new D(0), rev: new D(0) };
        pm.qty = pm.qty.plus(q);
        pm.rev = pm.rev.plus(q.times(dec(line.unitPrice)));
        productMix.set(line.productId, pm);
      }
    freight = freight.plus(o.shipments.filter((s) => s.status !== "CANCELLED" && s.shippedAt).flatMap((s) => s.freightCosts).reduce((t, f) => t.plus(dec(f.amount)), new D(0)));
  }
  const gp = rev.minus(cogs).minus(freight);
  const products = new Map(l.products.map((p) => [p.id, p.name]));
  return (
    <>
      <PageHeader
        title={c.name}
        crumbs={[{ label: "Customers", href: "/customers" }, { label: c.name }]}
        description={[c.code, c.paymentTerms, c.currency].filter(Boolean).join(" · ")}
        actions={
          <>
            {manage && <ActionButton action={setCustomerActive} hidden={{ id: c.id, active: c.active ? "false" : "true" }} size="md">{c.active ? "Deactivate" : "Reactivate"}</ActionButton>}
            {manage && <LinkButton variant="secondary" href={`/customers/${c.id}/edit`}><Pencil size={14} /> Edit</LinkButton>}
            {can(u, "quotes.manage") && <LinkButton href={`/sales/quotes/new?customer=${c.id}`}><Plus size={14} /> New quote</LinkButton>}
          </>
        }
      />
      {fin && (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
          <Kpi label="Shipped quantity" value={fmtQty(qty)} />
          <Kpi label="Revenue (lifetime)" value={fmtMoney(rev, c.currency, 0)} />
          <Kpi label="Gross profit" value={fmtMoney(gp, c.currency, 0)} tone={gp.lt(0) ? "crit" : undefined} sub="After COGS & freight" />
          <Kpi label="Gross margin" value={fmtPct(rev.isZero() ? null : gp.div(rev))} />
          <Kpi label="Orders" value={c.orders.length} sub={`${c.quotes.length} quotes`} />
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Account">
          <Stat label="Status" value={c.active ? <Badge tone="pos">active</Badge> : <Badge>inactive</Badge>} />
          <Stat label="Email" value={c.email ?? "—"} />
          <Stat label="Phone" value={c.phone ?? "—"} />
          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-1">
            <div><div className="text-xs text-fg-3">Billing</div><div className="whitespace-pre-wrap">{c.billingAddress ?? "—"}</div></div>
            <div><div className="text-xs text-fg-3">Shipping</div><div className="whitespace-pre-wrap">{c.shippingAddress ?? "—"}</div></div>
          </div>
          {c.notes && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-xs text-fg-2">{c.notes}</p>}
        </Card>
        <Card title="Contacts" action={manage && <FormModal title="Add contact" trigger="Add" icon={<Plus size={13} />} triggerVariant="ghost" action={addContact} hidden={{ customerId: c.id }} fields={[{ name: "name", label: "Name", required: true }, { name: "title", label: "Title" }, { name: "email", label: "Email", type: "email" }, { name: "phone", label: "Phone", type: "tel" }, { name: "primary", label: "Primary contact", type: "checkbox" }]} />}>
          {c.contacts.length ? (
            <ul className="space-y-3">
              {c.contacts.map((p) => (
                <li key={p.id} className="flex items-start justify-between gap-2 text-sm">
                  <div>
                    <div className="font-medium">{p.name} {p.primary && <Badge tone="gold">primary</Badge>}</div>
                    <div className="text-xs text-fg-2">{[p.title, p.email, p.phone].filter(Boolean).join(" · ")}</div>
                  </div>
                  {manage && <ActionButton action={removeContact} hidden={{ id: p.id }} variant="ghost" confirm={`Remove ${p.name}?`}><Trash2 size={13} aria-label="Remove contact" /></ActionButton>}
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-fg-2">No contacts.</p>}
        </Card>
        <Card title="Pricing agreements" action={can(u, "pricing.rules") && <FormModal title="Add pricing agreement" trigger="Add" icon={<Plus size={13} />} triggerVariant="ghost" action={addAgreement} hidden={{ customerId: c.id }} fields={[{ name: "productId", label: "Product", type: "select", required: true, options: l.productOpts }, { name: "unitPrice", label: "Agreed unit price (USD)", type: "number", required: true }, { name: "validFrom", label: "Valid from", type: "date", required: true, defaultValue: today() }, { name: "validTo", label: "Valid to", type: "date" }, { name: "notes", label: "Notes", span: 2 }]} />}>
          {c.agreements.length ? (
            <ul className="space-y-2 text-sm">
              {c.agreements.map((a) => (
                <li key={a.id} className="flex justify-between gap-2">
                  <span>{products.get(a.productId) ?? "Product"}<span className="block text-xs text-fg-3">{a.validFrom.toLocaleDateString("en-US")} – {a.validTo?.toLocaleDateString("en-US") ?? "open"}</span></span>
                  <span className="num font-medium">{fmtMoney(a.unitPrice)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-fg-2">No agreed prices recorded.</p>}
          {productMix.size > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-fg-3">Purchased products</div>
              {[...productMix.values()].map((p) => <div key={p.name} className="flex justify-between text-sm"><span>{p.name}</span><span className="num text-fg-2">{fmtQty(p.qty)}</span></div>)}
            </div>
          )}
        </Card>
      </div>
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
        <Card title="Orders" pad={false}>
          <Table head={["Order", "Date", "Value", "Status"]}>
            {c.orders.map((o) => (
              <tr key={o.id}>
                <td><Link className="text-accent" href={`/sales/orders/${o.id}`}>{o.number}</Link></td>
                <td className="text-fg-2">{o.orderDate.toLocaleDateString("en-US")}</td>
                <td className="num">{fmtMoney(o.lines.reduce((s, x) => s.plus(dec(x.quantity).times(dec(x.unitPrice))), new D(0)), o.currency)}</td>
                <td><StatusBadge status={o.status} /></td>
              </tr>
            ))}
          </Table>
          {!c.orders.length && <p className="px-5 py-4 text-sm text-fg-2">No orders.</p>}
        </Card>
        <Card title="Quotes" pad={false}>
          <Table head={["Quote", "Created", "Value", "Status"]}>
            {c.quotes.map((q) => (
              <tr key={q.id}>
                <td><Link className="text-accent" href={`/sales/quotes/${q.id}`}>{q.number}</Link></td>
                <td className="text-fg-2">{q.createdAt.toLocaleDateString("en-US")}</td>
                <td className="num">{fmtMoney(q.lines.reduce((s, x) => s.plus(dec(x.quantity).times(dec(x.unitPrice))), new D(0)), q.currency)}</td>
                <td><StatusBadge status={q.status} /></td>
              </tr>
            ))}
          </Table>
          {!c.quotes.length && <p className="px-5 py-4 text-sm text-fg-2">No quotes.</p>}
        </Card>
      </div>
      <Card className="mt-6" title="Documents" action={<Link href={`/documents?customerId=${c.id}`} className="text-xs font-medium text-accent">Manage →</Link>}>
        {c.documents.filter((d) => !d.confidential || can(u, "documents.confidential")).map((d) => <a key={d.id} className="mr-4 inline-flex items-center gap-1.5 text-sm text-accent" href={`/api/documents/${d.id}`}><FileText size={13} />{d.title}</a>)}
        {!c.documents.length && <p className="text-sm text-fg-2">No documents linked.</p>}
      </Card>
    </>
  );
}
