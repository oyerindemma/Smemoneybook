# Phase 3 Bank Reconciliation Readiness

Branch: `phase-3-staging`

## Current Footprint

Bank Reconciliation already has a Phase 3 foundation, but it is not Preview-ready as a complete workflow.

Reusable pieces:

- Existing route: `/more/bank-reconciliation`.
- Existing API foundation: `src/app/api/bank-reconciliation/route.ts`.
- Existing parser/matcher/service foundation: `src/lib/phase3/bank-reconciliation.ts` and `src/lib/phase3/bank-reconciliation-service.ts`.
- Existing UI shell: `src/components/reconciliation/BankReconciliationPanel.tsx`.
- Existing migration: `20260719083000_phase_3_bank_reconciliation`.
- Existing models: `BankStatementImport`, `BankStatementImportRow`, `BankReconciliationMatch`.
- Existing transaction sources: `Transaction`, `TransactionPayment`, `Debt`, `DebtEvent`, `IssuedDocument`, `CustomerReturn`, `SupplierReturn`, `StockTransfer`, `InventoryMovement`, `PaymentEvent`.
- Existing access foundations: `BusinessMember`, `BusinessLocation`, `BusinessLocationMember`, `PermissionPolicy`, `PermissionOverride`.
- Existing audit log: `AuditLog`.
- Existing CSV export patterns: `src/lib/reports/csv.ts`, `src/lib/staff-performance/export.ts`.

Current limitations:

- Only the public flag `NEXT_PUBLIC_PHASE3_BANK_RECONCILIATION_ENABLED` is wired; there is no server-side `PHASE3_BANK_RECONCILIATION_ENABLED` gate.
- The More page treats the module as partial and shows `Coming soon` while disabled.
- The parser assumes auto-detected headers and only comma CSV; there is no upload-preview-column-map-confirm workflow.
- Duplicate detection covers same-file duplicate rows and duplicate file hash only; cross-import duplicate row classification is incomplete.
- API is consolidated into `GET`, `POST`, and `PATCH` on `/api/bank-reconciliation`; requested nested workflow endpoints are missing.
- Existing permissions use broad `money:write`; dedicated reconciliation permissions are missing.
- There is no `bank_reconciliation` entitlement.
- Confirm/reject exists, but manual match, unmatch, ignore, and reopen ignored entry are missing.
- Audit logging uses generic `AuditLog` only and does not preserve a dedicated reconciliation action ledger.
- CSV export is missing.
- UI does not expose a reconciliation queue, entry detail, suggestion review, manual match, ignore/reopen, or export.

## Missing Schema

The existing additive models cover the base import, row, and match records, but need additive extension:

- `BankAccountProfile` for non-sensitive bank account labels and masked account metadata.
- `BankReconciliationAction` for an immutable workflow action ledger.
- Import metadata fields for account label, bank name, file size, currency, opening balance, and closing balance.
- Row metadata fields for value date, normalized description, debit amount, credit amount, signed amount, duplicate status, and external reference.
- Match metadata fields for reviewed-by/timestamp and deterministic confidence reasons.

No unmasked bank credentials, online banking passwords, or live bank access tokens should be stored.

## Required Permissions

Add dedicated permissions:

- `bank_reconciliation:read`
- `bank_reconciliation:import`
- `bank_reconciliation:match`
- `bank_reconciliation:review`
- `bank_reconciliation:export`
- `bank_reconciliation:ignore`

Expected defaults:

- `OWNER`: full access.
- `ACCOUNTANT`: full reconciliation access.
- `STAFF`: no reconciliation access by default.
- Explicit policies/overrides may grant specific permissions to manager-like staff roles.

Every API must enforce business membership, entitlement, and the required reconciliation permission server-side.

## Feature Flags

Exact flags:

- `NEXT_PUBLIC_PHASE3_BANK_RECONCILIATION_ENABLED`
- `PHASE3_BANK_RECONCILIATION_ENABLED`

Requirements:

- Both default to `false`.
- Public flag controls navigation and UI visibility.
- Server flag plus public flag protects all API and route logic.
- The global Phase 3 kill switch still disables the module.
- Production must remain disabled.

Navigation status should move from `Coming soon` to `Unavailable` once the implementation is complete but disabled, and to `Preview` only after Preview QA passes.

## Expected Routes And APIs

Primary route:

- `/more/bank-reconciliation`

APIs to add or complete:

- `POST /api/bank-reconciliation/imports/preview`
- `POST /api/bank-reconciliation/imports`
- `GET /api/bank-reconciliation/imports`
- `GET /api/bank-reconciliation/imports/[id]`
- `GET /api/bank-reconciliation/entries`
- `GET /api/bank-reconciliation/entries/[id]`
- `GET /api/bank-reconciliation/entries/[id]/suggestions`
- `POST /api/bank-reconciliation/matches/[id]/confirm`
- `POST /api/bank-reconciliation/matches/[id]/reject`
- `POST /api/bank-reconciliation/matches/[id]/unmatch`
- `POST /api/bank-reconciliation/entries/[id]/manual-match`
- `POST /api/bank-reconciliation/entries/[id]/ignore`
- `POST /api/bank-reconciliation/entries/[id]/reopen`
- `GET /api/bank-reconciliation/export`

The legacy `/api/bank-reconciliation` route can remain as a compatibility wrapper.

## Import Formats

CSV-only first release:

- UTF-8 text.
- Comma-separated and semicolon-separated files.
- Quoted fields.
- Debit/credit columns.
- Single signed amount column.
- Optional running balance.
- Optional reference.
- Optional bank name/account label metadata.
- User-confirmed column mapping.

Reject:

- Empty files.
- Unsupported or binary-looking content.
- Files beyond configured size.
- Row counts beyond configured maximum.
- Missing transaction date.
- Missing description.
- Missing debit/credit or signed amount.
- Invalid date/amount rows above tolerance.

## Duplicate Strategy

Duplicate levels:

- Duplicate file: same `businessId` plus source checksum; reject confirmation and return a clear error.
- Duplicate row within same file: same business-scoped row fingerprint; mark as `DUPLICATE` and preserve the row.
- Duplicate row across imports: mark as probable duplicate, reference the prior row where possible, and do not delete either row.

Row fingerprint logic should include:

- `businessId`
- transaction date
- signed amount
- normalized description
- external reference when present

## Matching Strategy

First release supports one statement row to one internal transaction.

Signals:

- Exact amount.
- Direction: bank credit as inflow, bank debit as outflow.
- Date distance: exact, plus one, three, and seven-day tolerance.
- Reference similarity.
- Description/customer/supplier similarity.
- Account and location where available.
- Reversal/cancellation exclusion.

Confidence:

- 90-100: strong suggestion.
- 70-89: likely.
- 50-69: weak but reviewable.
- Below 50: do not suggest.

No match may be auto-confirmed.

## Write Restrictions

Bank Reconciliation may write only reconciliation/import/review/audit records.

It must not:

- create accounting transactions silently;
- alter account balances;
- delete bank statement rows;
- delete match history;
- initiate bank payments;
- connect to live bank accounts.

## Security Risks

- Bank statement descriptions can contain sensitive counterparties; avoid unnecessary logging.
- CSV injection in export must be neutralized.
- Imported text must remain business-scoped.
- Duplicate detection must not leak cross-business row existence.
- Reconciliation decisions must be auditable by user and timestamp.
- Preview database credentials must remain masked.

## Migration Plan

Add one additive migration for:

- `BankAccountProfile`
- `BankReconciliationAction`
- additional nullable/defaulted fields and indexes on existing Bank Reconciliation tables.

Review SQL before deploying. Apply only to the phase-3-staging Neon Preview branch with `npx prisma migrate deploy`; never use `prisma migrate dev` against Preview.

## Preview QA Plan

1. Keep flags disabled while implementing.
2. Run unit/API/Playwright locally with flags on.
3. Validate Prisma and migration status against phase-3-staging Neon.
4. Configure only Vercel Preview branch `phase-3-staging`:
   - `PHASE3_BANK_RECONCILIATION_ENABLED=true`
   - `NEXT_PUBLIC_PHASE3_BANK_RECONCILIATION_ENABLED=true`
5. Deploy `phase-3-staging` to Vercel Preview.
6. Test the newest Preview deployment:
   - More card status.
   - CSV upload and mapping preview.
   - Confirm import.
   - Duplicate file and duplicate row handling.
   - Suggested match review.
   - Confirm, reject, manual match, unmatch.
   - Ignore and reopen.
   - Summary progress.
   - CSV export.
   - Unauthorized and cross-business rejection.
   - No native 404 or unexpected 500.

