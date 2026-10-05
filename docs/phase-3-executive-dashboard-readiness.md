# Phase 3D Executive Dashboard Readiness

Status: audit complete for `phase-3-staging`.

## Reusable Metric Services

- Dashboard state: `src/lib/bookkeeping/persistence.ts` owns authenticated business state, accounts, recent transactions, debts, inventory, locations, permissions, and active plan features.
- Daily dashboard helpers: `src/lib/dashboard/dashboard-summary.ts` owns current owner-facing daily totals.
- Reports: `src/lib/reports/*` owns report/export conventions and CSV output patterns.
- Staff Performance: `src/lib/staff-performance/service.ts` owns staff activity attribution, unattributed records, comparison periods, and staff-performance disclaimers.
- Bank Reconciliation: `src/lib/bank-reconciliation/service.ts` and reconciliation models own imported rows, matches, unmatched rows, duplicates, and reconciliation audit actions.
- Tax Assistant: `src/lib/tax-assistant/service.ts` owns deterministic VAT/WHT/tax-readiness metrics and verified rule-set source metadata.
- Billing: `src/lib/billing/plans.ts` and `src/lib/billing/subscriptions.ts` own plan feature gating.
- Permissions: `src/lib/operations/access.ts` owns role defaults; permission policy/override tables support granular grants.

## Canonical Metric Owners

- Sales, expenses, profit, payment status, reversals: `Transaction`.
- Customer and supplier balances: `Debt` and `DebtEvent`.
- Stock value, low stock, warehouse inventory: `InventoryItem`, `InventoryBalance`, `BusinessLocation`, `StockTransfer`.
- Reconciliation status: `BankStatementImport`, `BankStatementImportRow`, `BankReconciliationMatch`.
- Tax readiness: Tax Assistant deterministic summary.
- Staff operations: Staff Performance deterministic summary.
- Freshness and source counts: Executive Dashboard service output.

## Existing Executive Dashboard Foundation

- `ExecutiveDashboardSnapshot` already exists from migration `20260719123000_phase_3_executive_dashboard`.
- Existing route `/api/executive-dashboard` and UI panel are too narrow for Phase 3D.
- Existing UI includes a user-facing "Save" snapshot action; Phase 3D should use read-only refresh/export instead.
- Existing feature gating only uses `NEXT_PUBLIC_PHASE3_EXECUTIVE_DASHBOARD_ENABLED`; Phase 3D also requires `PHASE3_EXECUTIVE_DASHBOARD_ENABLED`.

## Missing Metrics And Formula Gaps

- Previous-period comparisons are missing.
- Revenue does not distinguish paid and credit sales.
- Expenses do not include category breakdowns.
- Cash movement is not separated from account balance, and bank balance should not be presented as authoritative.
- Receivable/payable ageing and top counterparties are missing.
- Bank reconciliation imported/matched/unmatched/duplicate totals are missing.
- Tax readiness is not integrated.
- Staff operations are not integrated.
- Data-quality disclosure is too thin for owner decisions.

## Data-Quality Limitations

- Some historic transactions may not have categories, customer/supplier links, receipt evidence, or staff attribution.
- Transaction-created actor is not stored directly on `Transaction`; staff attribution must reuse audit/event evidence from Staff Performance.
- Stock profit uses recorded cost prices and may be partial when cost prices are missing or stale.
- Imported bank rows are authoritative only for imported statements, not all real bank activity.
- Tax estimates remain deterministic and rule-source-bound; they are not filed liabilities.
- WHT is recorded-only through Tax Assistant and must not be inferred from descriptions.

## Schema Needs

- No new schema is required for Phase 3D Preview.
- Existing `ExecutiveDashboardSnapshot` can support future cache/history, but Phase 3D should calculate on demand and disclose freshness.
- Any future snapshot-cache migration should add comparison dates, payload, data-quality, expiry, and generated-by fields additively.

## Permissions And Entitlement

- Add entitlement: `executive_dashboard`.
- Add permissions:
  - `executive_dashboard:read`
  - `executive_dashboard:export`
  - `executive_dashboard:view_sensitive`
  - `executive_dashboard:view_staff_summary`
- Owner: full access.
- Accountant: read/export/sensitive financial-tax summary, no staff summary by default.
- Staff: no Executive Dashboard access by default.
- Server APIs must enforce membership, permission, entitlement, feature flags, and optional location scope.

## Feature Flags

Required flags:

- `PHASE3_EXECUTIVE_DASHBOARD_ENABLED`
- `NEXT_PUBLIC_PHASE3_EXECUTIVE_DASHBOARD_ENABLED`

Both are disabled by default and must be enabled only for `Preview` on Git branch `phase-3-staging` after local validation.

## Query Performance Risks

- Executive Dashboard touches many tables; date-bounded queries are required.
- Transaction and bank-row windows must include only the current and comparison periods.
- Drill-down endpoints must be limited and typed.
- Independent aggregations should run in parallel, but all queries must remain business scoped.
- Avoid N+1 staff/customer/supplier lookups by selecting related names in bounded queries.

## Preview QA Plan

- Validate local lint, typecheck, tests, build, Prisma validate/status, and `git diff --check`.
- Configure Preview branch flags only after local validation.
- Confirm Preview deployment commit, branch, environment, and Ready status.
- Seed disposable Preview-only QA data in the phase-3-staging database.
- QA `/more`, `/more/executive-dashboard`, summary metrics, comparisons, drill-down, attention queue, partial/empty states, export, unauthorized access, business isolation, method `405`s, and no unexpected `404`/`500`.
- Do not touch Production, phase-2-staging, or `main`.
