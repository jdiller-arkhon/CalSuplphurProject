# CSC Command

Private operations and intelligence platform for California Sulphur Company: inventory, pricing, sales, purchasing, plant operations, logistics, analytics and reporting — for up to three authorized users.

## Features

- **Overview** — revenue, gross profit, inventory and pipeline at a glance; rule-based insights that cite their source records.
- **Inventory** — lot-level stock by location with an append-only movement ledger (receive, adjust, transfer, reserve, ship, reverse); velocity, days-of-stock, turnover, aging.
- **Plant operations** — weighbridge scale tickets (gross − tare → net tons, optional posting to stock), pelletizer production runs (yield and output cost), truck fleet.
- **Pricing Studio** — landed cost (per ton / shipment / order / % of price) → price by gross margin, markup or target profit; sensitivity matrix; saved scenarios → quotes.
- **Sales** — quote → approval (below-margin quotes need the owner) → order → FIFO allocation → partial shipments → completion; estimated vs actual profit.
- **Market rates** — record prices you hear (indexes, competitor quotes, customer feedback, lost deals) in any unit; get a low / typical / high price to charge per product, weighted to recent prices, with trend, confidence, your cost floor and your own recent sales. Pricing Studio checks every price against it and can match the market in one click.
- **Tracking** — define your own measures (tons loaded, moisture %, diesel, turnaround hours, near-misses…) in any unit, with daily/weekly/monthly totals, averages or latest readings, targets, charts and CSV export. Values can be logged in any unit of the same kind and are converted exactly.
- **Units** — weight, volume, length, energy, time, count and percent built in; add your own (e.g. a 25 kg bag, a tote, or a brand-new kind like pallets).
- **Customers, suppliers, purchasing** — contacts, agreed prices, purchase orders with partial receipts posted into inventory.
- **Logistics** — truck, container and vessel shipments; freight per ton; daily vessel loading; equipment.
- **Analytics** — products, customers, orders, inventory and operations with period comparison and drill-down.
- **Reports** — editable PowerPoint decks (5 templates + custom builder), formatted Excel workbooks (8 reports), quote PDFs.
- **Documents** — private library for SDS, COA, specs and shipping papers with versions and access control.
- **Admin** — invitation-only users, roles & permissions, MFA, audit log, Excel/CSV import with validation preview, guided setup, notifications.

## Quick start (development)

Requirements: Node 22, PostgreSQL 16.

```bash
npm install
cp .env.example .env            # set DATABASE_URL
npx prisma migrate deploy
npm run db:reference            # units of measure only — no business data
npm run dev                     # http://localhost:3000 → create the owner account
```

Optional, development database only: `APP_ENV=development npm run db:dev-sample` loads records labeled “[Sample]” for UI review. The script refuses to run against a database whose name doesn’t contain “dev”.

## Tests

```bash
createdb csc_test && DATABASE_URL=postgresql://…/csc_test npx prisma migrate deploy
npm test                         # 75 unit + integration tests (pricing, ledger, workflows, plant, exports, import, tracking, market rates)
npm run build && npm start -p 3001
BASE_URL=http://localhost:3001 OWNER_EMAIL=… OWNER_PASSWORD=… node e2e/smoke.mjs        # 67 end-to-end checks
BASE_URL=http://localhost:3001 OWNER_EMAIL=… OWNER_PASSWORD=… node e2e/permissions.mjs  # 18 access-control checks
```

The e2e scripts write a little test data (a scale ticket, a temporary viewer user) — run them only against a development database.

## Documentation

| Document | Contents |
|---|---|
| [BUSINESS_ASSUMPTIONS.md](BUSINESS_ASSUMPTIONS.md) | Verified company facts and decisions awaiting confirmation |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Stack, structure, data flow, data dictionary |
| [docs/SECURITY.md](docs/SECURITY.md) | Controls, threat model, assumptions |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Hosting recommendation, setup, backups and restore |
| [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md) | Owner’s guide to daily use and administration |
| [docs/QA_REPORT.md](docs/QA_REPORT.md) | What was tested, results, known limitations |
