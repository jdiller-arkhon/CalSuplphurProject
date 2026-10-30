import type { Permission } from "@/server/permissions";

export type NavItem = { href: string; label: string; icon: string; perm?: Permission };
export type NavGroup = { label: string; items: NavItem[] };

// Thirteen destinations grouped by workflow so the sidebar reads as four short lists.
export const NAV: NavGroup[] = [
  { label: "", items: [{ href: "/", label: "Overview", icon: "LayoutDashboard" }] },
  {
    label: "Operations",
    items: [
      { href: "/inventory", label: "Inventory", icon: "Boxes", perm: "inventory.view" },
      { href: "/products", label: "Products", icon: "Package", perm: "inventory.view" },
      { href: "/logistics", label: "Logistics", icon: "Truck", perm: "logistics.manage" },
    ],
  },
  {
    label: "Commercial",
    items: [
      { href: "/pricing", label: "Pricing Studio", icon: "Calculator", perm: "pricing.use" },
      { href: "/sales", label: "Sales & Quotes", icon: "FileSignature", perm: "quotes.manage" },
      { href: "/customers", label: "Customers", icon: "Building2", perm: "customers.view" },
      { href: "/suppliers", label: "Suppliers", icon: "Factory", perm: "suppliers.manage" },
      { href: "/purchasing", label: "Purchasing", icon: "ShoppingCart", perm: "purchasing.manage" },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { href: "/analytics", label: "Analytics", icon: "LineChart", perm: "finance.view" },
      { href: "/reports", label: "Reports", icon: "Presentation", perm: "reports.generate" },
      { href: "/documents", label: "Documents", icon: "FolderLock", perm: "documents.view" },
    ],
  },
];
export const SETTINGS_ITEM: NavItem = { href: "/settings", label: "Settings", icon: "Settings" };
