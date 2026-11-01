import { NextResponse } from "next/server";
import { currentUser, can } from "@/server/auth";
import { db } from "@/server/db";

/** Global search across records the user is allowed to see. */
export async function GET(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q")?.trim().slice(0, 80) ?? "";
  if (q.length < 2) return NextResponse.json({ results: [] });
  const ci = { contains: q, mode: "insensitive" as const };
  const out: { type: string; id: string; title: string; subtitle?: string; href: string }[] = [];
  const jobs: Promise<void>[] = [];
  if (can(u, "inventory.view")) {
    jobs.push(db.product.findMany({ where: { OR: [{ name: ci }, { sku: ci }, { grade: ci }] }, take: 6 }).then((r) => r.forEach((p) => out.push({ type: "Product", id: p.id, title: p.name, subtitle: p.sku, href: `/products/${p.id}` }))));
    jobs.push(db.inventoryLot.findMany({ where: { lotNumber: ci }, take: 6, include: { product: true, location: true } }).then((r) => r.forEach((l) => out.push({ type: "Lot", id: l.id, title: `${l.lotNumber} · ${l.product.name}`, subtitle: l.location.code, href: `/products/${l.productId}` }))));
  }
  if (can(u, "customers.view")) jobs.push(db.customer.findMany({ where: { OR: [{ name: ci }, { code: ci }, { email: ci }] }, take: 6 }).then((r) => r.forEach((c) => out.push({ type: "Customer", id: c.id, title: c.name, subtitle: c.code ?? undefined, href: `/customers/${c.id}` }))));
  if (can(u, "suppliers.manage")) jobs.push(db.supplier.findMany({ where: { OR: [{ name: ci }, { code: ci }] }, take: 6 }).then((r) => r.forEach((s) => out.push({ type: "Supplier", id: s.id, title: s.name, href: `/suppliers/${s.id}` }))));
  if (can(u, "quotes.manage")) jobs.push(db.quote.findMany({ where: { OR: [{ number: ci }, { customer: { name: ci } }] }, take: 6, include: { customer: true } }).then((r) => r.forEach((x) => out.push({ type: "Quote", id: x.id, title: x.number, subtitle: x.customer.name, href: `/sales/quotes/${x.id}` }))));
  if (can(u, "orders.manage")) jobs.push(db.salesOrder.findMany({ where: { OR: [{ number: ci }, { customer: { name: ci } }] }, take: 6, include: { customer: true } }).then((r) => r.forEach((x) => out.push({ type: "Order", id: x.id, title: x.number, subtitle: x.customer.name, href: `/sales/orders/${x.id}` }))));
  if (can(u, "purchasing.manage")) jobs.push(db.purchaseOrder.findMany({ where: { OR: [{ number: ci }, { supplier: { name: ci } }] }, take: 6, include: { supplier: true } }).then((r) => r.forEach((x) => out.push({ type: "PO", id: x.id, title: x.number, subtitle: x.supplier.name, href: `/purchasing/${x.id}` }))));
  if (can(u, "logistics.manage")) {
    jobs.push(db.shipment.findMany({ where: { OR: [{ number: ci }, { carrier: ci }, { vehicleRef: ci }] }, take: 6 }).then((r) => r.forEach((x) => out.push({ type: "Shipment", id: x.id, title: x.number, subtitle: x.carrier ?? x.mode, href: `/logistics/${x.id}` }))));
    jobs.push(db.scaleTicket.findMany({ where: { OR: [{ number: ci }, { vehicleRef: ci }, { reference: ci }] }, take: 6 }).then((r) => r.forEach((x) => out.push({ type: "Ticket", id: x.id, title: x.number, subtitle: `${x.netQty} net`, href: `/operations?tab=tickets` }))));
  }
  if (can(u, "documents.view")) jobs.push(db.document.findMany({ where: { archived: false, OR: [{ title: ci }, { fileName: ci }], ...(can(u, "documents.confidential") ? {} : { confidential: false }) }, take: 6 }).then((r) => r.forEach((d) => out.push({ type: "Document", id: d.id, title: d.title, subtitle: d.category, href: `/documents?q=${encodeURIComponent(d.title)}` }))));
  await Promise.all(jobs);
  return NextResponse.json({ results: out.slice(0, 30) }, { headers: { "Cache-Control": "no-store" } });
}
