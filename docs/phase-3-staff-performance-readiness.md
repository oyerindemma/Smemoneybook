# Phase 3 Staff Performance Readiness

Branch: `phase-3-staging`

## Scope

Phase 3 Step 1 is a read-only Staff Performance workflow for business owners and explicitly authorized managers. It must report factual operational activity only. It must not make employment decisions, infer personal qualities, create disciplinary actions, change salaries, modify transactions, or write accounting records.

## Available Staff Attribution Fields

- `BusinessMember.userId`, `BusinessMember.businessId`, `BusinessMember.role`, `BusinessMember.createdAt`: staff membership and role for a business.
- `BusinessLocationMember.userId`, `businessId`, `locationId`, `role`: location-level membership for staff and managers.
- `AuditLog.actorId`, `businessId`, `action`, `metadata`, `createdAt`: actor attribution for operational actions, including `transaction.sale`, `transaction.expense`, `pos.sale`, `transaction.reversed`, `customer.return`, `supplier.return`, `debt.collected`, `debt.supplier_settled`, inventory and transfer actions. Some actions include useful metadata such as `transactionId`, `locationId`, `amount`, or `transferId`; others currently do not.
- `DebtEvent.actorId`, `debtId`, `type`, `amount`, `createdAt`: reliable attribution for customer collections and supplier settlements.
- `InventoryMovement.actorId`, `businessId`, `locationId`, `sourceLocationId`, `destinationLocationId`, `type`, `adjustmentType`, `quantityDecimal`, `transactionId`, `createdAt`: reliable attribution for stock-in and stock-out operations.
- `CustomerReturn.actorId`, `businessId`, `locationId`, `refundAmount`, `createdAt`: reliable attribution for customer return operations.
- `SupplierReturn.actorId`, `businessId`, `locationId`, `settlementAmount`, `createdAt`: reliable attribution for supplier return operations.
- `StockTransfer.createdById`, `approvedById`, `sentById`, `receivedById`, plus matching timestamps: reliable attribution for transfer lifecycle actions.
- `IssuedDocument.actorId`, `businessId`, `locationId`, `type`, `total`, `createdAt`: reliable attribution for issued invoices where the issued document workflow is used.
- Existing report/audit infrastructure: `AuditLog` can record report viewed/exported events without storing report contents.

## Missing Attribution Fields

- `Transaction` has no `actorId`, `createdById`, or `updatedById`. Manual sales and expenses can be counted from audit logs when `AuditLog.actorId` is present, but their amounts cannot always be tied back to a transaction without `metadata.transactionId`.
- `TransactionPayment` has no `actorId`, so payment-level staff contribution is unavailable except through surrounding debt or POS audit events.
- `Debt` has no creator attribution; staff attribution starts at `DebtEvent`.
- `AuditLog` entries for `transaction.sale` and `transaction.expense` currently do not include transaction id, amount, or location metadata in all paths.
- `StockTransfer` has no cancelled-by field; cancellation actor is available through `AuditLog` when the audit event exists.
- `Receipt` has `actorId`, but receipt extraction does not directly prove a staff member recorded an expense transaction.
- There is no `MANAGER` or `ADMIN` role enum. Manager-style access must use explicit permission policies or overrides for the existing `STAFF` or `ACCOUNTANT` roles.

## Reusable Services

- `src/lib/operations/access.ts`: membership lookup, role defaults, and location access patterns.
- `src/lib/billing/subscriptions.ts`: active subscription and minimum-plan checks.
- `src/lib/phase3/feature-flags.ts`: Phase 3 default-off rollout flags and global kill switch.
- `src/lib/api/http.ts` and `src/lib/api/validation.ts`: route error helpers and request validation patterns.
- `src/lib/reports/csv.ts` and adjacent export routes: CSV response style.
- `src/lib/locations/service.ts`: business/location membership validation pattern.
- Existing operational services in `src/lib/bookkeeping/persistence.ts`, `src/lib/pos/checkout.ts`, `src/lib/returns/service.ts`, and `src/lib/transfers/service.ts` define the audit actions and metadata emitted by current workflows.

## Data-Quality Limitations

- Staff-level sales amount is reliable only when a sale can be tied to a staff actor and a concrete transaction amount. Current POS audit events include `transactionId`; manual sale audit events do not always include enough metadata.
- Manual expense counts can be attributed from audit actor data, but expense amounts cannot always be attributed to a staff member because `Transaction` has no actor column.
- Location filtering is reliable for records with `locationId`, `sourceLocationId`, `destinationLocationId`, or audit metadata location ids. Records without location fields remain business-scoped and are reported as location-unattributed when a location filter is applied.
- Historical transactions created before richer audit metadata cannot be backfilled safely without guessing.
- Payroll data exists but must not be used for Staff Performance Step 1 because it contains salary/employment information and is outside the operational metrics requested here.
- No composite score is required for Step 1. Factual metrics avoid unexplained rankings and employment-decision language.

## Required Additive Schema Changes

No migration is required for the read-only Step 1 implementation. The module can use existing attribution fields and data-quality notes.

Recommended future additive changes:

- Add nullable `actorId` or `createdById` to `Transaction` and populate it on transaction creation.
- Add nullable `actorId` to `TransactionPayment`.
- Include `transactionId`, `amount`, and `locationId` in all sale and expense audit log metadata.
- Add `cancelledById` to `StockTransfer` if cancellation metrics need direct-column attribution.

## Permission And Entitlement Requirements

- Feature flag must be enabled by both the public Preview flag and a server-side flag:
  - `NEXT_PUBLIC_PHASE3_STAFF_PERFORMANCE_ENABLED=true`
  - `PHASE3_STAFF_PERFORMANCE_ENABLED=true`
- Default state remains off.
- User must be authenticated.
- User must have an active business membership for the requested `businessId`.
- User must have the required permission:
  - `staff_performance:read` for summary/detail.
  - `staff_performance:export` for CSV export.
- `OWNER` receives read and export by default.
- `STAFF` and `ACCOUNTANT` require explicit permission policy or override for read/export.
- Location filters must reference a location in the same business. Non-owner users must have access to the requested location unless they have business-wide permission.
- The current product plan gate should require Pro because Staff Performance depends on team controls, granular permissions, audit tools, and advanced reports.
