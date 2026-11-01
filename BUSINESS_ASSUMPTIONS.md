# Business assumptions — to confirm with California Sulphur Company

CSC Command is built so these choices are **settings or data**, not hard-coded behavior. Each item below lists what the system does today and what we need the company to confirm.

## What is verified (from www.californiasulphur.com, Oct 2026)

| Fact | Source wording | How the app uses it |
|---|---|---|
| Operations began August 1983 | "commenced operations during August of 1983" | Not used |
| Plant & office at 2250 E. Pacific Coast Hwy, Wilmington, CA 90744; open 24/7 | Website contact/about | Shown only as guidance text when adding locations |
| 2,000 MT/day Devco II wet-form pelletizing unit producing low-moisture, low-acidity prill | Facilities | Pelletizer production runs (Plant operations) |
| Storage for over 90,000 MT of finished product | Facilities | Location capacity is entered by the user; not pre-filled |
| Fleet of 15 low-emission trucks serving LA-area refineries daily | Services | Truck list (Plant operations → Trucks); trucks are entered by the user |
| Vessel loading at Port of Long Beach Berth 214 (MetroPorts), 8,000–10,000 tons/day | Services | Daily vessel loading on vessel shipments; berth field |
| Live container loading, average 40–50 twenty-foot containers/day to either port | Services | Container count on container shipments |
| Domestic molten sulphur transportation | Services | Molten can be set up as a product; no molten-specific logic is assumed |

Nothing else on the website (prices, volumes, customers, grades, costs) was available, and **no such figures are pre-loaded**.

## Needs confirmation

| # | Topic | Current behavior | Question |
|---|---|---|---|
| 1 | **Inventory costing** | Weighted average *within each lot*; receipts into an existing lot blend its cost. Shipments use the lot's cost at dispatch. | Do you use weighted average across all stock, FIFO, specific lot, or standard cost? |
| 2 | **Revenue recognition** | Operational revenue is counted when sales-order product is **dispatched** (shipment posted). | Should revenue be counted at dispatch, delivery, or invoicing? (This is an operational view; your accountant decides the books.) |
| 3 | **Gross profit definition** | Revenue − cost of goods shipped − direct freight on those shipments. Net profit is never computed. | Should other direct costs (e.g. loading labor, demurrage) be included? |
| 4 | **Units** | Products can use MT, short ton, long ton, lb or kg; conversions are exact. Dashboards show the first product's unit. | Which unit do you quote and report in? Do any customers buy in short tons? |
| 5 | **Product grades** | None pre-loaded. Example names in screenshots are labeled "[Sample]". | What grades/products do you carry (prilled, molten, crushed, other)? |
| 6 | **Minimum margin** | Company default 10%, overridable per product. Below it, quotes need owner approval. | What minimum margin(s) do you want enforced? |
| 7 | **Freight allocation in pricing** | Per-ton, per-shipment, per-order or %-of-price costs, chosen per line. | Typical freight, loading, storage, commission and insurance costs and how you charge them? |
| 8 | **Quote terms** | Delivery and payment terms are free text with company defaults. | Standard Incoterms and payment terms? Quote validity (default 30 days)? |
| 9 | **Currency** | USD; other currencies can be set per customer. No exchange rates are assumed or converted. | Any non-USD customers? If so, how should rates be sourced? |
| 10 | **Pelletizer yield & cost** | Output cost = (input lot cost × input tons + processing cost entered for the run) ÷ output tons. | Normal yield range? How should processing cost be estimated (per run, per ton)? |
| 11 | **Scale tickets** | Gross and tare in kg; net converted to the product unit. Optional posting to inventory. | Does your scale print kg or lb? Ticket numbering you'd like to keep? |
| 12 | **Negative stock** | Blocked by default (setting can allow it). | Ever ship before receipt is recorded? |
| 13 | **Users & roles** | Max 3 active users: Owner, Manager, Viewer; Manager/Viewer permissions are editable. | Who are the users and what should each see? |
| 14 | **Accounting system** | No integration. | Which system do you use (QuickBooks, other)? An export or sync can be added. |
| 15 | **Email** | The app sends no email; invitation and recovery links are copied and sent by the owner. | Want optional email alerts/summaries? Which provider? |

When answers come back, most changes are settings (Settings → Company & policies) or product data; items 1–3 change calculation code in `src/server/services/metrics.ts` and `inventory.ts`, which are covered by tests.
