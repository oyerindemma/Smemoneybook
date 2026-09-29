# Phase 3G Loan Readiness Readiness Audit

Date: 2026-08-05
Branch: `phase-3-staging`

## Scope

Loan Readiness is a read-only review of bookkeeping and documentation evidence available in SME MoneyBook. It may describe loan application readiness based on recorded records, but it must not approve a loan, reject a loan, issue a credit score, calculate approval probability, recommend a lender, submit an application, or transmit data externally.

Required disclaimer:

> This assessment measures the completeness and consistency of records available in SME MoneyBook. It is not a credit score, loan approval or lending decision. Every lender applies its own eligibility and risk criteria.

## Available Financial Indicators

The repository has real data sources for the module:

- Business profile: `Business`, `ReceiptConfig`, `DocumentBrandingConfig`, and `BusinessTaxProfile`.
- Business age and history: `Business.createdAt`, `Transaction.occurredAt`, `Debt.createdAt`, bank statement dates, tax period snapshots.
- Sales, expenses, and profit: `Transaction` with `SALE`, `EXPENSE`, `amount`, `profit`, `costOfGoods`, `paymentStatus`, `category`, `receiptId`, party links, location scope, and reversal links.
- Receivables and payables: `Debt` with `CUSTOMER_OWES_BUSINESS`, `BUSINESS_OWES_SUPPLIER`, `amount`, `paidAmount`, `dueAt`, and `status`.
- Bank reconciliation: `BankStatementImport`, `BankStatementImportRow`, and `BankReconciliationMatch`.
- Tax readiness: `BusinessTaxProfile`, `TaxPeriodSnapshot`, `TaxReviewItem`, transaction tax fields, and Tax Assistant deterministic summary service.
- Inventory evidence: `InventoryItem`, `InventoryBalance`, `InventoryMovement`, product categories, stock quantities, and costs.
- Document support: `Receipt`, `Transaction.receiptId`, `InventoryMovement.attachmentUrl`, `IssuedDocument`, and document branding fields.
- Audit logging: `AuditLog`.

## Required History Periods

Canonical window: trailing 180 days ending at generation time.

History states:

- Less than 90 days recorded operating history: `Insufficient history`.
- 90 to 179 days: usable, but history warnings remain visible.
- 180 days or more: full window available.

The module should report both business age and recorded activity months. It should not fabricate history from missing periods.

## Data Quality Limitations

- Account balances are recorded app balances, not authoritative bank balances.
- Bank reconciliation coverage exists only for imported bank statements.
- Receipt coverage is limited to `Transaction.receiptId` and receipt rows; old records may have offline receipts not attached.
- Supplier obligations and receivables depend on recorded credit transactions and debt settlement activity.
- Tax readiness depends on configured tax profiles, transaction tax metadata, and open tax review items. It is not a filed return.
- Inventory value is available for stock businesses, but service businesses may legitimately have no inventory.
- Existing custom permission policies are stored, but dashboard state primarily serializes default role permissions.
- No lender-specific document checklist, CAC number, owner BVN, personal guarantees, collateral, or bank-account verification field exists today.

## Canonical Formulas

All formulas must be deterministic, Decimal-safe, business scoped, and inspectable.

- `LR_PROFILE_COMPLETENESS_V1`: completed profile fields / required profile fields.
- `LR_OPERATING_HISTORY_MONTHS_V1`: count of unique months with sales, expenses, payments, debts, bank rows, or tax snapshots inside the calculation window.
- `LR_RECORDED_SALES_MONTHS_V1`: count of unique months containing non-reversed sales.
- `LR_EXPENSE_COMPLETENESS_V1`: months with expenses / active operating months.
- `LR_PROFIT_EVIDENCE_V1`: months with non-negative recorded profit / months with sales and expenses.
- `LR_CASH_MOVEMENT_V1`: months with recorded payments, bank rows, or money movements / active operating months.
- `LR_BANK_RECON_COVERAGE_V1`: matched or ignored bank rows / total imported bank rows.
- `LR_BANK_UNRESOLVED_V1`: unmatched plus suggested bank rows, including their absolute value.
- `LR_CUSTOMER_DEBT_V1`: overdue receivables / open customer receivables, plus top debtor concentration.
- `LR_SUPPLIER_OBLIGATION_V1`: open supplier obligations / trailing revenue.
- `LR_TAX_DATA_READINESS_V1`: tax setup present, active filing period records, and open critical review items.
- `LR_INVENTORY_EVIDENCE_V1`: inventory value and movement coverage for stock businesses; otherwise `Not applicable`.
- `LR_DOCUMENT_COVERAGE_V1`: transactions with receipt or issued document evidence / included sales and expense transactions.
- `LR_DATA_QUALITY_V1`: missing categories, missing party links, duplicates, reversals, unresolved bank entries, and tax review items.
- `LR_COMPOSITE_V1`: weighted category percentage with published weights. The composite is bookkeeping/documentation readiness only and must be capped when critical evidence is missing.

Allowed category statuses:

- `Ready`
- `Needs attention`
- `Insufficient history`
- `Missing data`
- `Not applicable`

## Composite Weights

Weights total 100:

- Business profile completeness: 8
- Bookkeeping history: 10
- Sales consistency: 8
- Expense completeness: 8
- Profitability evidence: 8
- Cash-movement evidence: 8
- Bank reconciliation coverage: 10
- Customer-debt position: 8
- Supplier-obligation position: 7
- Tax-data readiness: 8
- Inventory evidence where applicable: 5
- Supporting-document coverage: 6
- Data-quality and unresolved issues: 6

Caps:

- Any `Missing data` in profile, bookkeeping history, tax readiness, or data quality caps the composite at 60.
- Any `Insufficient history` in bookkeeping history caps the composite at 70.
- Bank rows with less than 25 percent coverage cap the composite at 80 when bank data exists.

The composite label must never be called a credit score, approval probability, creditworthiness decision, or lending recommendation.

## Schema Requirements

Existing schema has `LoanReadinessSnapshot` and `LoanReadinessSharingLog`, but those models predate this gate and store score-oriented fields. Additive completion is required:

- `LoanReadinessProfile` for readiness-only preferences: industry, operating start date, funding purpose, requested amount, preferred currency, and consent-to-share defaulting to false.
- `LoanReadinessDocument` for lender-document checklist references; it must not collect protected characteristics or external banking credentials.
- Add category-result and overall-status fields to snapshots without removing legacy columns.
- Add `generatedByUserId` and optional `expiresAt` to snapshots.

No accounting, tax, bank, stock, debt, or transaction records should be modified by profile writes.

## Feature Gates

Required defaults:

- `PHASE3_LOAN_READINESS_ENABLED=false`
- `NEXT_PUBLIC_PHASE3_LOAN_READINESS_ENABLED=false`

The server must require both public and private Loan Readiness flags to be enabled, unless the global Phase 3 kill switch disables all Phase 3 features.

Entitlement:

- Add `loan_readiness`.

Permissions:

- `loan_readiness:read`
- `loan_readiness:generate`
- `loan_readiness:export`
- `loan_readiness:manage_profile`

Default access:

- Owner: all Loan Readiness permissions.
- Accountant: read, generate, and export.
- Staff: no access by default.
- Admin: no separate enum exists; owner/admin-equivalent access is represented through owner role, business permission policies, or permission overrides.

## Fairness And Discrimination Risks

The module must only use recorded business evidence. It must not collect or infer religion, ethnicity, health data, political affiliation, unrelated personal behaviour, protected personal attributes, or unnecessary personal banking credentials. Funding purpose and requested amount are optional business-readiness preferences, not protected-characteristic inputs.

Wording must remain documentation-oriented. The report should state that lenders use their own criteria.

## API Plan

Create split routes with 405 handlers:

- `GET /api/loan-readiness/summary`
- `GET /api/loan-readiness/categories`
- `GET /api/loan-readiness/evidence`
- `POST /api/loan-readiness/generate`
- `GET /api/loan-readiness/history`
- `GET /api/loan-readiness/export`
- `GET /api/loan-readiness/profile`
- `PUT /api/loan-readiness/profile`

The existing `/api/loan-readiness` route may remain as a compatibility summary/generate endpoint, but new UI should use the split APIs.

## Preview QA Plan

Local validation:

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npx prisma validate`
- `npx prisma migrate status`
- `git diff --check`

Playwright with flags enabled:

- More card status.
- Route load.
- Overview.
- Category detail and evidence.
- Missing-data and insufficient-history states.
- Generate report.
- Export.
- Disclaimer.
- Unauthorized access.
- Mobile Chrome, mobile Safari, desktop Chrome.
- No native 404 and no unexpected 500.

Preview operational classification may only be used after executed Vercel Preview evidence. Without deployed Preview evidence, final classification must be `IMPLEMENTED - DISABLED` or `PARTIALLY IMPLEMENTED`.

## 2026-09-29 Implementation And Local QA

Loan Readiness completion is implemented on `phase-3-staging`. Production remains disabled and unchanged.

### Delivered Surface

- Exact flags: `PHASE3_LOAN_READINESS_ENABLED` and `NEXT_PUBLIC_PHASE3_LOAN_READINESS_ENABLED`; both default to `false` and the server requires both.
- Entitlement: exact `loan_readiness` feature on Growth and Pro.
- Permissions: `loan_readiness:read`, `loan_readiness:generate`, `loan_readiness:export`, and `loan_readiness:manage_profile`.
- Default RBAC: Owner has all four permissions; Accountant has read, generate, and export; Staff has none unless explicitly granted by policy or override.
- Split routes: `summary`, `categories`, `evidence`, `generate`, `history`, `export`, and `profile`, with explicit method guards and `400`/`401`/`402`/`403`/`404`/`405` handling.
- Workflows: deterministic 180-day assessment, evidence and category views, readiness-only profile, document checklist, auditable snapshot history, and CSV export with spreadsheet-formula neutralization.
- Tenant controls: authorization precedes every read or mutation; all service queries and snapshot references include the authorized `businessId`, with optional validated location scope.
- The existing compatibility route remains available for summary/generation and consent logging. Consent logging does not transmit data externally.

### Database

Migration `20260929160000_phase_3_loan_readiness_completion` is additive. It adds nullable snapshot audit/result fields plus `LoanReadinessProfile` and `LoanReadinessDocument`; it does not alter an already-applied migration or remove existing data.

The dedicated Neon Preview branch was independently verified before Prisma execution:

- branch: `phase-3-staging`
- branch ID: `br-hidden-mouse-amlibnj9`
- endpoint ID: `ep-curly-poetry-am5ua3ev`
- both pooled `DATABASE_URL` and direct `DIRECT_URL` parsed as PostgreSQL URLs for that endpoint and not the Production endpoint
- baseline: 41 applied migrations and only the new Loan Readiness migration pending
- `npx prisma migrate deploy`: applied only the reviewed migration to Preview
- final `npx prisma migrate status`: 42 migrations found; schema current; zero pending

Production was not migrated. Its previously verified 41-migration schema remains unchanged; the new migration is reserved for a separately authorized Production release.

### Configuration And Executed Tests

- Vercel Environment `Preview`, Git branch `phase-3-staging`: both exact Loan Readiness flags are `true`.
- No Production flag was changed. Payroll's public and private Preview flags were explicitly pinned to `false`.
- Focused Loan Readiness Vitest: 7 files and 29 tests passed after the final contract correction.
- Full Vitest after all hardening changes: 103 files and 409 tests passed.
- Loan Readiness Playwright: 6 passed and 0 skipped across Desktop Chrome, Pixel 5, and iPhone 13.
- Complete Playwright suite: 69 passed; six intentional Payroll skips (two disabled Payroll scenarios across three browser projects); no Loan Readiness skip.
- Local webpack Production build: passed, including TypeScript and 155 generated pages.
- Normal local Turbopack build: blocked by the host denying an internal worker port; source compilation must therefore also pass in the fresh Vercel Preview before deployment readiness is claimed.
- `npm audit --omit=dev`: zero vulnerabilities.
- Changed-source credential scan: zero actionable credentials; synthetic Paystack keys were confined to tests.

### Remaining Preview Gate

A fresh Vercel Preview from the remediation commit must be `Ready`, must use the exact branch-scoped flags above, and must pass exact-deployment Loan Readiness browser/API QA. Until that evidence is recorded, this implementation is not classified as Production eligible.
