# SME MoneyBook Phase 1 Core Foundation

Date: 2026-07-17

This document covers the repository audit, architecture decisions, implementation notes, QA checklist, deployment steps, rollback plan, and remaining risks for the Phase 1 core foundation work.

## Repository Audit

Existing reusable components and services:

- Auth/session: `src/lib/auth/session.ts`, API session routes, PIN/password support.
- Authorization: `src/lib/operations/access.ts` with owner/staff/accountant role checks.
- Core money engine: `src/lib/bookkeeping/domain.ts`, `src/lib/bookkeeping/persistence.ts`, `Transaction`, `Debt`, and account balance updates.
- Inventory: `InventoryItem`, `InventoryMovement`, stock page, product list, low stock alerts.
- Onboarding: existing `OnboardingSetup`, now replaced with a progressive resumable flow.
- Offline queue: `src/lib/offline/offline-queue.ts`, dashboard sync status, idempotent transaction writes.
- Billing gates: `src/lib/billing/free-limits.ts`, subscriptions, Paystack routes.
- Audit logs: `AuditLog` model used across money, stock, debt, reports, and automation.
- Tests: Vitest unit/API tests and Playwright mobile smoke tests.

Missing entities before this work:

- Product units, categories, brands, barcodes, internal product codes.
- Split payment rows separate from a sale transaction.
- Customer and supplier return history.
- Receipt configuration.
- Persistent onboarding progress/events.
- Reviewable offline sync operation records.

Migration risks:

- Existing stock quantities were integer-only. The migration adds decimal fields and backfills them from existing integers instead of renaming/removing the old fields.
- Barcode/internal product code uniqueness is business-scoped and nullable; existing products remain valid.
- New return/payment/onboarding tables are additive.
- No destructive migration is included.

Routes that must remain backward-compatible:

- `/api/transactions`
- `/api/inventory`
- `/api/inventory/[id]/stock-in`
- `/api/inventory/[id]/stock-out`
- `/api/onboarding/setup`
- `/money`, `/stock`, `/people`, `/reports`

Security and performance notes:

- New write APIs use session auth, same-origin checks, rate limits where appropriate, server-side business access, Zod validation, and database transactions.
- New tables are indexed by business and high-traffic lookup fields.
- Barcode/product search uses existing dashboard inventory state client-side for now; large inventory businesses may need server-side paginated search later.

## Architecture Decisions

- Keep the existing simple `Transaction` model as the financial anchor.
- Add `TransactionPayment` for split payments rather than overloading transaction JSON.
- Preserve old integer stock fields and add decimal stock fields for units/conversions.
- Add optional POS as `/pos`; do not replace the existing Add Sale form.
- Use browser `BarcodeDetector` when available; fall back to manual barcode entry.
- Keep onboarding events first-party in the database and still emit product analytics.
- Add return records without deleting or mutating the original sale.

## Database Changes

Migration: `prisma/migrations/20260717090000_phase_1_core_foundation/migration.sql`

Key additions:

- `ProductUnit`, `ProductCategory`, `ProductBrand`
- Inventory barcode, internal code, unit/category/brand fields
- Decimal stock quantity fields and movement audit fields
- `TransactionPayment`
- `CustomerReturn`, `CustomerReturnItem`
- `SupplierReturn`, `SupplierReturnItem`
- `ReceiptConfig`
- `OnboardingProgress`, `OnboardingEvent`
- `OfflineSyncOperation`

Backfills:

- `InventoryItem.quantityOnHandDecimal = quantityOnHand`
- `InventoryItem.lowStockLevelDecimal = lowStockLevel`
- `InventoryMovement.quantityDecimal = quantity`
- `InventoryMovement.businessId` backfilled from the related item
- Default global product units inserted.

## Implementation Files

- Onboarding: `src/components/onboarding/OnboardingSetup.tsx`, `/api/onboarding/progress`, `/api/onboarding/setup`
- Product metadata: Prisma schema, inventory validation, `ProductList`, inventory persistence
- POS: `src/components/pos/FastPos.tsx`, `/pos`, `/api/pos/checkout`, `src/lib/pos/checkout.ts`
- Returns: `/api/returns/customer`, `/api/returns/supplier`, `src/lib/returns/service.ts`
- Help: `src/components/help/HelpDrawer.tsx`
- Barcode labels: stock page print/export controls and duplicate scan-code validation
- Offline/idempotency: `src/lib/offline/offline-queue.ts`, `/api/offline/sync-operations`, More-page sync review, admin queue monitoring, stock movement client keys
- Customer intelligence: customer recent purchases and product pricing history
- Reports: category and brand sales/profit breakdowns in monthly reports, CSV, and PDF
- Feature flags: `src/lib/phase1/feature-flags.ts`

## Environment Variables

Optional rollout flags, enabled by default:

- `NEXT_PUBLIC_PHASE1_ONBOARDING_ENABLED`
- `NEXT_PUBLIC_PHASE1_POS_ENABLED`
- `NEXT_PUBLIC_PHASE1_RETURNS_ENABLED`
- `NEXT_PUBLIC_PHASE1_HELP_ENABLED`
- `NEXT_PUBLIC_PHASE1_OFFLINE_QUEUE_ENABLED`

Set any flag to `false` to disable the corresponding Phase 1 surface/API gate.

## Tests

Added validation coverage for:

- Decimal product quantities and product metadata
- Unit conversion factor validation
- Sensitive stock reduction reason validation
- Split payment overpayment rejection
- POS split-payment payloads
- Customer return item validation
- Unit conversion and converted stock movements

Current verified commands:

- `npx prisma validate`
- `npx prisma generate`
- `npm run typecheck`
- `npm run test`

## Manual QA Checklist

1. Register a new user.
2. Complete onboarding through business name, category, type, country/currency, goal, optional product/customer, and first sale/expense.
3. Refresh halfway through onboarding and confirm it resumes.
4. Add product with unit, category, brand, barcode, and decimal quantity.
5. Search product by barcode/category/brand/name.
6. Try creating a second product with the same barcode or SKU and confirm duplicate-code feedback.
7. Print barcode labels and export barcode-label CSV from the stock page.
8. Open POS, add products, split payment across cash/transfer/POS, and save.
9. Save a POS sale with partial payment and confirm customer owing is created.
10. Configure receipt header/footer/default paper size, then print 58 mm, 80 mm, and PDF-style receipts from POS.
11. Deny camera permission and confirm manual barcode fallback works.
12. Move stock out with a sensitive reason.
13. Submit customer and supplier returns from the Money and Stock screens in staging.
14. Toggle offline, save sale/stock movement, reconnect, and confirm one synced record.
15. Force an offline replay validation failure and confirm the sync banner links to More > Offline sync review.
16. Open Customers and confirm recent purchases plus pricing history appear for customers with sales.
17. Open Reports and confirm category and brand sales/profit breakdowns appear and export.
18. Confirm unauthorized staff/accountant roles cannot call restricted routes.

## Deployment Steps

1. Deploy migration to staging with `npx prisma migrate deploy`.
2. Run `npx prisma validate && npx prisma generate`.
3. Run `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`.
4. Smoke test onboarding, product creation, POS checkout, split payment, offline replay, and returns APIs in staging.
5. Confirm audit logs for POS, stock movement, customer return, supplier return.
6. Deploy to production through Vercel.
7. Watch API error logs, checkout save rate, onboarding completion, and duplicate idempotency errors.

## Rollback Plan

- Application rollback: redeploy the previous Vercel build.
- Database rollback: do not drop new tables immediately. They are additive and safe to leave unused.
- If a new route causes errors, disable entry points via navigation/UI rollback and keep existing `/api/transactions` and `/api/inventory` flows active.
- If POS creates bad data in staging, reverse affected transactions through existing correction flow or targeted admin scripts after backup.

## Remaining Risks

- Full native Bluetooth printing is not implemented in browser-only code; POS clearly falls back to browser print.
- Customer and supplier return UI exists; exchange/store-credit/refund accounting should be smoke-tested against real business scenarios.
- Offline replay failures are recorded to `OfflineSyncOperation` with summary payloads, visible in More and Admin, and can be marked resolved; queued offline payloads are still local to the device until replay or manual resolution.
- Product conversion factors now drive sale, POS, stock, return, and receipt quantities; migrated legacy products still need manual unit review where businesses want converted units.
- Barcode camera scanning depends on browser `BarcodeDetector`; unsupported browsers use manual entry.
- Printed barcode labels are browser-rendered labels/CSV export, not native label-printer SDK integration.
- Feature flags are wired for POS, returns, progressive onboarding, help, and offline queue; deeper per-control flags may still be added as workflows mature.
