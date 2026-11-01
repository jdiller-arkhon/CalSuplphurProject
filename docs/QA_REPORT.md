# QA report — November 1, 2026

All results below were produced by running the suites in this repository against PostgreSQL 16 and a production build (`next build && next start`).

## Automated results

| Suite | Scope | Result |
|---|---|---|
| `tests/pricing.test.ts` | Margin, markup and target-profit formulas; per-ton/shipment/order/%-of-price allocation; discounts; min-margin floor; invalid input (margin ≥ 100%, zero quantity, negative cost); very large quantities; unit conversions; decimal precision | **22 / 22 pass** |
| `tests/workflows.test.ts` | Weighted-average receipts; idempotent duplicates; negative-stock prevention; transfers; reversals (once only, cost backed out); ledger reconciliation; **concurrent reservations (no oversell)**; quote approval; FIFO allocation; partial shipments; double dispatch no-op; cancellation releases stock; PO partial receipts | **13 / 13 pass** |
| `tests/plant.test.ts` | Scale ticket net weight & kg→MT; tare validation; posting in/out; production run consumption, output cost and yield; over-consumption refused; idempotency; vessel day upsert | **7 / 7 pass** |
| `tests/reports.test.ts` | All 8 Excel workbooks (frozen header, formulas reference valid cells, totals reconcile to the engine, formula-injection escaping); all 6 PowerPoint templates (native charts, real figures); quote PDF validity and single page | **19 / 19 pass** |
| `tests/import.test.ts` | Header auto-matching; CSV quoting and currency cleanup; duplicate and invalid-row detection; refusal unless skipping is chosen; skipped rows recorded; beginning inventory via ledger | **5 / 5 pass** |
| `tests/tracking-market.test.ts` | Unit conversion across kinds (and refusal across kinds), price-rate conversion, tracker storage in tracker unit with original kept, sum/average/latest aggregation, target status, market guide unit conversion, non-USD exclusion, recency weighting, window and basis filters, min-margin floor | **9 / 9 pass** |
| **Total unit + integration** | | **75 / 75 pass** |
| `e2e/smoke.mjs` | Anonymous access blocked; every sidebar page and 26 more routes load without errors; 7 detail pages; search; all Excel/PowerPoint/PDF/template downloads; scale ticket through the real form; no browser errors | **67 / 67 pass** |
| `e2e/permissions.mjs` | Invite → accept as Viewer; link single-use; 7 restricted pages redirect; valuation hidden; sidebar filtered; export APIs return 403; search filtered; deactivation ends the session | **18 / 18 pass** |

## Visual QA

- Desktop (1440×900) light and dark mode reviewed by screenshot for Overview, Inventory, Products, Pricing Studio, Sales, Customers, Suppliers, Purchasing, Logistics and detail pages.
- The executive PowerPoint was rendered through LibreOffice and inspected slide by slide: no overlapping or clipped text, consistent margins, footers and page numbers, correct currency formatting.
- The quote PDF was rendered and inspected.

## Defects found and fixed during QA

1. Integration tests were connecting to the development database (import hoisting) → pinned the test DB in config and added a guard that refuses to truncate a non-test database.
2. Serialization-retry missed raw-query conflicts → concurrent reservations could fail instead of retrying.
3. Server Action exports weren't async functions → production build failed; all actions converted.
4. After accepting an invitation, the page re-rendered before redirecting, leaving new users on "Invitation unavailable" → switched to server-side redirects for all sign-in flows.
5. Excel date columns were parsed as numbers → export crashed for 5 workbooks.
6. Quote PDF footer spilled onto a blank second page.
7. Revenue chart's profit bar rendered ~4 px tall with one month of data → redesigned.

## Not done / known limitations

| Item | Status |
|---|---|
| Email notifications / weekly summary | Not built — the app sends no email by design until a provider is approved |
| Tablet "yard mode" | Built (`/yard`): large buttons for scale tickets, receiving and transfers. Other pages work on tablets but weren't screenshot-tested at tablet width |
| Customizable dashboard layout | Not built; KPIs are fixed |
| Inventory costing / revenue recognition | Implemented as lot weighted average and recognition on dispatch — **pending company confirmation** |
| Exchange rates | Not supported (multi-currency customers are stored, never converted; non-USD market prices are stored but left out of the market guide) |
| Market data feeds | None connected. Market rates come only from prices staff record; connecting a paid index (e.g. a trade-press subscription) needs approval |
| Deployment | Not performed — requires approval of hosting cost (see DEPLOYMENT.md) |
| Real company data | None loaded. Screenshots use development records labeled “[Sample]” |
