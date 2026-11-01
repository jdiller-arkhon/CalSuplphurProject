import { redirect } from "next/navigation";
import { requireUser, can } from "@/server/auth";
import { Card } from "@/components/ui";
import { PageForm } from "@/components/form-modal";
import { saveCompany, savePolicies } from "@/server/actions/admin";
import { getSettingTyped } from "@/server/services/settings";
import { lookups } from "@/server/lookups";
import { dec } from "@/lib/decimal";

export const metadata = { title: "Settings" };

export default async function SettingsHome() {
  const u = await requireUser();
  if (!can(u, "settings.manage")) redirect("/settings/security");
  const [co, min, days, terms, neg, alerts, l] = await Promise.all([getSettingTyped("company.profile"), getSettingTyped("pricing.defaultMinMarginPct"), getSettingTyped("quotes.defaultValidityDays"), getSettingTyped("quotes.defaultTerms"), getSettingTyped("inventory.allowNegativeAvailable"), getSettingTyped("alerts.thresholds"), lookups()]);
  return (
    <div className="grid items-start gap-6 xl:grid-cols-2">
      <Card title="Company profile">
        <PageForm action={saveCompany} submit="Save profile" fields={[
          { name: "name", label: "Company name", required: true, defaultValue: co.name || "California Sulphur Company", span: 2 },
          { name: "legalName", label: "Legal name", defaultValue: co.legalName },
          { name: "website", label: "Website", defaultValue: co.website },
          { name: "address", label: "Address (printed on quotes)", type: "textarea", defaultValue: co.address },
          { name: "phone", label: "Phone", defaultValue: co.phone },
          { name: "email", label: "Email", defaultValue: co.email },
          { name: "baseCurrency", label: "Base currency", defaultValue: co.baseCurrency },
          { name: "baseUnit", label: "Main unit", type: "select", required: true, options: l.unitOpts, defaultValue: co.baseUnit },
        ]} />
      </Card>
      <Card title="Pricing, quotes & alerts">
        <PageForm action={savePolicies} submit="Save policies" fields={[
          { name: "defaultMinMarginPct", label: "Default minimum margin (%)", type: "number", required: true, defaultValue: dec(min).times(100).toString(), hint: "Used when a product has no minimum of its own. Quotes below it need owner approval." },
          { name: "quoteValidityDays", label: "Quotes valid for (days)", type: "number", required: true, defaultValue: String(days) },
          { name: "deliveryTerms", label: "Default delivery terms", defaultValue: terms.delivery },
          { name: "paymentTerms", label: "Default payment terms", defaultValue: terms.payment },
          { name: "quoteExpiryDays", label: "Warn before a quote expires (days)", type: "number", required: true, defaultValue: String(alerts.quoteExpiryDays) },
          { name: "overdueShipmentDays", label: "Flag shipments late after (days)", type: "number", required: true, defaultValue: String(alerts.overdueShipmentDays) },
          { name: "allowNegative", label: "Allow reserving or shipping more than is available (not recommended)", type: "checkbox", defaultValue: String(neg), span: 2 },
        ]} />
      </Card>
    </div>
  );
}
