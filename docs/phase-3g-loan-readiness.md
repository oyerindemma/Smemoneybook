# SME MoneyBook Phase 3G Loan Readiness

Status: implemented as a gated foundation on `phase-3-staging`.

Loan Readiness is a preparation assessment from recorded SME MoneyBook data. It is not loan approval, credit advice, a credit-bureau report, or a guarantee of financing.

## Implemented Scope

- Feature-gated by `NEXT_PUBLIC_PHASE3_LOAN_READINESS_ENABLED`.
- API:
  - `GET /api/loan-readiness` calculates the current assessment.
  - `POST /api/loan-readiness` recalculates and saves a snapshot.
  - `PATCH /api/loan-readiness` records explicit partner-sharing consent only.
- Access controls:
  - authenticated user
  - business membership
  - `reports:write` permission
  - optional location access when `locationId` is supplied
  - Growth-or-higher active plan
- Formula version: `loan-readiness-v1`.
- Tables:
  - `LoanReadinessSnapshot`
  - `LoanReadinessSharingLog`
- Additive migration only: `20260719090000_phase_3_loan_readiness`.
- More page route: `/more/loan-readiness`.
- Audit events:
  - `loan_readiness.snapshot_saved`
  - `loan_readiness.sharing_consent_recorded`

## Components

| Component | Weight | Behavior |
| --- | ---: | --- |
| Business age | 10 | Longer operating history improves readiness evidence |
| Revenue consistency | 15 | Counts weeks with recorded sales |
| Profit consistency | 15 | Reviews recorded profit margin and expense records |
| Cashflow stability | 15 | Reviews account cash coverage against expenses |
| Customer concentration | 10 | Flags over-reliance on one linked customer |
| Debt burden | 10 | Compares supplier burden against recorded revenue |
| Record completeness | 10 | Reviews categories, customer links, and account presence |
| Collection history | 10 | Reviews overdue customer debt share |
| Inventory turnover | 5 | Compares revenue to current inventory value |

## Safeguards

- The UI and API return a prominent non-approval disclaimer.
- The assessment does not claim lender, bank, credit-bureau, or accountant status.
- Partner sharing requires explicit consent and only records a consent log in this foundation.
- No external partner integration is performed.
- No financial records are mutated.
- Low data returns `insufficient_data`.

## Remaining Work

- Downloadable readiness report.
- Dispute/correction workflow.
- Legal review before any partner integration.
- Partner-specific consent scopes and expiry.
- Scheduled snapshot trend chart.
- Admin monitoring for readiness usage and consent logs.

Phase 3G is ready for internal flagged QA, not broad Production activation.
