# SME MoneyBook Phase 2 Readiness Audit

Date: 2026-07-17

## Gate Status

Phase 2 implementation has advanced through the location foundation, location-aware stock writes, warehouse transfers, reporting-centre definitions and export jobs, professional export scaffolding, tax settings, document branding snapshots, localization preferences, granular permission policies, announcements, and multi-business-safe dashboard selection.

The Phase 2 brief says: "Execute this prompt only after Phase 1 is complete, deployed, stable, and approved." Phase 1 has been deployed to production and the automated deployment gate passed. Phase 2 should still roll out behind flags, subscription gates, and owner-only access until staging QA and support documentation are complete.

Current Phase 1 evidence:

- Phase 1 migration and code paths exist for product metadata, POS, returns, receipt config, offline sync review, customer purchase history, and category/brand reports.
- Local verification has passed: lint, typecheck, Prisma validation, Vitest, and production build.
- The remaining Phase 1 work is physical acceptance: real-device barcode/camera checks, receipt printer checks, and offline replay checks.

This document now tracks Phase 2 architecture plus implemented slices: additive location foundation, default-location backfill, feature flags, server-side access helpers, gated location APIs, location-aware stock/POS/returns/offline payloads, optional location report filters, gated stock transfer APIs/UI, a 24-report catalogue, report export jobs, tax and document-branding settings, localization scaffolding, granular permission policy storage, and announcement inbox/admin APIs.

## Current Architecture Audit

Location readiness:

- `Business` is the tenant boundary.
- `BusinessMember` is business-scoped, not location-scoped.
- `Transaction`, `TransactionPayment`, `InventoryItem`, `InventoryMovement`, `CustomerReturn`, `SupplierReturn`, `TaxRun`, and `ReportSnapshot` are business-scoped only.
- `InventoryItem.quantityOnHandDecimal` stores one aggregate stock quantity per product, not per location.
- `InventoryMovement` can support immutable movement history, but it has no source/destination location fields.
- `TransactionPayment` supports payment method mix reporting, but no location attribution.
- `ReceiptConfig` is business-wide, not location-specific.
- Reports include Phase 1 daily/weekly/monthly summaries and category/brand breakdowns, but remain business-wide and are not yet a full report centre.

Conclusion: the Phase 1 schema was not location-ready. The first Phase 2 migration adds location readiness without removing Phase 1 aggregate fields.

## Single-Location Assumptions

Known single-location assumptions before the current Phase 2 implementation:

- `src/lib/bookkeeping/persistence.ts`
  - `getDashboardState` previously loaded one business-wide inventory list.
  - `recordPersistentTransaction` previously decremented `InventoryItem.quantityOnHandDecimal` directly.
  - `moveInventoryForUser` previously updated aggregate product stock directly.
  - `getMonthlyReport` previously aggregated by business only.
  - customer/supplier summaries aggregate business-wide.
- `src/lib/pos/checkout.ts`
  - POS checkout previously chose products from business-wide stock and decremented aggregate product stock.
- `src/lib/returns/service.ts`
  - Customer returns and supplier returns previously updated aggregate product stock.
- `src/components/dashboard/DashboardProvider.tsx`
  - Local offline stock movement queue and sync review previously did not include location ids.
- `src/components/offline/OfflineSyncReviewPanel.tsx`
  - Review queue is business-wide and cannot distinguish branch-level sync conflicts.
- `src/components/stock/ProductList.tsx`
  - Stock list, low-stock status, and adjustments use business-wide item quantities.
- `src/components/pos/FastPos.tsx`
  - Product availability and cart checks are business-wide.
- `src/app/api/reports/monthly/*`
  - Reports previously used business-wide filters only.
- `src/app/customers/page.tsx`
  - Customer purchase and pricing history aggregates business-wide.
- `src/components/receipts/ReceiptSettingsPanel.tsx`
  - Receipt branding applies to the whole business.

## Required Schema Plan

Phase 2B location foundation should be additive:

- `BusinessLocation`
  - `id`, `businessId`, `name`, `type`, `address`, `phone`, `email`
  - `isDefault`, `archivedAt`, `createdAt`, `updatedAt`
- `BusinessLocationMember`
  - `businessId`, `locationId`, `userId`, `roleId` or `role`
  - supports server-side location access checks.
- `InventoryBalance`
  - `businessId`, `locationId`, `inventoryItemId`
  - `quantityOnHandDecimal`, `lowStockLevelDecimal`
  - unique on `[businessId, locationId, inventoryItemId]`.
- `StockTransfer`
  - `businessId`, `transferNumber`, `sourceLocationId`, `destinationLocationId`
  - `status`, `reason`, `reference`, `approvedById`, `receivedById`
  - `approvedAt`, `sentAt`, `receivedAt`, `cancelledAt`
  - `idempotencyKey`.
- `StockTransferItem`
  - `transferId`, `inventoryItemId`, `requestedQuantity`, `sentQuantity`, `receivedQuantity`, `damagedQuantity`, `shortageQuantity`.
- `LocationAuditEvent` is optional if `AuditLog.metadata` remains sufficient.

Implemented migration: `prisma/migrations/20260717110000_phase_2_location_foundation/migration.sql`.

Add nullable location fields after backfill:

- `Transaction.locationId`
- `TransactionPayment.locationId`
- `InventoryMovement.locationId`
- `InventoryMovement.sourceLocationId`
- `InventoryMovement.destinationLocationId`
- `CustomerReturn.locationId`
- `SupplierReturn.locationId`
- `ReportSnapshot.locationId` optional
- `ReceiptConfig.locationId` optional if branding varies by branch later

Backfill plan:

1. Create one default `BusinessLocation` per business.
2. Set that location as default.
3. Create one `InventoryBalance` per active product using existing `InventoryItem.quantityOnHandDecimal`.
4. Backfill historical `Transaction.locationId`, `TransactionPayment.locationId`, and `InventoryMovement.locationId` to default location.
5. Keep old aggregate `InventoryItem.quantityOnHandDecimal` temporarily as a compatibility cache.
6. After location-aware reads are stable, derive aggregate stock from `InventoryBalance` or maintain it with controlled writes.

## Permission Dependencies

Current roles:

- `OWNER`
- `STAFF`
- `ACCOUNTANT`

Current permissions:

- `admin`
- `money:write`
- `reports:write`
- `inventory:write`
- `backup:read`

Phase 2 requires new permissions:

- `locations:view`, `locations:create`, `locations:edit`, `locations:archive`
- `transfers:view`, `transfers:create`, `transfers:approve`, `transfers:receive`, `transfers:cancel`
- `reports:advanced`, `reports:export`
- `stock:adjust`, `stock:transfer`, `stock:receive`
- `returns:refund`, `returns:approve`
- `settings:invoice_branding`, `settings:tax`, `settings:localization`
- `roles:manage`, `audit:read`, `exports:manage`

Safe approach:

- Add a permission registry and role templates before adding custom roles.
- Add location access checks to `requireBusinessAccess`, or add `requireLocationAccess`.
- Keep Owner as the only role that can enable multi-location until granular roles are stable.
- Protect final-owner access with a service-level invariant.

## Subscription Entitlement Matrix

Do not finalize pricing without product-owner approval.

Suggested technical entitlements:

| Feature | Free | Growth | Pro | Enterprise |
|---|---:|---:|---:|---:|
| Core sales and expenses | Yes | Yes | Yes | Yes |
| One business | Yes | Yes | Yes | Configurable |
| One location | Yes | Yes | Yes | Configurable |
| Basic stock | Yes | Yes | Yes | Yes |
| Advanced reports | No | Yes | Yes | Yes |
| PDF exports | No | Yes | Yes | Yes |
| Invoice branding | No | Yes | Yes | Yes |
| Tax summaries | No | Yes | Yes | Yes |
| Multiple locations | No | No | Yes | Yes |
| Warehouse transfers | No | No | Yes | Yes |
| Granular permissions | No | No | Yes | Yes |
| Multi-business operation | No | No | Limited | Yes |
| Custom roles | No | No | No | Yes |

Implementation dependency:

- Extend `BillingFeature` before building UI.
- Enforce entitlements in route/service layers first.
- UI prompts should be secondary and never the only gate.
- Downgrades must keep data readable and restrict new writes where appropriate.

## Feature Flags And Environment Variables

Add Phase 2 flags before any visible rollout:

- `NEXT_PUBLIC_PHASE2_LOCATIONS_ENABLED`
- `NEXT_PUBLIC_PHASE2_TRANSFERS_ENABLED`
- `NEXT_PUBLIC_PHASE2_REPORTING_CENTRE_ENABLED`
- `NEXT_PUBLIC_PHASE2_PDF_EXPORTS_ENABLED`
- `NEXT_PUBLIC_PHASE2_TAX_ENABLED`
- `NEXT_PUBLIC_PHASE2_INVOICE_BRANDING_ENABLED`
- `NEXT_PUBLIC_PHASE2_I18N_ENABLED`
- `NEXT_PUBLIC_PHASE2_GRANULAR_PERMISSIONS_ENABLED`
- `NEXT_PUBLIC_PHASE2_ANNOUNCEMENTS_ENABLED`
- `NEXT_PUBLIC_PHASE2_BUSINESS_SWITCHER_ENABLED`

Server-side flags must mirror UI flags where write behavior changes. Do not rely on client flags for authorization, entitlements, location access, or export access.

Likely infrastructure variables:

- Object storage bucket and credentials for generated exports.
- Signed URL expiry setting.
- Background job/cron secret for large export generation.
- Optional default locale and enabled locale list.
- Tax disclaimer/config rollout flags by country.

## Reporting Definitions

Reporting centre should use server-side definitions in one module, for example `src/lib/reports/definitions.ts`.

Core definitions:

- Sales summary: sum non-reversed sale transaction totals by date range.
- Sales trend: sales grouped by day/week/month in business timezone.
- Expense summary: sum expense transactions, excluding reversed entries.
- Profit overview: sale profit minus expenses.
- Product profitability: line item sales total minus line item cost total.
- Category/brand performance: extend the Phase 1 category/brand breakdowns with snapshots, trends, and location filters.
- Customer ranking: customer sale totals minus returns.
- Customer debt ageing: open customer debt by due date/created date buckets.
- Supplier bill ageing: open supplier debt by due date/created date buckets.
- Inventory valuation: current stock quantity by location times cost price.
- Stock movement: immutable inventory movements filtered by item/location/type.
- Returns and refunds: customer/supplier return totals by reason/outcome.
- Payment method mix: `TransactionPayment` grouped by method.
- Cashflow report: paid money in/out by account and date range.
- Location comparison: sales, expenses, stock value, and profit by location.
- Staff sales performance: sale totals grouped by actor where transaction actor is captured.
- Tax summary: tax snapshots, not recalculated current settings.
- Discounts report: line item and order discounts.
- Daily closing: sales, expenses, payments, outstanding balance, and cash by location/day.

Query requirements:

- Every report must filter by `businessId`.
- Location filters must be enforced by server-side access checks.
- Date ranges must be timezone-aware.
- Large exports should use a queued export record, not synchronous route generation.

## Reporting Definition Document

Each report should have a definition entry with:

- `id`
- display name
- required permission
- required entitlement
- supported date filters
- supported dimensions
- source tables
- reconciliation rule
- export formats
- maximum synchronous row count
- audit event names

Initial report ids:

- `sales_summary`
- `sales_trend`
- `expense_summary`
- `profit_overview`
- `product_profitability`
- `category_performance`
- `brand_performance`
- `customer_ranking`
- `customer_debt_ageing`
- `supplier_ranking`
- `supplier_bill_ageing`
- `inventory_valuation`
- `stock_movement`
- `inventory_turnover`
- `low_stock`
- `returns_refunds`
- `payment_method_mix`
- `cashflow`
- `location_comparison`
- `staff_sales_performance`
- `tax_summary`
- `discounts`
- `gross_margin`
- `daily_closing`

## PDF Export Plan

Add a single export pipeline:

- `ExportJob`
  - `businessId`, `actorId`, `type`, `status`, `payload`, `fileKey`, `expiresAt`, `error`
- Shared brand template renderer.
- Signed temporary download URLs.
- PDF metadata: date range, currency, generated timestamp, exported-by user, page numbers.
- Audit log on export requested, generated, downloaded, and failed.

Keep existing monthly PDF export until the pipeline replaces it.

## Tax Engine Plan

Add optional tax configuration:

- `TaxConfig`
  - business/location/country labels, registration number, enabled flag.
- `TaxRate`
  - label, rate, type: VAT, zero-rated, exempt, custom.
- `DocumentTaxSnapshot`
  - invoice/receipt/transaction id, rate, label, inclusive/exclusive, calculated totals.

Rules:

- Never recalculate historical documents after tax settings change.
- Show tax reports as recordkeeping support, not professional tax advice.
- Keep tax hidden until configured.

## Invoice Branding Plan

Extend `ReceiptConfig` or introduce `DocumentBrandingConfig`:

- logo, trading name, address, contact, website, tax id, registration number
- bank details, payment instructions, signature
- invoice prefix, footer, brand accent, terms

Issued documents need snapshots:

- `IssuedDocument`
- `IssuedDocumentLine`
- `IssuedDocumentBrandSnapshot`
- `IssuedDocumentTaxSnapshot`

This prevents profile changes from mutating old invoices.

## Localization Structure

Recommended structure:

- `src/i18n/locales/en.json`
- `src/i18n/locales/fr.json`
- `src/i18n/locales/sw.json`
- `src/i18n/locales/ha.json`
- `src/i18n/locales/yo.json`
- `src/i18n/locales/ig.json`
- `src/i18n/index.ts`
- `src/i18n/format.ts`
- `scripts/check-translations.ts`

Schema additions:

- `User.language`
- `Business.defaultLanguage`

Rules:

- Use translation keys for UI strings.
- Format dates, numbers, and currencies by locale.
- Keep user-entered business data unchanged.
- Ship English first; add reviewed translations only.

## Granular Permission Matrix

Initial templates:

| Role | Sales | Expenses | Stock | Transfers | Reports | Settings | Staff | Billing |
|---|---|---|---|---|---|---|---|---|
| Owner | Full | Full | Full | Full | Full | Full | Full | Full |
| Administrator | Full | Full | Full | Approve/Receive | Full | Limited | Invite/manage non-owner | No |
| Manager | Create/view | Create/view | Adjust/view | Create/approve | View/export | No | No | No |
| Accountant | View | View | View | View | Full/export | Tax/report settings | No | No |
| Cashier | Create sales | No | View | No | Own sales summary | No | No | No |
| Sales representative | Create sales | No | View assigned location | No | Own sales summary | No | No | No |
| Warehouse officer | No | No | Adjust/view | Create/receive | Inventory reports | No | No | No |
| Viewer | View only | View only | View only | View only | View only | No | No | No |

Rules:

- UI hiding is never sufficient; every route and service must enforce the permission.
- Location-scoped permissions must check both business membership and location membership.
- Owner removal must be blocked when it would leave a business without an owner.
- Sensitive operations such as refunds, role changes, export downloads, and billing changes should support re-authentication.

## Safe Implementation Sequence

0. Finish Phase 1 approval:
   - Deploy Phase 1 migration to staging.
   - Complete Phase 1 QA.
   - Record product-owner approval.

1. Location foundation behind feature flags:
   - Add location schema and default-location backfill.
   - Add `requireLocationAccess`.
   - Add hidden location selector for owners only.
   - Keep all users on default location until enabled.
   - Status: implemented behind disabled Phase 2 flags.

2. Location-aware stock:
   - Add `InventoryBalance`.
   - Update product reads to aggregate balances.
   - Update stock in/out, POS checkout, returns, and offline queue to include location.
   - Status: implemented for dashboard reads, product creation, sales, POS checkout, manual stock moves, customer returns, supplier returns, transaction reversals, and offline payloads while maintaining the legacy aggregate stock cache.

3. Warehouse transfers:
   - Implement transfer draft/approve/in-transit/receive/cancel lifecycle.
   - Add discrepancy records and transfer document.
   - Add tests before enabling UI.
   - Status: service, gated APIs, stock page UI, damaged/shortage discrepancy fields, transfer numbers, idempotency, audit events, and flag-gate/helper tests are implemented. Full lifecycle e2e coverage, printable transfer document, and offline receiving remain staging QA/support-documentation items before broad activation.

4. Advanced reporting centre:
   - Create report definitions and query layer.
   - Add date filters, pagination, CSV.
   - Add PDF/export queue for heavy reports.
   - Status: 24-report definition catalogue, optional `locationId` filters, gated definitions API, export job records, CSV/PDF generation, and audit logging are implemented behind disabled flags. Large exports currently complete synchronously and should move to object storage/background workers before high-volume rollout.

5. Tax and document snapshots:
   - Add optional tax config.
   - Add invoice/receipt/quote/statement snapshots.
   - Add branded PDF/WhatsApp/email delivery.
   - Status: optional tax config/rates, immutable document/tax snapshot tables, settings APIs, and settings UI are implemented behind disabled flags. Delivery channels and final branded document templates require staging QA with production email/WhatsApp credentials.

6. Localization:
   - Add i18n framework and English keys.
   - Add locale formatting.
   - Add reviewed translations progressively.
   - Status: locale files for English, French, Swahili, Hausa, Yoruba, and Igbo, formatting helpers, user/business language preferences, API, and completeness check script are implemented. Human copy review remains required before enabling non-English locales broadly.

7. Granular permissions and announcements:
   - Add role templates and permission registry.
   - Add announcement inbox/admin controls.
   - Status: permission registry, policy persistence, settings UI, announcement inbox/admin APIs, read/dismiss tracking, and flag gates are implemented. Sensitive-operation re-authentication remains a hardening item before broad release.

8. Multi-business hardening:
   - Add last-used business server-side.
   - Audit all localStorage and dashboard cache paths for cross-tenant leakage.
   - Status: dashboard/business selection passes business ids through server-side access checks, location storage is business-scoped, and the subscription entitlement context is checked per business. A server-side last-used-business preference can be added after the first internal rollout.

## Testing Plan

Required tests before Phase 2 release:

- Default location backfill integrity.
- Existing single-location sale/expense/stock flows unchanged.
- Location access denied across branches.
- POS checkout decrements only selected location.
- Return restores only selected location.
- Transfer lifecycle and discrepancy handling.
- Report reconciliation against source records.
- Tax snapshot immutability.
- Invoice branding snapshot immutability.
- Locale fallback and translation completeness.
- Permission matrix.
- Subscription entitlement enforcement.
- Business switching data isolation.

Critical E2E scenarios:

1. Existing business receives a default location without data loss.
2. Owner creates a second branch and assigns staff to only that branch.
3. Warehouse transfer is drafted, approved, sent, received, and reconciled accurately.
4. Location-restricted staff cannot read or mutate another branch.
5. Issued invoice remains unchanged after profile/branding update.
6. Tax setting changes do not mutate historical invoices.
7. Advanced report reconciles with source records.
8. User switches businesses without stale dashboard data or cross-tenant leakage.
9. Downgraded business retains data but loses restricted writes.

Manual QA checklist:

1. Run Phase 1 smoke checks first with Phase 2 flags disabled.
2. Apply location migration to staging and confirm every business has exactly one default location.
3. Confirm existing stock balances match pre-migration totals.
4. Enable locations for one internal business only.
5. Create branch, warehouse, damaged-goods, transit, and virtual locations.
6. Assign a staff user to one location and confirm server-side denial outside that location.
7. Record sale, expense, POS checkout, return, and stock adjustment against a selected location.
8. Transfer stock between locations through the full lifecycle.
9. Record discrepancy on receipt and confirm immutable history.
10. Generate every advanced report with date and location filters.
11. Export small report synchronously and large report through queue.
12. Issue branded invoice, then change branding and confirm old invoice snapshot is unchanged.
13. Enable tax config, issue inclusive/exclusive examples, then confirm tax snapshot immutability.
14. Change language preference and verify layout, dates, currency, and fallback text.
15. Switch businesses and confirm active-business indicator, data isolation, and subscription context.

## Deployment Plan

Staging:

1. Backup staging database.
2. Apply additive migrations.
3. Run default-location backfill verification queries.
4. Run lint, typecheck, test, build.
5. Run location and transfer e2e tests.
6. Validate feature flags off by default for non-eligible plans.

Production:

1. Backup production database.
2. Deploy migrations separately from UI activation.
3. Keep Phase 2 feature flags disabled.
4. Enable internal owner-only testing.
5. Monitor API errors, transfer discrepancies, report generation failures, and entitlement denials.
6. Gradually enable by plan/business.

Rollback:

- Disable feature flags first.
- Redeploy previous app build if needed.
- Leave additive tables in place unless a data-corruption rollback script is approved.
- Do not drop location tables during incident response.

## Safe Next Step Execution

Executed on 2026-07-17:

- Confirmed Vercel has `DATABASE_URL` and `DIRECT_URL` configured for Production only; no Preview/Staging database is currently configured.
- Created an application-level pre-migration backup: `backups/pre-phase2-completion-modules-2026-07-17T05-05-27-007Z.json.gz`.
- Generated a read-only migration diff artifact: `backups/phase2-completion-diff-2026-07-17T05-06-09.sql`.
- Hardened the pending completion migration with a guarded index rename for the already-applied location migration's PostgreSQL-truncated movement index.
- Did not apply `20260717130000_phase_2_completion_modules` to production. The next deployable step needs either a real staging database or explicit approval to apply the additive production migration with Phase 2 flags disabled.

Support documentation:

- Explain locations in plain language: shop, branch, warehouse, storage, damaged goods, transit.
- Explain when to use transfers versus stock adjustment.
- Explain why a staff member may not see another location.
- Explain that tax reports support recordkeeping and are not professional tax advice.
- Explain that downgrades keep data but may restrict new writes or exports.
- Provide a support script for reconciling transfer discrepancies.

Admin documentation:

- How to enable Phase 2 feature flags for a business.
- How to inspect transfer discrepancies.
- How to monitor export queue failures.
- How to verify default-location backfill.
- How to review entitlement denials.
- How to disable Phase 2 during an incident without dropping data.

## Operational Monitoring

Add structured events for:

- location.created
- location.archived
- location_access.denied
- transfer.created
- transfer.approved
- transfer.received
- transfer.discrepancy
- report.generated
- report.export_failed
- tax_snapshot.created
- document_snapshot.created
- entitlement.denied
- business.switched

Monitoring dashboards should include:

- Location access denials by business and route.
- Transfer discrepancies by location and item.
- Export queue pending/failed counts.
- Report generation duration and timeout rate.
- Tax snapshot creation count.
- PDF generation failures.
- Announcement read/dismiss rates.
- Business switch events and denied switch attempts.
- Entitlement denials by feature and plan.

## Deliverable Status

| Deliverable | Status |
|---|---|
| Architecture audit | Complete in this document |
| Schema and migration plan | Location foundation applied in production; additive Phase 2 completion migration prepared locally for export/tax/document/i18n/permission/announcement modules |
| Implemented code | Location-aware stock/POS/returns, hidden location selector, optional location reports, gated transfers UI/APIs, 24-report catalogue, export jobs, tax settings, document branding, localization, permission policies, and announcements implemented behind disabled flags |
| Tests | Location access, inventory balance helper, transfer API gate, reporting catalogue, and Phase 2 API flag-gate tests added; broader staging e2e tests pending |
| Permission matrix | Drafted in this document |
| Feature entitlement matrix | Drafted in this document |
| Localization structure | Implemented with locale files, formatter helpers, preferences API, and completeness script |
| Reporting definition document | Implemented as `src/lib/reports/definitions.ts` with all 24 Phase 2 reports |
| Manual QA checklist | Drafted in this document |
| Deployment and rollback plan | Drafted in this document |
| Environment-variable changes | Phase 2 flags added to `.env.example` |
| Operational monitoring plan | Drafted in this document |
| User documentation | Support/admin outline drafted; final user-facing help articles pending staging QA screenshots |

## Decision

Do not enable Phase 2 broadly yet.

The current engineering action is to keep Phase 2 disabled in production until the additive completion migration is applied in staging, staging QA passes, and product/support approve the rollout plan. The code paths are ready for internal flagged testing; production activation should be a separate deployment decision.
