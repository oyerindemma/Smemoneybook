# SME MoneyBook Phase 3I Payroll Readiness

Branch: `phase-3-staging`

Audit date: `2026-07-30`

## Existing Data

- Users and staff are represented by `User`, `BusinessMember`, `BusinessInvitation`, `BusinessLocation`, and `BusinessLocationMember`.
- Existing staff membership records provide business, role, and location context, but they do not store salary, compensation history, bank details, pension identifiers, or payroll-specific employment dates.
- Existing Payroll foundation tables existed before this completion pass: `PayrollEmployee`, `PayrollRun`, `PayrollRunItem`, and `PayrollJournalEntry`.
- Existing accounting data is stored in `Account`, `Transaction`, `TransactionPayment`, receipt records, issued documents, and audit logs.
- Existing tax configuration is VAT-oriented through `TaxConfig`, `TaxRate`, tax snapshots, Tax Assistant rule sets, and review records; it is not a verified Payroll PAYE or pension rule system.

## Sensitive Fields

Payroll requires additional sensitive fields:

- employee number;
- full legal name;
- job title;
- compensation amounts;
- payment method;
- masked bank account reference;
- optional pension and tax identifiers;
- payslip content snapshots;
- approval and reversal reasons.

The module must not store bank credentials. Bank-account display is masked to the last digits only. Pension and tax identifiers are redacted by default and only surfaced through sensitive-view authorization.

## Salary Attribution Gaps

- Staff roles and invitations do not include salary attribution.
- Existing transaction actor metadata is useful for Staff Performance, but not for salary calculation.
- Existing Payroll foundation employees had a single `baseSalary`; Phase 3I requires effective-dated compensation records to support salary changes without rewriting old runs.
- Location membership can inform payroll scoping, but should not be treated as a salary source.

## Expense Posting

Existing accounting services support expense transactions, account linkage, idempotency keys, duplicate fingerprints, unpaid payment status, and transaction reversals. Payroll can use these primitives for explicit expense posting only.

Required controls:

- no automatic payroll expense creation during calculation or approval;
- one posting per payroll period;
- idempotent posting by payroll-period key;
- linked `PayrollRun.expenseTransactionId`;
- safe reversal by adjustment transaction;
- no bank transfer and no account payout.

## Statutory Governance

No verified Nigerian Payroll statutory rule configuration is present in source. The readiness position is:

- do not hardcode PAYE, pension, statutory deduction, or employer contribution rates from memory;
- support versioned statutory rule config only when a verified source, effective date, verification date, thresholds, country, and status are present;
- when verified config is absent, calculate only recorded base salary and explicitly configured custom allowances/deductions;
- label statutory amounts `setup_required`.

## Privacy Risks

- Payroll data is higher sensitivity than normal bookkeeping data.
- Payslips can reveal pay, deductions, and identifiers.
- Export must use masked references and avoid full bank details.
- Audit logs must record actions without secrets.
- Business isolation must be enforced server-side for every route.
- Staff self-service payslip access is not implemented in this pass; staff should not receive broad payroll access by default.

## Approval Workflow

Payroll needs controlled states:

- `DRAFT`
- `CALCULATED`
- `UNDER_REVIEW`
- `APPROVED`
- `EXPENSE_POSTED`
- `CANCELLED`
- `REVERSED`
- `LOCKED`

After approval, snapshots must be immutable. Recalculation is allowed only before approval and review lock. Correction after approval must use rejection before final approval or reversal after approval/posting.

Dual approval is configurable per period. When enabled, the preparer and approver must be different users.

## Migration Plan

Use additive migration only:

- extend `PayrollEmployee` with staff membership, employee number, full name, job title, employment status, payment method, masked bank account, and employment dates;
- extend `PayrollRun` with statutory setup status, snapshot version, review/approval/rejection/posting metadata, dual approval, and expense transaction link;
- extend `PayrollRunItem` with component snapshots, calculation version, taxable pay, total deductions, and item status;
- add `PayrollCompensation`;
- add `PayrollComponentDefinition`;
- add `PayrollEmployeeComponent`;
- add `PayrollPayslip`;
- add `PayrollApprovalAction`;
- add indexes, foreign keys, and check constraints.

Existing payroll rows may be backfilled into new optional fields. Preview migration must use `npx prisma migrate deploy` only after inspecting SQL. Never use `prisma migrate dev` against Preview.

## Preview QA Plan

1. Keep source defaults disabled:
   - `PHASE3_PAYROLL_ENABLED=false`
   - `NEXT_PUBLIC_PHASE3_PAYROLL_ENABLED=false`
2. Validate the dedicated `phase-3-staging` Neon Preview database target without printing credentials.
3. Run `npx prisma validate` and `npx prisma migrate status` against Preview variables.
4. If pending, inspect the Payroll migration SQL and deploy only with `npx prisma migrate deploy`.
5. Configure only Vercel Preview branch `phase-3-staging`:
   - `PHASE3_PAYROLL_ENABLED=true`
   - `NEXT_PUBLIC_PHASE3_PAYROLL_ENABLED=true`
6. Confirm `DATABASE_URL`, `DIRECT_URL`, and `NEXT_PUBLIC_APP_URL` exist for the same Preview branch without revealing values.
7. Run focused unit/API tests with flags on.
8. Run Playwright with both Payroll flags on and confirm it executes rather than skips.
9. Run full local validation: lint, typecheck, tests, build, Prisma validate/status, and `git diff --check`.
10. Deploy only Vercel Preview for `phase-3-staging`.
11. QA the newest Preview URL for navigation, employee creation, salary setup, period creation, calculation, review, approval, payslips, explicit posting, duplicate-post prevention, export, setup-required statutory notice, unauthorized rejection, business isolation, empty states, mobile/desktop, no native 404, no unexpected 500, and unsupported method `405`s.

## Readiness Conclusion

Payroll can be implemented safely as a Preview-only gated module by reusing membership, location, entitlement, permission, audit, transaction, export, and Prisma infrastructure. The statutory-rule dependency remains setup-required until verified Nigerian payroll rules are configured from official sources.
