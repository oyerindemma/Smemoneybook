# SME MoneyBook Phase 3F Bank Reconciliation

Status: implemented as a gated foundation on `phase-3-staging`.

Bank Reconciliation lets a business import CSV bank statements, review suggested matches against recorded SME MoneyBook transactions, confirm or reject matches, and lock completed reconciliations. It does not mutate financial records automatically.

## Implemented Scope

- Feature-gated by `NEXT_PUBLIC_PHASE3_BANK_RECONCILIATION_ENABLED`.
- API:
  - `GET /api/bank-reconciliation` lists imports or returns one import with rows and matches.
  - `POST /api/bank-reconciliation` imports a CSV statement and stores suggested matches.
  - `PATCH /api/bank-reconciliation` confirms/rejects matches, locks imports, or reopens locked imports.
- Access controls:
  - authenticated user
  - business membership
  - `money:write` permission
  - optional location access when `locationId` is supplied
  - Growth-or-higher active plan
- Snapshot version: `bank-reconciliation-v1`.
- Tables:
  - `BankStatementImport`
  - `BankStatementImportRow`
  - `BankReconciliationMatch`
- Additive migration only: `20260719083000_phase_3_bank_reconciliation`.
- More page route: `/more/bank-reconciliation`.
- Audit events:
  - `bank_reconciliation.imported`
  - `bank_reconciliation.confirm_match`
  - `bank_reconciliation.reject_match`
  - `bank_reconciliation.lock_import`
  - `bank_reconciliation.reopen_import`

## CSV Import

The parser supports common headers:

- Date: `date`, `posted at`, `transaction date`, `value date`
- Description: `description`, `narration`, `details`, `memo`, `particulars`
- Amount: signed `amount`, or separate `debit` and `credit`
- Optional: `reference`, `balance`

Rows are normalized into:

- posted date
- absolute amount
- direction: `inflow` or `outflow`
- description
- optional reference
- optional balance
- fingerprint
- suggested category

## Duplicate Prevention

- File-level duplicate prevention uses a SHA-256 hash of the CSV payload and unique `(businessId, fileHash)`.
- Row-level duplicate detection uses date, amount, direction, normalized description, and reference.
- Duplicate rows are stored with `DUPLICATE` status for audit visibility.

## Matching

Initial deterministic matching uses:

- amount match
- date proximity
- cash direction
- selected account match
- description/customer/supplier overlap
- transaction payment status
- transfer detection
- reversal exclusion

Match types:

- `exact`
- `likely`
- `possible_transfer`
- `missing_record`
- `duplicate`

Suggested matches require human confirmation. Missing-record suggestions are review items, not automatic transaction creation.

## Lock And Reopen

- Imports can be locked only when unmatched and suggested rows have been reviewed.
- Locked imports cannot accept match confirmation/rejection.
- Reopening increments the import version and records `reopenedAt`.
- No rows or matches are deleted during reopen.

## Safeguards

- No bank import can change account balances automatically.
- No unmatched statement row creates a transaction automatically.
- Reversals and adjustment entries are excluded from ordinary match suggestions.
- Raw CSV content is parsed server-side and stored as row-level raw JSON for audit review.
- Tokens, secrets, and unrelated files are not accepted by the import API.

## Remaining Work

- XLSX support with strict file validation.
- PDF support only if reliable structured extraction is available.
- Detailed row review UI for confirm/reject/ignore actions.
- Missing-record creation flow with explicit user confirmation.
- Reconciliation export report.
- Scheduled duplicate monitoring across imports.
- More matching signals from payment references and channels.

Phase 3F is ready for internal flagged QA, not broad Production activation.
