import { requireUser } from "@/server/auth";
import { enabledModules } from "@/server/modules";
import { getSettingTyped } from "@/server/services/settings";
import { MODULES, MODULE_KEYS, SIMPLE_PRESET } from "@/lib/modules";
import { dec } from "@/lib/decimal";
import { Card, Badge } from "@/components/ui";
import { ActionForm, Submit } from "@/components/forms";
import { PageForm } from "@/components/form-modal";
import { saveModules, saveInvoiceDefaults, uploadLogo, removeLogo } from "@/server/actions/invoices";
import { getSetting } from "@/server/services/settings";
import { db } from "@/server/db";

export const metadata = { title: "Sections" };

export default async function SectionsPage() {
  await requireUser("settings.manage");
  const [on, inv, logo] = await Promise.all([enabledModules(), getSettingTyped("invoices.defaults"), getSetting(db, "company.logo")]);
  const simple = on.length === SIMPLE_PRESET.length && SIMPLE_PRESET.every((k) => on.includes(k));
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Card title="Sections of the app" action={<Badge tone={simple ? "gold" : "neutral"}>{simple ? "Simple setup" : `${on.length} of ${MODULE_KEYS.length} on`}</Badge>}>
        <p className="mb-4 text-sm text-fg-2">Turn off what you don't use and it disappears from the menu, search and home screen for everyone. Nothing is deleted. Turn a section back on and its records are all still there.</p>
        <div className="mb-5 flex flex-wrap gap-2">
          <ActionForm action={saveModules}><input type="hidden" name="preset" value="simple" /><Submit variant={simple ? "gold" : "secondary"} size="sm">Simple: Inventory, Pricing & Invoicing</Submit></ActionForm>
          <ActionForm action={saveModules}><input type="hidden" name="preset" value="all" /><Submit variant="secondary" size="sm">Everything on</Submit></ActionForm>
        </div>
        <ActionForm action={saveModules}>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {MODULE_KEYS.map((k) => {
              const m = MODULES[k];
              const core = "core" in m && m.core;
              const needs = (m.requires as readonly string[]).map((r) => MODULES[r as keyof typeof MODULES].label);
              return (
                <li key={k}>
                  <label className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-surface-2/60">
                    <input type="checkbox" name="modules[]" value={k} defaultChecked={on.includes(k)} disabled={core} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
                    {core && <input type="hidden" name="modules[]" value={k} />}
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{m.label} {core && <span className="text-xs font-normal text-fg-3">(always on)</span>}</span>
                      <span className="block text-xs text-fg-3">{m.description}{needs.length > 0 && ` Also turns on ${needs.join(", ")}.`}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="mt-4"><Submit>Save sections</Submit></div>
        </ActionForm>
      </Card>

      <div className="space-y-6">
      <Card title="Logo on invoices">
        <div className="mb-4 flex h-24 items-center justify-center rounded-xl border border-dashed border-line bg-surface-2/50 p-3">
          {logo ? <img src="/api/company/logo" alt="Company logo" className="max-h-16 max-w-full object-contain" /> : <span className="text-center text-xs text-fg-3">No logo uploaded. Invoices use the CSC monogram.</span>}
        </div>
        <ActionForm action={uploadLogo} className="space-y-3">
          <input type="file" name="logo" accept="image/png,image/jpeg" required className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-accent-soft file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-accent" />
          <p className="text-xs text-fg-3">PNG or JPG, up to 2 MB. A wide logo on a white or transparent background works best.</p>
          <div className="flex gap-2"><Submit size="sm">Upload logo</Submit></div>
        </ActionForm>
        {logo && <ActionForm action={removeLogo} className="mt-2"><Submit size="sm" variant="ghost">Remove logo</Submit></ActionForm>}
      </Card>
      <Card title="Invoice defaults">
        <PageForm action={saveInvoiceDefaults} submit="Save defaults" fields={[
          { name: "paymentTerms", label: "Default payment terms", defaultValue: inv.paymentTerms, placeholder: "Net 30", hint: "A customer's own terms take priority." },
          { name: "dueDays", label: "Days until due (when terms don't say)", type: "number", required: true, defaultValue: String(inv.dueDays) },
          { name: "taxPct", label: "Default sales tax (%)", type: "number", required: true, defaultValue: dec(inv.taxPct).times(100).toString(), hint: "0 if your sales are usually exempt." },
          { name: "remitTo", label: "How to pay (printed on every invoice)", type: "textarea", defaultValue: inv.remitTo, placeholder: "e.g. Check payable to California Sulphur Company, mailing address…\nACH: bank name, routing and account number", span: 2, hint: "Shown in the How to pay box. Only include bank details you're comfortable printing." },
          { name: "footer", label: "Default notes on invoices", type: "textarea", defaultValue: inv.footer, placeholder: "e.g. Thank you for your business.", span: 2 },
        ]} />
      </Card>
      </div>
    </div>
  );
}
