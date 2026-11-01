import Link from "next/link";
import { CheckCircle2, Circle, ArrowRight } from "lucide-react";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { Card, PageHeader, cx, buttonClass } from "@/components/ui";
import { ActionButton } from "@/components/form-modal";
import { completeSetup } from "@/server/actions/admin";
import { getSettingTyped } from "@/server/services/settings";

export const metadata = { title: "Setup" };

export default async function Setup() {
  await requireUser("settings.manage");
  const [co, products, locations, lots, policySet, customers, suppliers, users, reports, imports] = await Promise.all([
    getSettingTyped("company.profile"),
    db.product.count(),
    db.location.count(),
    db.inventoryLot.count(),
    db.appSetting.findUnique({ where: { key: "pricing.defaultMinMarginPct" } }),
    db.customer.count(),
    db.supplier.count(),
    db.user.count({ where: { active: true } }),
    db.reportRun.count(),
    db.importRun.count(),
  ]);
  const steps = [
    { done: true, title: "Create the owner account", body: "Done — you're signed in as the owner.", href: "/settings/security", cta: "Turn on two-factor sign-in" },
    { done: !!co.name, title: "Company information", body: "Name, address and contact details printed on quotes and reports.", href: "/settings", cta: "Edit company profile" },
    { done: products > 0, title: "Add products", body: "Each grade you store or sell, with its unit, cost and minimum margin. You can import a spreadsheet.", href: products ? "/products" : "/products/new", cta: products ? `${products} added — review` : "Add a product", alt: { href: "/settings/import", label: "Import from Excel" } },
    { done: locations > 0, title: "Add storage locations", body: "Plant storage, pads, terminals and berths, with capacity.", href: "/inventory/locations", cta: locations ? `${locations} added — review` : "Add locations" },
    { done: lots > 0, title: "Enter beginning inventory", body: "Current tons on hand by location and lot, with their cost.", href: "/inventory?action=receive", cta: lots ? `${lots} lots — review` : "Receive inventory", alt: { href: "/settings/import", label: "Import from Excel" } },
    { done: !!policySet, title: "Set pricing rules", body: "Default minimum margin, quote validity and standard terms.", href: "/settings", cta: "Set policies" },
    { done: customers > 0 && suppliers > 0, title: "Add customers and suppliers", body: `${customers} customer(s), ${suppliers} supplier(s) so far.`, href: customers ? "/suppliers/new" : "/customers/new", cta: customers ? "Add a supplier" : "Add a customer", alt: { href: "/settings/import", label: "Import from Excel" } },
    { done: users > 1, title: "Invite your team", body: "Up to two more people, as Manager or Viewer.", href: "/settings/users", cta: "Invite users" },
    { done: reports > 0, title: "Generate your first report", body: "A PowerPoint or Excel report from your own records.", href: "/reports", cta: "Open reports" },
  ];
  const done = steps.filter((s) => s.done).length;
  return (
    <>
      <PageHeader title="Guided setup" description="Work through these steps to load your real data. Nothing here creates sample records." crumbs={[{ label: "Overview", href: "/" }, { label: "Setup" }]} actions={<ActionButton action={completeSetup} hidden={{}} size="md" variant={done === steps.length ? "gold" : "secondary"}>{done === steps.length ? "Finish setup" : "Hide setup reminder"}</ActionButton>} />
      <div className="mb-6 flex items-center gap-4">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2"><div className="h-2 rounded-full bg-gradient-to-r from-accent to-gold transition-all" style={{ width: `${(done / steps.length) * 100}%` }} /></div>
        <span className="num text-sm font-medium text-fg-2">{done} of {steps.length} done</span>
      </div>
      <Card pad={false}>
        <ol className="divide-y divide-line">
          {steps.map((s, i) => (
            <li key={s.title} className={cx("flex flex-wrap items-center gap-4 px-5 py-4", s.done && "bg-pos-soft/20")}>
              {s.done ? <CheckCircle2 size={22} className="shrink-0 text-pos" /> : <Circle size={22} className="shrink-0 text-line-strong" />}
              <div className="min-w-[240px] flex-1">
                <div className="font-medium"><span className="num mr-2 text-fg-3">{i + 1}.</span>{s.title}</div>
                <div className="text-sm text-fg-2">{s.body}</div>
              </div>
              {s.alt && !s.done && <Link href={s.alt.href} className={buttonClass("ghost", "sm")}>{s.alt.label}</Link>}
              <Link href={s.href} className={buttonClass(s.done ? "secondary" : "primary", "sm")}>{s.cta} <ArrowRight size={13} /></Link>
            </li>
          ))}
        </ol>
      </Card>
      {imports > 0 && <p className="mt-4 text-sm text-fg-3">{imports} spreadsheet import(s) recorded — see Settings → Import data for history.</p>}
    </>
  );
}
