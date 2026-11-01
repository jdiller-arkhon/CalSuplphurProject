import Link from "next/link";
import { FolderLock, FileText, Download, Eye } from "lucide-react";
import { requireUser, can } from "@/server/auth";
import { db } from "@/server/db";
import { Card, PageHeader, Table, Empty, Badge, Input, cx } from "@/components/ui";
import { ActionButton } from "@/components/form-modal";
import { uploadDocument, archiveDocument } from "@/server/actions/admin";
import { lookups } from "@/server/lookups";
import { UploadDocument } from "./upload-form";

export const metadata = { title: "Documents" };
const CATS = ["SDS", "COA", "SPEC", "SHIPPING", "PURCHASE", "QUOTE", "INVOICE", "REPORT", "OTHER"];
const size = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export default async function Documents({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requireUser("documents.view");
  const sp = await searchParams;
  const conf = can(u, "documents.confidential");
  const manage = can(u, "documents.manage");
  const where = {
    archived: sp.archived === "1",
    ...(conf ? {} : { confidential: false }),
    ...(sp.category ? { category: sp.category } : {}),
    ...(sp.productId ? { productId: sp.productId } : {}),
    ...(sp.customerId ? { customerId: sp.customerId } : {}),
    ...(sp.supplierId ? { supplierId: sp.supplierId } : {}),
    ...(sp.shipmentId ? { shipmentId: sp.shipmentId } : {}),
    ...(sp.q ? { OR: [{ title: { contains: sp.q, mode: "insensitive" as const } }, { fileName: { contains: sp.q, mode: "insensitive" as const } }] } : {}),
  };
  const [docs, l, shipments, users] = await Promise.all([
    db.document.findMany({ where, include: { product: true, customer: true, supplier: true, shipment: true }, orderBy: { createdAt: "desc" }, take: 300 }),
    lookups(),
    db.shipment.findMany({ orderBy: { createdAt: "desc" }, take: 100, select: { id: true, number: true } }),
    db.user.findMany({ select: { id: true, name: true } }),
  ]);
  const who = new Map(users.map((x) => [x.id, x.name]));
  const preset = Object.fromEntries(["productId", "customerId", "supplierId", "shipmentId", "category"].filter((k) => sp[k]).map((k) => [k, sp[k]!]));
  const opts = { products: l.productOpts, customers: l.customerOpts, suppliers: l.supplierOpts, shipments: shipments.map((s) => ({ value: s.id, label: s.number })) };
  const link = (c: string | undefined) => { const n = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "category") as [string, string][]); if (c) n.set("category", c); return `/documents?${n}`; };
  return (
    <>
      <PageHeader title="Documents" description="Safety data sheets, certificates of analysis, specs, shipping papers and internal reports. Files are private and only open for signed-in users with access." actions={manage ? <UploadDocument action={uploadDocument} {...opts} preset={preset} /> : undefined} />
      <div className="mb-4 flex flex-wrap gap-1.5">
        <Link href={link(undefined)} className={cx("rounded-full border px-3 py-1 text-xs font-medium", !sp.category ? "border-accent bg-accent-soft text-accent" : "border-line text-fg-2 hover:text-fg")}>All</Link>
        {CATS.map((c) => <Link key={c} href={link(c)} className={cx("rounded-full border px-3 py-1 text-xs font-medium", sp.category === c ? "border-accent bg-accent-soft text-accent" : "border-line text-fg-2 hover:text-fg")}>{c}</Link>)}
      </div>
      <Card pad={false}>
        <form className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
          {Object.entries(preset).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <Input name="q" defaultValue={sp.q} placeholder="Search title or file name…" className="max-w-xs" aria-label="Search documents" />
          <label className="flex items-center gap-2 text-sm text-fg-2"><input type="checkbox" name="archived" value="1" defaultChecked={sp.archived === "1"} className="accent-[var(--accent)]" />Archived</label>
          <button className="text-sm font-medium text-accent">Apply</button>
          {Object.keys(preset).some((k) => k !== "category") && <Link href="/documents" className="text-sm text-fg-3 hover:text-fg">Clear filters</Link>}
        </form>
        {docs.length ? (
          <Table head={["Document", "Category", "Linked to", "Version", "Size", "Uploaded", ""]}>
            {docs.map((d) => {
              const viewable = /^(application\/pdf|image\/)/.test(d.mimeType);
              const linked = [d.product && ["Product", d.product.name, `/products/${d.product.id}`], d.customer && ["Customer", d.customer.name, `/customers/${d.customer.id}`], d.supplier && ["Supplier", d.supplier.name, `/suppliers/${d.supplier.id}`], d.shipment && ["Shipment", d.shipment.number, `/logistics/${d.shipment.id}`]].filter(Boolean) as string[][];
              return (
                <tr key={d.id}>
                  <td><div className="flex items-center gap-2"><FileText size={15} className="shrink-0 text-accent" /><span className="max-w-[260px] truncate font-medium">{d.title}</span>{d.confidential && <Badge tone="gold">confidential</Badge>}</div><div className="pl-6 text-xs text-fg-3">{d.fileName}</div></td>
                  <td><Badge>{d.category}</Badge></td>
                  <td className="text-sm">{linked.length ? linked.map(([t, n, h]) => <Link key={h} href={h} className="mr-2 text-accent">{n}</Link>) : <span className="text-fg-3">—</span>}</td>
                  <td className="num">v{d.version}</td>
                  <td className="num text-fg-2">{size(d.size)}</td>
                  <td className="text-fg-2">{d.createdAt.toLocaleDateString("en-US")}<div className="text-xs text-fg-3">{d.uploadedBy ? who.get(d.uploadedBy) : ""}</div></td>
                  <td>
                    <div className="row-actions flex items-center justify-end gap-1">
                      {viewable && <a href={`/api/documents/${d.id}?inline=1`} target="_blank" rel="noopener" className="rounded-md p-1.5 text-fg-2 hover:bg-surface-2" title="Preview" aria-label="Preview"><Eye size={14} /></a>}
                      <a href={`/api/documents/${d.id}`} className="rounded-md p-1.5 text-fg-2 hover:bg-surface-2" title="Download" aria-label="Download"><Download size={14} /></a>
                      {manage && !d.archived && <UploadDocument action={uploadDocument} {...opts} replaces={{ id: d.id, title: d.title, category: d.category }} label="New version" />}
                      {manage && <ActionButton action={archiveDocument} hidden={{ id: d.id, archived: d.archived ? "false" : "true" }} variant="ghost">{d.archived ? "Restore" : "Archive"}</ActionButton>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </Table>
        ) : (
          <Empty icon={FolderLock} title={sp.q || sp.category ? "No documents match" : "No documents yet"}>Upload safety data sheets and certificates of analysis for each product, and shipping papers for each shipment. Products without an SDS show a reminder in notifications.</Empty>
        )}
      </Card>
    </>
  );
}
