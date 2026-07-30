# SME MoneyBook Phase 3I Payroll Implementation

Final classification: `IMPLEMENTED — SETUP REQUIRED`

Branch: `phase-3-staging`

## Flags

Exact Payroll flags:

- `PHASE3_PAYROLL_ENABLED`
- `NEXT_PUBLIC_PHASE3_PAYROLL_ENABLED`

Source defaults are `false` in `.env.example`.

Vercel Preview configuration completed on `2026-07-30`:

- Environment: `Preview`
- Git branch: `phase-3-staging`
- `PHASE3_PAYROLL_ENABLED=true`
- `NEXT_PUBLIC_PHASE3_PAYROLL_ENABLED=true`
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

Status: `setup_required`

No verified Nigerian PAYE, pension, statutory deduction, or employer contribution configuration is present in source. Payroll uses versioned rule configuration shape in `src/lib/payroll/statutory-rules.ts`, but statutory amounts are not calculated unless verified rules are supplied with country, effective dates, official source, verification date, thresholds, and `verified` status.

The calculator allows gross-to-net calculations from recorded base salary and explicitly configured custom allowances/deductions only. It does not fabricate statutory rates.

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
  - Command: `NEXT_PUBLIC_PHASE3_PAYROLL_ENABLED=true PHASE3_PAYROLL_ENABLED=true npx playwright test tests/e2e/payroll.spec.ts`
  - Result: passed, 6 tests across desktop Chrome, mobile Chrome, and mobile Safari.
  - The spec executed and did not skip.
- Full test suite:
  - Command: `npm run test`
  - Result: passed, 93 files and 363 tests.
- `npm run build`: passed.
- `npx prisma validate`: passed.
- Branch-scoped Preview `npx prisma migrate status`: passed after deploy; database schema is up to date.
- `git diff --check`: passed.

Focused test evidence covers flags, permissions, owner access, unauthorized rejection, business isolation, entitlement, salary effective dates, component calculations, Decimal arithmetic, gross pay, deductions, net pay, verified statutory setup requirement, draft recalculation lock, approved-period immutability, approval separation, duplicate-posting prevention, expense posting API contract, reversal controls, payslip authorization, sensitive-field masking, unsupported method `405`s, empty state, feature flag off state, and feature flag on state.

Full local validation passed. Preview deployment evidence is pending final gate execution.

## Preview Deployment

- Environment: Preview
- Branch: `phase-3-staging`
- Deployment commit: pending
- Preview URL: pending
- Status: pending

## Preview QA

Pending against the newest Ready Preview deployment.

Required checks:

- `/more` shows Payroll as `Preview`.
- `/more/payroll` loads.
- Employee creation works.
- Salary setup works.
- Payroll period creation works.
- Calculation loads gross, deduction, and net amounts.
- Review/approval workflow works.
- Payslip generation works.
- Expense posting works only through explicit action.
- Duplicate posting is blocked/idempotent.
- Export works and uses masked fields.
- Setup-required statutory notice is visible.
- Empty data is handled correctly.
- Unauthorized access is rejected.
- Business isolation is enforced.
- No native `404`.
- No unexpected `500`.
- No bank payment or outbound payroll operation is available.
- Unsupported methods return `405`.

## Known Limitations

- Nigerian statutory Payroll rules are setup-required until verified official configuration is provided.
- No automatic employee payment, bank payroll integration, or statutory filing is implemented.
- Payslips are JSON snapshots exposed through owner/authorized routes; no staff self-service payslip portal is implemented.
- No PDF payslip rendering is implemented in this pass.
- No pro-rated mid-period compensation calculation is implemented; the latest effective compensation overlapping the payroll period is selected.
- Preview QA must use synthetic Preview data only.

## Production Confirmation

Production has not been deployed, promoted, queried, migrated, or configured for Phase 3I Payroll.
