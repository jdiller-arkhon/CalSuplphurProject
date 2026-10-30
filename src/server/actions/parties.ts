"use server";

import { z } from "zod";
import { db } from "../db";
import { audit } from "../audit";
import { action, zReq, zOpt, zBool, zDec, zDate, zDateOpt } from "../action";

const email = z.string().trim().max(200).optional().transform((v) => (v ? v : undefined)).refine((v) => !v || z.string().email().safeParse(v).success, "Invalid email");

export const saveCustomer = action(
  "customers.manage",
  z.object({ id: zOpt(40), name: zReq("Company name"), code: zOpt(30), email, phone: zOpt(50), billingAddress: zOpt(500), shippingAddress: zOpt(500), paymentTerms: zOpt(120), currency: z.string().trim().regex(/^[A-Z]{3}$/, "Use a 3-letter ISO code").default("USD"), notes: zOpt(4000) }),
  async (d, u) => {
    const data = { name: d.name, code: d.code?.toUpperCase() ?? null, email: d.email ?? null, phone: d.phone ?? null, billingAddress: d.billingAddress ?? null, shippingAddress: d.shippingAddress ?? null, paymentTerms: d.paymentTerms ?? null, currency: d.currency, notes: d.notes ?? null };
    const c = d.id ? await db.customer.update({ where: { id: d.id }, data }) : await db.customer.create({ data });
    await audit(db, { userId: u.id, action: d.id ? "customer.update" : "customer.create", entity: "Customer", entityId: c.id, summary: `${d.id ? "Updated" : "Created"} customer ${c.name}` });
    return { message: "Customer saved.", redirect: `/customers/${c.id}` };
  },
);

export const setCustomerActive = action("customers.manage", z.object({ id: zReq("id"), active: zBool }), async (d, u) => {
  const c = await db.customer.update({ where: { id: d.id }, data: { active: d.active } });
  await audit(db, { userId: u.id, action: "customer.status", entity: "Customer", entityId: c.id, summary: `${d.active ? "Reactivated" : "Deactivated"} ${c.name}` });
  return d.active ? "Customer reactivated." : "Customer deactivated.";
});

export const addContact = action("customers.manage", z.object({ customerId: zReq("Customer"), name: zReq("Name"), title: zOpt(100), email, phone: zOpt(50), primary: zBool }), async (d, u) => {
  if (d.primary) await db.customerContact.updateMany({ where: { customerId: d.customerId }, data: { primary: false } });
  await db.customerContact.create({ data: { customerId: d.customerId, name: d.name, title: d.title, email: d.email, phone: d.phone, primary: d.primary } });
  await audit(db, { userId: u.id, action: "customer.contact", entity: "Customer", entityId: d.customerId, summary: `Added contact ${d.name}` });
  return "Contact added.";
});

export const removeContact = action("customers.manage", z.object({ id: zReq("id") }), async (d, u) => {
  const c = await db.customerContact.delete({ where: { id: d.id } });
  await audit(db, { userId: u.id, action: "customer.contact.remove", entity: "Customer", entityId: c.customerId, summary: `Removed contact ${c.name}` });
  return "Contact removed.";
});

export const addAgreement = action("pricing.rules", z.object({ customerId: zReq("Customer"), productId: zReq("Product"), unitPrice: zDec("Price", { min: 0 }), validFrom: zDate("Valid from"), validTo: zDateOpt, notes: zOpt(300) }), async (d, u) => {
  await db.pricingAgreement.create({ data: { ...d, validTo: d.validTo ?? null } });
  await audit(db, { userId: u.id, action: "customer.agreement", entity: "Customer", entityId: d.customerId, summary: `Added pricing agreement at $${d.unitPrice}` });
  return "Pricing agreement recorded.";
});

export const saveSupplier = action(
  "suppliers.manage",
  z.object({ id: zOpt(40), name: zReq("Supplier name"), code: zOpt(30), contactName: zOpt(120), email, phone: zOpt(50), address: zOpt(500), paymentTerms: zOpt(120), notes: zOpt(4000) }),
  async (d, u) => {
    const data = { name: d.name, code: d.code?.toUpperCase() ?? null, contactName: d.contactName ?? null, email: d.email ?? null, phone: d.phone ?? null, address: d.address ?? null, paymentTerms: d.paymentTerms ?? null, notes: d.notes ?? null };
    const s = d.id ? await db.supplier.update({ where: { id: d.id }, data }) : await db.supplier.create({ data });
    await audit(db, { userId: u.id, action: d.id ? "supplier.update" : "supplier.create", entity: "Supplier", entityId: s.id, summary: `${d.id ? "Updated" : "Created"} supplier ${s.name}` });
    return { message: "Supplier saved.", redirect: `/suppliers/${s.id}` };
  },
);

export const setSupplierActive = action("suppliers.manage", z.object({ id: zReq("id"), active: zBool }), async (d, u) => {
  const s = await db.supplier.update({ where: { id: d.id }, data: { active: d.active } });
  await audit(db, { userId: u.id, action: "supplier.status", entity: "Supplier", entityId: s.id, summary: `${d.active ? "Reactivated" : "Deactivated"} ${s.name}` });
  return d.active ? "Supplier reactivated." : "Supplier deactivated.";
});
