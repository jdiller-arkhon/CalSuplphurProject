import Link from "next/link";
import { Download } from "lucide-react";
import { requireUser, can } from "@/server/auth";
import { db } from "@/server/db";
import { dec, fmtMoney, fmtPct, fmtQty } from "@/lib/decimal";
import { Card, PageHeader, Table, LinkButton, Badge } from "@/components/ui";
import { getSettingTyped } from "@/server/services/settings";
import { PricingStudio, type StudioInitial, type StudioProduct } from "./studio";

export const metadata = { title: "Pricing Studio" };

export default async function Pricing({ searchParams }: { searchParams: Promise<{ product?: string; scenario?: string }> }) {
  const u = await requireUser("pricing.use");
  const sp = await searchParams;
  const [products, customers, avg, scenarios, defMin] = await Promise.all([
    db.product.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.customer.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.$queryRaw<{ productId: string; avg: string }[]>`SELECT "productId", (SUM("onHand"*"unitCost")/SUM("onHand"))::text AS avg FROM "InventoryLot" WHERE "onHand" > 0 GROUP BY "productId"`,
    db.pricingScenario.findMany({ take: 30, orderBy: { createdAt: "desc" }, include: { product: true, customer: true, quotes: { select: { id: true, number: true } } } }),
    getSettingTyped("pricing.defaultMinMarginPct"),
  ]);
  const avgMap = new Map(avg.map((a) => [a.productId, a.avg]));
  const sProducts: StudioProduct[] = products.map((p) => ({ id: p.id, name: p.name, unit: p.unitCode, currentCost: avgMap.get(p.id) ?? null, defaultCost: p.defaultCost?.toString() ?? null, minMarginPct: p.minMarginPct?.toString() ?? null }));

  let initial: StudioInitial = { quantity: "1000", shipments: 1, method: "MARGIN", target: "0.2", discountPct: "0", components: [{ category: "ACQUISITION", label: "Product acquisition", basis: "PER_UNIT", amount: "" }, { category: "FREIGHT", label: "Freight", basis: "PER_SHIPMENT", amount: "" }] };
  if (sp.scenario) {
    const s = await db.pricingScenario.findUnique({ where: { id: sp.scenario }, include: { components: { orderBy: { sort: "asc" } } } });
    if (s)
      initial = {
        name: `${s.name} (copy)`,
        productId: s.productId ?? undefined,
        customerId: s.customerId ?? undefined,
        quantity: s.quantity.toString(),
        shipments: s.shipments,
        method: s.method,
        target: s.target.toString(),
        discountPct: s.discountPct.toString(),
        components: s.components.map((c) => ({ category: c.category, label: c.label, basis: c.basis, amount: c.basis === "PERCENT_OF_PRICE" ? dec(c.amount).times(100).toString() : c.amount.toString() })),
      };
  } else if (sp.product) {
    const p = sProducts.find((x) => x.id === sp.product);
    const cost = p?.currentCost ?? p?.defaultCost;
    if (p) initial = { ...initial, productId: p.id, components: [{ category: "ACQUISITION", label: "Product acquisition", basis: "PER_UNIT", amount: cost ? dec(cost).toDecimalPlaces(4).toString() : "" }, ...initial.components.slice(1)] };
  }

  return (
    <>
      <PageHeader
        title="Pricing Studio"
        description="Build landed cost, choose a profit method, and see the price, margin and order profit update live."
        actions={can(u, "reports.generate") ? <LinkButton variant="secondary" href="/api/export/xlsx?report=pricing"><Download size={14} /> Scenarios (Excel)</LinkButton> : undefined}
      />
      <PricingStudio key={sp.scenario ?? sp.product ?? "new"} products={sProducts} customers={customers} initial={initial} defaultMinMargin={defMin} canQuote={can(u, "quotes.manage")} />
      {scenarios.length > 0 && (
      <Card className="mt-6" title="Pricing history" pad={false}>
        {scenarios.length ? (
          <Table head={["Saved", "Scenario", "Product", "Customer", "Qty", "Method", "Landed cost", "Recommended", "Final", "Margin", "Quote", ""]}>
            {scenarios.map((s) => {
              const res = s.result as { grossMarginPct?: string | null; belowMinimumMargin?: boolean };
              return (
                <tr key={s.id}>
                  <td className="whitespace-nowrap text-fg-2">{s.createdAt.toLocaleDateString("en-US")}</td>
                  <td className="font-medium">{s.name}</td>
                  <td>{s.product?.name ?? "—"}</td>
                  <td>{s.customer?.name ?? "—"}</td>
                  <td className="num">{fmtQty(s.quantity)}</td>
                  <td><Badge tone="accent">{s.method.replace("_", " ").toLowerCase()}</Badge></td>
                  <td className="num">{fmtMoney(s.unitCost)}</td>
                  <td className="num">{fmtMoney(s.recommendedPrice)}</td>
                  <td className="num font-medium">{s.finalPrice ? fmtMoney(s.finalPrice) : "—"}</td>
                  <td className="num">{fmtPct(res.grossMarginPct ?? null)} {res.belowMinimumMargin && <Badge tone="warn">below min</Badge>}</td>
                  <td>{s.quotes.map((q) => <Link key={q.id} href={`/sales/quotes/${q.id}`} className="text-accent">{q.number}</Link>)}</td>
                  <td><Link href={`/pricing?scenario=${s.id}`} className="text-xs font-medium text-accent">Duplicate</Link></td>
                </tr>
              );
            })}
          </Table>
        ) : (
          null
        )}
      </Card>
      )}
    </>
  );
}
