import Link from "next/link";
import { Package, Plus, Download } from "lucide-react";
import { requireUser, can } from "@/server/auth";
import { db } from "@/server/db";
import { dec, fmtMoney, fmtPct, fmtQty } from "@/lib/decimal";
import { Card, PageHeader, LinkButton, Table, Empty, Badge, Input } from "@/components/ui";

export const metadata = { title: "Products" };

export default async function Products({ searchParams }: { searchParams: Promise<{ q?: string; archived?: string }> }) {
  const u = await requireUser("inventory.view");
  const sp = await searchParams;
  const q = sp.q?.trim();
  const products = await db.product.findMany({
    where: { active: sp.archived ? false : true, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }, { grade: { contains: q, mode: "insensitive" } }] } : {}) },
    include: { category: true, lots: true },
    orderBy: { name: "asc" },
  });
  const val = can(u, "inventory.value");
  return (
    <>
      <PageHeader
        title="Products"
        description="Product grades, units, cost and margin policy."
        actions={
          <>
            {can(u, "reports.generate") && <LinkButton variant="secondary" href="/api/export/xlsx?report=catalog"><Download size={14} /> Excel</LinkButton>}
            {can(u, "products.manage") && <LinkButton href="/products/new"><Plus size={14} /> Add product</LinkButton>}
          </>
        }
      />
      <Card pad={false}>
        <form className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
          <Input name="q" defaultValue={q} placeholder="Search name, SKU or grade…" className="max-w-xs" aria-label="Search products" />
          <label className="flex items-center gap-2 text-sm text-fg-2">
            <input type="checkbox" name="archived" value="1" defaultChecked={!!sp.archived} className="accent-[var(--accent)]" /> Show archived
          </label>
          <button className="text-sm font-medium text-accent">Apply</button>
        </form>
        {products.length ? (
          <Table head={["Product", "SKU", "Category / grade", "Unit", "On hand", "Available", ...(val ? ["Avg cost", "Std price", "Min margin"] : [])]}>
            {products.map((p) => {
              const onHand = p.lots.reduce((s, l) => s.plus(dec(l.onHand)), dec(0));
              const avail = p.lots.reduce((s, l) => s.plus(dec(l.onHand)).minus(dec(l.reserved)), dec(0));
              const value = p.lots.reduce((s, l) => s.plus(dec(l.onHand).times(dec(l.unitCost))), dec(0));
              const low = p.reorderPoint && avail.lt(dec(p.reorderPoint));
              return (
                <tr key={p.id}>
                  <td>
                    <Link href={`/products/${p.id}`} className="font-medium text-fg hover:text-accent">{p.name}</Link>
                    {!p.active && <span className="ml-2"><Badge>archived</Badge></span>}
                  </td>
                  <td className="font-mono text-xs text-fg-2">{p.sku}</td>
                  <td className="text-fg-2">{[p.category?.name, p.grade].filter(Boolean).join(" · ") || "—"}</td>
                  <td>{p.unitCode}</td>
                  <td className="num">{fmtQty(onHand)}</td>
                  <td className="num">{fmtQty(avail)} {low && <Badge tone="crit">reorder</Badge>}</td>
                  {val && (
                    <>
                      <td className="num">{onHand.gt(0) ? fmtMoney(value.div(onHand)) : "—"}</td>
                      <td className="num">{p.standardPrice ? fmtMoney(p.standardPrice) : "—"}</td>
                      <td className="num">{p.minMarginPct ? fmtPct(p.minMarginPct) : "Default"}</td>
                    </>
                  )}
                </tr>
              );
            })}
          </Table>
        ) : (
          <Empty icon={Package} title={q ? "No products match your search" : "No products yet"} action={!q && can(u, "products.manage") ? <LinkButton href="/products/new">Add your first product</LinkButton> : undefined}>
            {q ? "Try a different term or include archived products." : "Add each product grade the company stores or sells — for example formed (pelletized) sulphur or molten sulphur — with its unit and margin policy."}
          </Empty>
        )}
      </Card>
    </>
  );
}
