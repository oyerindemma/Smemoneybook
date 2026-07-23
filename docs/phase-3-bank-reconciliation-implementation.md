# Phase 3 Bank Reconciliation Implementation

Branch: `phase-3-staging`

## Scope

Phase 3B Bank Reconciliation is implemented as a gated Preview workflow for CSV-based reconciliation review.

Implemented capabilities:

- CSV import preview with user-confirmed column mapping.
- CSV import confirmation into additive statement import/entry records.
- Same-file duplicate detection and cross-import probable duplicate classification.
- Deterministic one-to-one match suggestions against paid SME MoneyBook transactions.
- Suggested match confirm/reject.
- Manual match.
- Unmatch.
- Ignore and reopen statement entries.
- Queue progress by suggested, unmatched, matched, ignored, and duplicate rows.
- Statement entry detail view.
- Date/search/import filters.
- CSV export with spreadsheet formula protection.
- Dedicated action ledger plus `AuditLog` events.

Bank Reconciliation does not connect to banks, initiate payments, create accounting transactions, alter account balances, or delete statement evidence.

## Feature Flags

Exact Bank Reconciliation flags:

- `NEXT_PUBLIC_PHASE3_BANK_RECONCILIATION_ENABLED`
- `PHASE3_BANK_RECONCILIATION_ENABLED`

No additional Bank Reconciliation-specific flags are used.

Source consumption:

- Server-side API/route authorization: `src/lib/bank-reconciliation/authorization.ts` requires both Bank Reconciliation flags and respects `PHASE3_AI_GLOBAL_KILL_SWITCH`; all Bank Reconciliation API routes call `requireBankReconciliationAccess`.
- Client-side navigation/UI visibility: `src/lib/phase3/feature-flags.ts` reads `NEXT_PUBLIC_PHASE3_BANK_RECONCILIATION_ENABLED`; `/more` uses that public flag for the Bank Reconciliation navigation status; `/more/bank-reconciliation` renders the panel only when the public flag and server helper are enabled.
- Tests: `src/lib/bank-reconciliation/authorization.test.ts`, `src/lib/phase3/bank-reconciliation.test.ts`, `src/lib/bank-reconciliation/export.test.ts`, `src/app/api/bank-reconciliation/route.test.ts`, `src/lib/phase3/navigation-status.test.ts`, and `tests/e2e/bank-reconciliation.spec.ts`.

Vercel Preview configuration completed on 2026-07-23:

- `PHASE3_BANK_RECONCILIATION_ENABLED=true` for Environment `Preview`, Git branch `phase-3-staging`.
- `NEXT_PUBLIC_PHASE3_BANK_RECONCILIATION_ENABLED=true` for Environment `Preview`, Git branch `phase-3-staging`.
- `DATABASE_URL`, `DIRECT_URL`, and `NEXT_PUBLIC_APP_URL` confirmed present for Environment `Preview`, Git branch `phase-3-staging`.
- `DATABASE_URL` and `DIRECT_URL` were kept sensitive; values were not printed.
- Branch Preview DB structural check through `vercel env run -e preview --git-branch phase-3-staging` confirmed PostgreSQL URLs present, not redacted placeholders, Neon-backed, with no production target markers.
- Production variables were not modified. `phase-2-staging` variables were not modified.

## Permissions And Entitlement

Added permission strings:

- `bank_reconciliation:read`
- `bank_reconciliation:import`
- `bank_reconciliation:match`
- `bank_reconciliation:review`
- `bank_reconciliation:export`
- `bank_reconciliation:ignore`

Defaults:

- `OWNER`: full access.
- `ACCOUNTANT`: full access.
- `STAFF`: no access by default unless an explicit policy or override grants a specific permission.

Added billing entitlement:

- `bank_reconciliation`

The entitlement is included in Growth and Pro plan feature sets.

## Schema Changes

Additive migration:

- `20260723143000_phase_3_bank_reconciliation_completion`

Schema additions:

- New `BankAccountProfile` model for non-sensitive bank/account labels and masked account metadata.
- New `BankReconciliationAction` model for a dedicated reconciliation workflow ledger.
- `BankStatementImport`: added bank profile, account label, bank name, file size, currency, opening balance, and closing balance fields.
- `BankStatementImportRow`: added value date, normalized description, external reference, debit amount, credit amount, signed amount, duplicate status, `updatedAt`, and action relation.
- `BankReconciliationMatch`: added confidence reasons, suggested-by, reviewed-by, reviewed-at, and action relation fields.
- Added indexes for bank profile filtering, duplicate status queues, and reconciliation actions.

Migration SQL was inspected before deployment and is additive only.

## APIs

Primary APIs:

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

Compatibility API:

- `/api/bank-reconciliation` remains as a compatibility wrapper for import/list/detail and legacy `PATCH` review actions, but now uses the exact private/public feature flags and dedicated reconciliation access checks.

## UI Route

- `/more/bank-reconciliation`

The route includes CSV upload, mapping preview, import confirmation, import selector, progress summary, queue tabs, date/search filters, entry list, entry detail, suggestion confirm/reject, manual match, unmatch, ignore, reopen, export, loading, empty, and error states.

The More page now shows `Unavailable` while the module is implemented but disabled, and `Preview — operational` when the public flag is enabled.

## Validation

Completed locally on 2026-07-23:

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `NEXT_PUBLIC_PHASE3_BANK_RECONCILIATION_ENABLED=true PHASE3_BANK_RECONCILIATION_ENABLED=true npm run test`: passed, 79 files and 280 tests.
- `NEXT_PUBLIC_PHASE3_BANK_RECONCILIATION_ENABLED=true PHASE3_BANK_RECONCILIATION_ENABLED=true npm run build`: passed.
- `npx prisma validate`: passed.
- `npx vercel env run -e preview --git-branch phase-3-staging -- npx prisma migrate status`: initially showed pending migration `20260723143000_phase_3_bank_reconciliation_completion`.
- `npx vercel env run -e preview --git-branch phase-3-staging -- npx prisma migrate deploy`: applied the additive migration.
- `npx vercel env run -e preview --git-branch phase-3-staging -- npx prisma migrate status`: passed; 35 migrations found and database schema is up to date.
- `git diff --check`: passed.
- `NEXT_PUBLIC_PHASE3_BANK_RECONCILIATION_ENABLED=true PHASE3_BANK_RECONCILIATION_ENABLED=true npx playwright test tests/e2e/bank-reconciliation.spec.ts`: passed, 3 tests across desktop Chrome, mobile Chrome, and mobile Safari. The spec executed and did not skip.

Focused evidence covers:

- Owner access.
- Unauthorized-user rejection.
- Business isolation.
- Date filtering.
- Import preview and mapping.
- Statement import.
- Suggested match review.
- Manual match endpoint coverage.
- Staff/default permission denial.
- Empty state.
- CSV export.
- CSV formula-injection protection.
- Feature flag off state.
- Feature flag on state.
- Unsupported write-handler absence on read-only entry detail route.

## Preview QA

Pending deployment and end-to-end Preview QA against the newest Vercel Preview deployment.

## Known Limitations

- CSV only; no OFX/PDF import.
- No live bank connection.
- No payments or balance mutations.
- First release supports one statement row to one internal transaction. Split and grouped match types are reserved for a later workflow.
- Manual match requires a transaction id in the first Preview UI; richer transaction search can be added later.
- Duplicate row reopen preserves duplicate evidence rather than deleting the relationship.
- Preview QA data should be synthetic and should not be treated as production customer evidence.

## Commit And Production Status

- Implementation commit hash: pending commit.
- Preview deployment commit hash: pending deployment.
- Preview URL: pending deployment.
- Production deployment: unchanged by this Preview-only implementation.
- Production database: unchanged by this Preview-only implementation.
- Production Bank Reconciliation flags: not enabled by this implementation.
