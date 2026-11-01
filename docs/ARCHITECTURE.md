# Architecture

A **modular monolith**: one Next.js application and one PostgreSQL database. For three users this is the simplest design that is still robust — no microservices, queues or Kubernetes.

## Stack

| Layer | Choice |
|---|---|
| UI | Next.js 15 (App Router, React Server Components), React 19, TypeScript strict, Tailwind CSS 4, Lucide icons, cmdk (⌘K palette), Recharts, Sonner toasts |
| Server | Next.js Server Actions and route handlers; Zod validation; all writes go through service modules |
| Data | PostgreSQL 16 via Prisma 6; money and quantities are `NUMERIC`; decimal.js for arithmetic |
| Auth | Own session layer: argon2id passwords, opaque random session tokens (stored as SHA-256), TOTP MFA (otplib) |
| Reports | ExcelJS (.xlsx), PptxGenJS (.pptx with native charts), PDFKit (quote PDFs) |
| Tests | Vitest (unit + integration on a real Postgres test DB), Playwright (end-to-end) |

## Layout

```
prisma/                 schema, migrations, reference data, dev-only sample script
src/lib/                pure logic (no I/O): decimal/rounding, units, pricing engine
src/server/
  auth.ts, permissions.ts, action.ts, audit.ts, ratelimit.ts, storage.ts, db.ts
  services/             business rules — inventory ledger, sales, purchasing, plant, metrics, alerts, import, settings
  actions/              Server Actions: validate (Zod) → authorize → call a service → audit
  reports/              Excel, PowerPoint and PDF builders
src/app/(auth)/         login, MFA, first-run, invitation
src/app/(app)/          every signed-in page
src/app/api/            exports, search, document download, health
src/components/         design system (ui.tsx), shell, forms, charts
tests/  e2e/            Vitest suites; Playwright smoke and permission scripts
```

## Key design rules

1. **The ledger is the truth.** `InventoryMovement` is append-only. Lot balances (`onHand`, `reserved`) are maintained in the same transaction as each movement and can be rebuilt from the ledger (`reconcileLots`, checked by tests and by the alert job). Corrections are reversal entries, never edits.
2. **Every stock-changing operation** runs in a `SERIALIZABLE` transaction, locks the lot row (`SELECT … FOR UPDATE`), and retries on serialization conflicts. A concurrency test fires simultaneous reservations and proves nothing is oversold.
3. **Idempotency.** Receipts, adjustments, transfers, shipments, PO receipts and production runs accept an idempotency key (every form sends one), so double-clicks and retries post once.
4. **Exact money.** All amounts use decimal arithmetic. Rounding: unit prices/costs 4 dp, document totals 2 dp, quantities 6 dp, half-up.
5. **Snapshots.** Quote and order lines store the price and cost at the time; later cost changes never rewrite history.
6. **One source of figures.** `services/metrics.ts` computes revenue, COGS, freight and gross profit for the dashboard, analytics, exports and presentations, so every surface reconciles.
7. **Permissions on the server.** Pages call `requireUser(permission)`, actions and APIs call `authorize(permission)`. Hiding UI is cosmetic only.

## Request flow (a write)

Browser form → Server Action → `action()` wrapper: authorize → Zod parse → service function (transaction, row locks, ledger, audit) → revalidate → toast. User-safe error classes (`InventoryError`, `SalesError`, …) show their message; anything else is logged and shows a generic "nothing was saved".

## Data dictionary (main tables)

| Table | Purpose / key fields |
|---|---|
| `User`, `Session`, `Invitation` | Accounts (role, argon2 hash, MFA secret, lockout), sessions (hashed token, MFA passed, expiry), one-time invites (hashed token, 7-day expiry; also used for recovery) |
| `RolePermission` | Overrides of default Manager/Viewer permissions (Owner is fixed) |
| `AuditEvent` | Append-only log: who, when, action, entity, summary, JSON detail |
| `AppSetting` | Key/value settings (company profile, margin policy, alert thresholds…) |
| `UnitOfMeasure` | Unit code and exact factor to kg (MT 1000, ST 907.18474, LT 1016.0469088, LB 0.45359237, KG 1) |
| `Product`, `ProductCategory` | SKU, grade, unit, default cost, standard price, min margin, reorder point, specs (JSON) |
| `Location` | Code, kind (plant/terminal/warehouse/berth), capacity (MT) |
| `InventoryLot` | Product × location × lot number; `onHand`, `reserved`, `unitCost`, receipt date |
| `InventoryMovement` | Signed quantity, unit cost, value, type (RECEIPT, ADJUSTMENT, TRANSFER_IN/OUT, SHIPMENT, PRODUCTION_IN/OUT, REVERSAL), reference, reason, user, idempotency key, link to reversed movement |
| `InventoryReservation` | Quantity held on a lot for an order line; consumed as it ships |
| `Customer`, `CustomerContact`, `PricingAgreement` | Accounts, contacts, agreed prices by product and date |
| `Supplier` | Vendor profile |
| `PricingScenario`, `PricingCostComponent` | Saved pricing inputs and the server-computed result snapshot |
| `Quote`, `QuoteLine` | Status workflow, below-margin flag, approval; lines with price and cost snapshot |
| `SalesOrder`, `SalesOrderLine` | Order lines with price, estimated cost, shipped quantity |
| `Shipment`, `ShipmentLine`, `FreightCost`, `VesselLoadDay` | Mode, carrier, truck, containers, berth, dates, status; lines (lot, quantity, actual unit cost, posted flag); freight charges; daily vessel loading |
| `Truck`, `ScaleTicket` | Fleet; weighbridge tickets (gross/tare/net kg, net in product unit) |
| `ProductionRun` | Pelletizer run: input lot/qty, output product/lot/qty, processing cost, output unit cost, yield |
| `PurchaseOrder`, `PurchaseOrderLine`, `PurchaseReceipt`, `PurchaseReceiptLine` | POs with revisions; receipts posting to the ledger |
| `Document` | Metadata for a privately stored file (opaque key, SHA-256, version chain, confidential flag, links) |
| `Notification` | Derived alerts with dedupe keys |
| `ReportRun`, `ImportRun` | History of generated reports and imports (with skipped-row detail) |
| `Counter`, `RateLimit`, `IdempotencyKey` | Gap-free document numbers, login throttling, replay protection |
