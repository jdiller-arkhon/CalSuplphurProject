# Owner's guide

## Getting started

1. Sign in, then go to **Settings → My security** and turn on two-factor sign-in.
2. Open **Overview → Continue setup** (or `/setup`). The checklist ticks itself off as you add real data:
   company profile → products → storage locations → beginning inventory → pricing rules → customers & suppliers → invite your team → first report.
3. Already have spreadsheets? **Settings → Import data**: download a template (or use your own file), check the file, fix or skip problem rows, then import. Imports are all-or-nothing, and skipped rows are kept in the import history.

## Everyday tasks

| Task | Where |
|---|---|
| Truck across the scale | **Plant operations → Ticket in / Ticket out.** Enter gross and empty weight (kg); tick "post to inventory" to update stock in the same step |
| Pelletizer run | **Plant operations → Pelletizer production → Record run.** Choose the molten lot used and the prill lot produced; yield and cost per ton are calculated |
| Receive product without a PO | **Inventory → Receive** |
| Receive against a PO | Open the PO → **Record receipt** (partial deliveries are fine) |
| Move, adjust or hold stock | **Inventory** → hover a lot row → adjust / transfer / reserve / outbound |
| Fix a mistake | **Inventory → Movement ledger** → reverse the receipt or adjustment (owner only). History is never deleted |
| Price a deal | **Pricing Studio** — enter costs, pick margin, markup or profit per ton; save it or click **Create quote** |
| Quote → order → ship | Quote: **Approve & finalize** (or submit for approval if below the margin floor) → **Convert to sales order** → **Allocate inventory** → **Plan shipment** → **Dispatch** → **Mark delivered** |
| Vessel loading | Open the vessel shipment → **Daily loading → Add day** |
| Freight charges | Open the shipment → **Freight & handling → Add** |
| Send a quote | Open the quote → **PDF** → email it yourself (the app never sends email) |
| Reports | **Reports** → choose a PowerPoint template or Excel workbook and a period → **Generate** |
| Find anything | Press **⌘K** (Mac) or **Ctrl+K** (Windows) |

## What the numbers mean

- **Revenue** counts when sales-order product is *dispatched*.
- **Gross profit** = revenue − cost of the product shipped − freight recorded on those shipments. It is **not** net profit; overheads are not included.
- **Inventory value** = tons on hand × each lot's cost (weighted average within the lot).
- These are the current assumptions; see `BUSINESS_ASSUMPTIONS.md`.

## Users

- **Settings → Users → Invite user** creates a one-time link (valid 7 days). Copy it and send it yourself. Up to three active users.
- **Roles:** Owner (everything), Manager (day-to-day work, no user/settings/audit access), Viewer (stock and shipments; no costs or financials). Adjust Manager and Viewer permissions under **Roles & permissions**.
- **Lost password or phone:** **Users → Reset access** creates a one-time recovery link (24 hours) and clears their two-factor setup.
- **Someone leaves:** **Deactivate** signs them out immediately and keeps their history.

## Alerts

The bell shows alerts created from your data: low stock, quotes waiting for approval or about to expire, late shipments and POs, low-margin quotes, discrepancies between balances and history, and products without a Safety Data Sheet. Thresholds are in **Settings → Company & policies**.

## Audit log

**Settings → Audit log** lists every change, sign-in, export and document download, with who and when. It can't be edited.
