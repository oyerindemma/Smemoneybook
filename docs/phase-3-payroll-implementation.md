# SME MoneyBook Phase 3I Payroll Implementation

Final classification: `PREVIEW OPERATIONAL`

Branch: `phase-3-staging`

## Commits

- Implementation commit: `8f2bdca187e5fea0913fd5b18e68e7def9a03b9b`
- Preview workflow guard fix: `75fa0cc10825e50bfb274e3d6bb0a2ebe99653e6`
- Location-scoped UI data fix and final QA deployment commit: `8a3e2ea27717a34b7158dec1e57f2c9045b8ab68`
- Statutory setup messaging/test commit: `618964bba0a157bc1c4d0dc3c4ce687902823926`

## Flags

Exact Payroll flags:

- `PHASE3_PAYROLL_ENABLED`
- `NEXT_PUBLIC_PHASE3_PAYROLL_ENABLED`
- `PHASE3_PAYROLL_STATUTORY_RULES_JSON`

Source defaults are `false` in `.env.example` for the two feature flags. `PHASE3_PAYROLL_STATUTORY_RULES_JSON` is a server-side Preview setup variable and is not exposed to the client.

Vercel Preview configuration completed on `2026-07-30`:

- Environment: `Preview`
- Git branch: `phase-3-staging`
- `PHASE3_PAYROLL_ENABLED=true`
- `NEXT_PUBLIC_PHASE3_PAYROLL_ENABLED=true`
- `PHASE3_PAYROLL_STATUTORY_RULES_JSON` configured as a sensitive variable for `Preview (phase-3-staging)` only.
- `DATABASE_URL`, `DIRECT_URL`, and `NEXT_PUBLIC_APP_URL` confirmed present for the same branch without revealing values.
- Production variables were not modified.
- `phase-2-staging` variables were not modified.

Source consumption:

- Server-side API and route authorization: `src/lib/payroll/authorization.ts` requires both flags and honors `PHASE3_AI_GLOBAL_KILL_SWITCH`; all Payroll API routes call `requirePayrollAccess`.
- Client navigation and UI visibility: `src/lib/phase3/feature-flags.ts`, `src/lib/phase3/navigation-status.ts`, `/more`, and `/more/payroll` use `NEXT_PUBLIC_PHASE3_PAYROLL_ENABLED`; `/more/payroll` also checks the server helper.
- Tests: `src/lib/payroll/authorization.test.ts`, `src/app/api/payroll/route.test.ts`, `src/lib/phase3/navigation-status.test.ts`, `src/lib/phase3/payroll.test.ts`, and `tests/e2e/payroll.spec.ts`.

## Entitlement And Permissions

- Entitlement: `payroll`
- Permissions:
  - `payroll:read`
  - `payroll:manage_employees`
  - `payroll:prepare`
  - `payroll:review`
  - `payroll:approve`
  - `payroll:export`
  - `payroll:post_expense`
  - `payroll:view_sensitive`

Owners receive Payroll permissions by default when the business is entitled. Accountants and staff do not receive Payroll permissions by default and require explicit policy or override grants.

## Statutory Rule Status

Status: `configured` in Vercel Preview for Git branch `phase-3-staging`.

`PHASE3_PAYROLL_STATUTORY_RULES_JSON` was configured on `2026-07-30` with five verified Nigerian rule-source records:

- PAYE: Nigeria Tax Act, 2025; effective `2026-01-01`; annual bands from the Fourth Schedule.
- Pension: PenCom/Pension Reform Act 2014 source; employee `8%`, employer `10%`, minimum total `18%` of monthly emoluments.
- NHF: FMBN/National Housing Fund source; employee contribution metadata at `2.5%` of monthly salary/income.
- Employee Compensation Scheme: NSITF source; employer contribution metadata at `1%` of total monthly payroll.
- Industrial Training Fund: ITF source; annual employer training contribution metadata at `1%` of annual payroll where applicable.

Official sources reviewed:

- `https://www.nrs.gov.ng/uploads/NIGERIA_TAX_ACT_2025_ef6bb812a5.pdf`
- `https://www.pencom.gov.ng/pra2014/`
- `https://www.pencom.gov.ng/wp-content/uploads/2018/04/FAQ-CPS-reviewed.-17-Apr.-2018.pdf`
- `https://fmbn.gov.ng/products/nhf-scheme/legal-framework`
- `https://nsitf.gov.ng/compensation/`
- `https://itf.gov.ng/departments/revenue.html`

Phase 3I remains a reviewed-input payroll workflow: verified statutory sources are configured and statutory input lines are retained, but the app does not automatically file returns or transfer funds.

## Schema And Migration

Migration: `20260730120000_phase_3_payroll_completion`

The migration is additive. It extends existing Payroll foundation tables and adds:

- `PayrollCompensation`
- `PayrollComponentDefinition`
- `PayrollEmployeeComponent`
- `PayrollPayslip`
- `PayrollApprovalAction`

It also adds Payroll indexes, foreign keys, and check constraints. The SQL contains three non-destructive backfill `UPDATE`s for newly added optional Payroll fields and no `DROP`, `DELETE FROM`, or `TRUNCATE` statements.

Executed Preview migration status:

- `DATABASE_URL` and `DIRECT_URL` were confirmed present for Vercel Environment `Preview`, Git branch `phase-3-staging`.
- Both URLs use a Postgres protocol, are not `[SENSITIVE]` placeholders, target Neon, and showed no Production marker.
- `NEXT_PUBLIC_APP_URL` was confirmed present for the same Preview branch.
- `npx prisma validate`: passed under the branch-scoped Preview environment.
- `npx prisma migrate status`: initially reported pending migration `20260730120000_phase_3_payroll_completion`.
- Migration SQL was inspected and confirmed additive before deployment.
- `npx prisma migrate deploy`: applied `20260730120000_phase_3_payroll_completion` to the Preview database only.
- `npx prisma migrate status`: passed after deploy; `40` migrations found and the schema is up to date.

## Payroll Workflow

Implemented workflow:

1. Create employee payroll profiles.
2. Store effective-dated compensation.
3. Configure custom allowances and deductions.
4. Prepare payroll periods.
5. Calculate draft payroll using Decimal-safe arithmetic.
6. Submit payroll for review.
7. Approve or reject payroll.
8. Generate payslips from approved snapshots.
9. Explicitly post approved payroll as an accounting expense.
10. Reverse approved or posted payroll through a recorded reversal workflow.
11. Export masked Payroll CSV reports.

Implemented UI routes:

- `/more/payroll`
- `/more/payroll/employees`
- `/more/payroll/periods`
- `/more/payroll/periods/[id]`

Implemented APIs:

- `GET/POST /api/payroll/employees`
- `GET/PUT /api/payroll/employees/[id]`
- `GET/POST /api/payroll/periods`
- `GET /api/payroll/periods/[id]`
- `POST /api/payroll/periods/[id]/calculate`
- `POST /api/payroll/periods/[id]/submit-review`
- `POST /api/payroll/periods/[id]/approve`
- `POST /api/payroll/periods/[id]/reject`
- `POST /api/payroll/periods/[id]/post-expense`
- `POST /api/payroll/periods/[id]/reverse`
- `GET /api/payroll/periods/[id]/payslips`
- `GET /api/payroll/export`

Unsupported methods return `405`.

## Approval Controls

- `CALCULATED` payroll can be submitted for review.
- Approval requires `UNDER_REVIEW`.
- If dual approval is enabled, the approver cannot be the preparer.
- Approved, posted, locked, and reversed periods cannot be recalculated.
- Approved snapshots are locked through run-item status and `lockedAt`.
- Rejection records a reason before final approval.
- Reversal records a reason after approval/posting.
- Audit records are written for employee creation/update, period preparation/calculation, review, approval, rejection, posting, reversal, payslip generation, and export.

## Accounting Posting Controls

- No automatic bank payment exists.
- No bank payroll provider integration exists.
- No automatic statutory filing exists.
- Payroll expense posting is an explicit authorized action requiring `payroll:post_expense`.
- Posting is idempotent using `phase3i-payroll-expense-{periodId}`.
- One `Transaction` is linked through `PayrollRun.expenseTransactionId`.
- The posted transaction is an `EXPENSE`, category `Payroll`, and `UNPAID`.
- Reversal creates an adjustment transaction when the original expense exists.

## Local Validation

Completed before Preview deployment:

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- Focused Phase 3I tests:
  - Command: `npx vitest run src/lib/payroll/calculator.test.ts src/lib/payroll/approval.test.ts src/lib/payroll/authorization.test.ts src/lib/payroll/service.test.ts src/app/api/payroll/route.test.ts src/lib/phase3/navigation-status.test.ts src/lib/billing/paystack.test.ts src/lib/phase3/payroll.test.ts`
  - Result: passed, 8 files and 34 tests.
- Playwright:
  - Command: `PHASE3_PAYROLL_ENABLED=true NEXT_PUBLIC_PHASE3_PAYROLL_ENABLED=true PHASE3_PAYROLL_STATUTORY_RULES_JSON=<configured> npx playwright test tests/e2e/payroll.spec.ts`
  - Result: passed, 6 tests across desktop Chrome, mobile Chrome, and mobile Safari.
  - The spec executed and did not skip.
- Full test suite:
  - Command: `npm run test`
  - Result after setup commit: passed, 93 files and 364 tests.
- `npm run build`: passed.
- `npx prisma validate`: passed.
- Branch-scoped Preview `npx prisma migrate status`: passed after deploy; database schema is up to date.
- `git diff --check`: passed.

Focused test evidence covers flags, permissions, owner access, unauthorized rejection, business isolation, entitlement, salary effective dates, component calculations, Decimal arithmetic, gross pay, deductions, net pay, verified statutory setup requirement, configured statutory source setup, draft recalculation lock, approved-period immutability, approval separation, duplicate-posting prevention, expense posting API contract, reversal controls, payslip authorization, sensitive-field masking, unsupported method `405`s, empty state, feature flag off state, and feature flag on state.

Full local validation passed after the live-QA fixes.

## Preview Deployment

- Environment: Preview
- Branch: `phase-3-staging`
- Deployment commit: `618964bba0a157bc1c4d0dc3c4ce687902823926`
- Preview URL: `https://smemoneybook-q5tkezn9t-emmanuel-oyerindes-projects.vercel.app`
- Branch alias: `https://smemoneybook-git-phase-3-staging-emmanuel-oyerindes-projects.vercel.app`
- Status: Ready

## Preview QA

Completed on `2026-07-30` against the Ready Preview deployment for commit `618964bba0a157bc1c4d0dc3c4ce687902823926`.

Synthetic QA data was created only in the verified `phase-3-staging` Preview database. The Preview Pro entitlement was assigned through the guarded Preview staging seed path with `PREVIEW_STAGING_SEED_CONFIRM=phase-3-staging`.

Passed checks:

- Owner registration and synthetic business creation.
- Payroll entitlement visible for the synthetic owner.
- Owner Payroll permissions visible.
- `/api/payroll` dashboard loaded.
- Empty Payroll state handled before employee creation.
- Statutory status returned `configured` with five verified rule-source records.
- Payments returned disabled.
- Employee creation worked.
- Bank details were masked and the full account number was not returned.
- Payroll period creation worked.
- Calculation worked with gross pay `110000`, deductions `5500`, and net pay `104500`.
- A statutory NHF deduction line was retained after setup; no setup-required warning was returned.
- Submit review worked.
- Approval worked.
- Approved snapshot was locked.
- Recalculation after approval returned controlled `409`, not `500`.
- Payslip generation worked and masked sensitive values.
- Explicit expense posting worked.
- Posted Payroll transaction was `UNPAID`.
- Duplicate posting was idempotent.
- CSV export worked and did not expose the full bank account.
- Cross-business `businessId` access was rejected with `403`.
- Unauthenticated access was rejected with `401`.
- Unsupported methods returned `405`.
- `/more` showed Payroll as `Preview`.
- `/more/payroll` loaded.
- `Sources configured` and `Configured statutory sources` were visible.
- Employee details were visible.
- Expense-posted state was visible.
- No native `404` or unexpected `500` was observed in the Payroll UI/API flow.

Preview QA found and fixed two issues before final evidence:

- Approved-period recalculation originally surfaced as `500`; fixed to return a controlled `409`.
- Duplicate post-expense calls originally hit the status guard before idempotency; fixed to return the existing posted transaction.
- Location-scoped Payroll UI originally hid business-wide Payroll records; fixed to include `locationId = null` records when a location is selected.

Additional post-setup live QA against `https://smemoneybook-q5tkezn9t-emmanuel-oyerindes-projects.vercel.app` passed:

- API QA: 22 checks covering owner login, configured statutory setup, empty state, owner capabilities, unauthorized rejection, business isolation, employee creation, bank masking, period creation, configured calculation path, statutory deduction retention, approval lock, recalculation `409`, payslips, idempotent expense posting, period detail, CSV export, unsupported methods returning `405`, and no `404`/unexpected `500`.
- UI QA: `/more` showed Payroll Preview; `/more/payroll` loaded; `Sources configured`, `Configured statutory sources`, the synthetic employee, and `EXPENSE_POSTED` were visible; no `/more` or Payroll `404`/unexpected `500` responses were observed.

## Known Limitations

- Payroll statutory setup is configured only for the `phase-3-staging` Vercel Preview branch.
- Verified statutory source metadata is present, but Phase 3I applies reviewed statutory inputs and does not automatically derive every PAYE, pension, NHF, NSITF, or ITF amount from source formulas.
- No automatic employee payment, bank payroll integration, or statutory filing is implemented.
- Payslips are JSON snapshots exposed through owner/authorized routes; no staff self-service payslip portal is implemented.
- No PDF payslip rendering is implemented in this pass.
- No pro-rated mid-period compensation calculation is implemented; the latest effective compensation overlapping the payroll period is selected.
- Preview QA must use synthetic Preview data only.

## Production Confirmation

Production has not been deployed, promoted, queried, migrated, or configured for Phase 3I Payroll.
