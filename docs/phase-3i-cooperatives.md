# SME MoneyBook Phase 3I Cooperatives And Savings Groups

Status: implemented as a gated foundation on `phase-3-staging`.

Cooperatives are optional group-ledger tools for savings groups, associations, and member loan tracking. Cooperative funds are intentionally stored separately from the normal SME MoneyBook business ledger.

## Implemented Scope

- Feature-gated by `NEXT_PUBLIC_PHASE3_COOPERATIVES_ENABLED`.
- API:
  - `GET /api/cooperatives` returns cooperative groups and ledger summaries.
  - `POST /api/cooperatives` supports explicit actions:
    - `create_group`
    - `add_member`
    - `record_contribution`
    - `request_loan`
    - `record_repayment`
- Access controls:
  - authenticated user
  - business membership
  - `money:write` permission
  - optional location access for location-scoped groups
  - Pro active plan
- Ledger formula: `cooperative-ledger-v1`.
- Additive migration only: `20260719100000_phase_3_cooperatives`.
- More page route: `/more/cooperatives`.
- Audit events: `cooperatives.create_group`, `cooperatives.add_member`, `cooperatives.record_contribution`, `cooperatives.request_loan`, and `cooperatives.record_repayment`.

## Schema

- `CooperativeGroup`
- `CooperativeMember`
- `CooperativeContributionPlan`
- `CooperativeContribution`
- `CooperativeLoan`
- `CooperativeLoanGuarantor`
- `CooperativeLoanRepayment`
- `CooperativeMeeting`
- `CooperativeResolution`
- `CooperativeExpense`
- `CooperativeDistribution`
- `CooperativeLedgerEntry`

## Financial Integrity Rules

- Cooperative ledger entries require nonnegative debits and credits.
- A ledger row can record debit or credit, never both.
- Member balance is calculated as member ledger credits minus debits.
- Group cash is calculated as contributions plus loan repayments, minus loan disbursements, expenses, and distributions.
- Loan outstanding is capped at zero after overpayment.
- Contribution arrears are calculated by active member, plan, frequency, start date, grace days, and recorded payments.

## Safeguards

- Cooperative records do not create or mutate normal `Transaction` rows.
- Loans are created as requests; disbursement is not automatic.
- Guarantors are recorded where supplied.
- Every write is an explicit API action.
- API writes are rate-limited and audited.
- Feature remains disabled by default.

## Remaining Work

- Full loan approval and disbursement workflow.
- Locked period statements and reversal workflow.
- Meeting attendance and vote capture UI.
- Dividend calculation approval UI.
- Member statement export.
- WhatsApp/SMS notifications with consent.
- Role-specific cooperative permissions beyond the current `money:write` gate.

Phase 3I is ready for internal flagged QA, not broad Production activation.
