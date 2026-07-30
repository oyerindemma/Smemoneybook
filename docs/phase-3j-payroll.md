# SME MoneyBook Phase 3J Payroll

Status: superseded by the Phase 3I completion report in `docs/phase-3-payroll-implementation.md`.

This document describes the earlier gated foundation. The Phase 3I completion pass adds Payroll-specific permissions, effective-dated compensation, payslips, explicit accounting expense posting, and statutory setup-required governance.

Payroll is an optional admin-only module for recording employee compensation inputs, drafting payroll runs, approving runs, locking snapshots, and reversing completed runs. It is not a tax, pension, or employment-law advisory system.

## Implemented Scope

- Feature-gated by `NEXT_PUBLIC_PHASE3_PAYROLL_ENABLED`.
- API:
  - `GET /api/payroll` returns redacted employees and recent runs.
  - `POST /api/payroll` supports explicit actions:
    - `create_employee`
    - `draft_run`
    - `approve_run`
    - `lock_run`
    - `reverse_run`
- Access controls:
  - authenticated user
  - business membership
  - `admin` permission
  - optional location access
  - Pro active plan
- Rule version: `payroll-ng-foundation-v1`.
- Additive migration only: `20260719103000_phase_3_payroll`.
- More page route: `/more/payroll`.
- Audit events: `payroll.create_employee`, `payroll.draft_run`, `payroll.approve_run`, `payroll.lock_run`, and `payroll.reverse_run`.

## Schema

- `PayrollEmployee`
- `PayrollRun`
- `PayrollRunItem`
- `PayrollJournalEntry`

## Calculation Rules

- Gross pay: base pay plus allowances plus bonuses.
- Deductions: deductions plus loans/advances plus employee pension plus configured tax amount.
- Net pay: gross pay minus deductions, capped at zero with a warning when deductions exceed gross.
- Employer pension is tracked separately from employee net pay.
- Payroll run stores source inputs and warnings as immutable snapshot evidence once locked.

## Safeguards

- Payroll APIs require `admin` permission.
- Sensitive identifiers are redacted in dashboard responses.
- Completed runs cannot be recalculated silently.
- Runs must be approved before locking.
- Locking creates pending payroll journal placeholders only; no `Transaction` rows are created automatically.
- Reversal preserves the original run and records a reason.

## Remaining Work

- Country-specific payroll rules beyond foundation inputs.
- Payslip generation and scoped employee access.
- Payment status workflow.
- Explicit journal-to-expense posting confirmation.
- Bulk imports and exports.
- Role-specific payroll permissions beyond the current admin gate.
- Legal review before country-specific tax/pension automation.

Phase 3J is ready for internal flagged QA, not broad Production activation.
