import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { Card, PageHeader } from "@/components/ui";
import { lineProducts, agreedPriceMap } from "@/server/line-products";
import { createQuoteAction } from "@/server/actions/sales";
import { getSettingTyped } from "@/server/services/settings";
import { SalesDocForm } from "../../doc-form";

export const metadata = { title: "New quote" };

export default async function NewQuote({ searchParams }: { searchParams: Promise<{ scenario?: string; customer?: string }> }) {
  await requireUser("quotes.manage");
  const sp = await searchParams;
  const [products, customers, days, terms] = await Promise.all([lineProducts(), db.customer.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, paymentTerms: true } }), getSettingTyped("quotes.defaultValidityDays"), getSettingTyped("quotes.defaultTerms")]);
  const scenario = sp.scenario ? await db.pricingScenario.findUnique({ where: { id: sp.scenario } }) : null;
  const validUntil = new Date(Date.now() + Number(days) * 864e5).toISOString().slice(0, 10);
  return (
    <>
      <PageHeader title="New quote" crumbs={[{ label: "Sales", href: "/sales" }, { label: "New quote" }]} description={scenario ? `From pricing scenario “${scenario.name}”. Cost snapshot is taken from the scenario's landed cost.` : "Prices below a product's minimum margin will require owner approval."} />
      <Card>
        <SalesDocForm
          agreements={await agreedPriceMap()}
          kind="quote"
          action={createQuoteAction}
          products={products}
          customers={customers}
          initial={{
            customerId: scenario?.customerId ?? sp.customer,
            scenarioId: scenario?.id,
            validUntil,
            deliveryTerms: terms.delivery || undefined,
            paymentTerms: terms.payment || undefined,
            lines: scenario?.productId ? [{ productId: scenario.productId, quantity: scenario.quantity.toString(), unitPrice: (scenario.finalPrice ?? scenario.recommendedPrice).toString(), unitCost: scenario.unitCost.toString() }] : undefined,
          }}
        />
      </Card>
    </>
  );
}
