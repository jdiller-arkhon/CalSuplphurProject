import type { Role } from "@prisma/client";

export const PERMISSIONS = {
  "inventory.view": "View inventory quantities and locations",
  "inventory.value": "View inventory costs and valuation",
  "inventory.operate": "Receive, adjust, transfer, reserve and ship inventory",
  "inventory.reverse": "Reverse posted inventory movements",
  "products.manage": "Create and edit products, locations and units",
  "pricing.use": "Use the Pricing Studio and save scenarios",
  "pricing.rules": "Change pricing rules and minimum margins",
  "quotes.manage": "Create and edit quotes",
  "quotes.approve": "Approve below-margin quotes",
  "orders.manage": "Create and manage sales orders",
  "customers.view": "View customers",
  "customers.manage": "Create and edit customers",
  "suppliers.manage": "Create and edit suppliers",
  "purchasing.manage": "Create, amend and receive purchase orders",
  "logistics.manage": "Manage shipments and freight",
  "finance.view": "View revenue, profit and margin analytics",
  "reports.generate": "Generate and export reports",
  "documents.view": "View non-confidential documents",
  "documents.confidential": "View confidential documents",
  "documents.manage": "Upload and archive documents",
  "audit.view": "View the audit log",
  "users.manage": "Invite, change and deactivate users",
  "settings.manage": "Change company settings",
  "import.run": "Import data from spreadsheets",
  "tracking.use": "Create trackers and log tracked values",
  "invoices.view": "View invoices and payments",
  "invoices.manage": "Create, issue, void invoices and record payments",
} as const;

export type Permission = keyof typeof PERMISSIONS;
const ALL = Object.keys(PERMISSIONS) as Permission[];

export const DEFAULT_ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  OWNER: ALL,
  MANAGER: ALL.filter((p) => !["users.manage", "settings.manage", "audit.view", "pricing.rules", "quotes.approve", "inventory.reverse"].includes(p)),
  VIEWER: ["inventory.view", "customers.view", "documents.view", "logistics.manage", "tracking.use", "invoices.view"],
};

/** OWNER permissions are fixed so the system can never lock out its administrator. */
export const LOCKED_OWNER: Permission[] = ["users.manage", "settings.manage", "audit.view"];

export const MAX_ACTIVE_USERS = 3;
