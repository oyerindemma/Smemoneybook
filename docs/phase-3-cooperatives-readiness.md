# Phase 3J Cooperatives Readiness

## Scope

Phase 3J adds an optional, business-scoped cooperative sub-ledger for SME MoneyBook Preview. It tracks cooperative profiles, members, contribution plans, member contributions, member savings balances, internal loan workflow, guarantors, disbursement records, repayment schedules, arrears, member statements, CSV export, approval actions, and controlled ledger transfers.

The module is intentionally separate from the normal SME MoneyBook business ledger. It does not move money automatically, does not provide regulated banking services, and does not provide lending advice.

## Feature Flags

- `PHASE3_COOPERATIVES_ENABLED`: server-side API and route authorization gate in `src/lib/cooperatives/authorization.ts`.
- `NEXT_PUBLIC_PHASE3_COOPERATIVES_ENABLED`: client-side navigation and UI visibility gate in `src/lib/phase3/feature-flags.ts`, `/more`, and `/more/cooperatives*`.
- Server APIs require both flags to be enabled and also respect `PHASE3_AI_GLOBAL_KILL_SWITCH`.
- Tests consume the exact flags in `src/lib/cooperatives/authorization.test.ts` and `tests/e2e/cooperatives.spec.ts`.

## Regulatory Readiness

Sources reviewed:

- Nigeria Data Protection Commission, Nigeria Data Protection Act 2023: https://ndpc.gov.ng/wp-content/uploads/2024/03/Nigeria_Data_Protection_Act_2023.pdf
- Nigeria Data Protection Commission resources page: https://ndpc.gov.ng/resources/
- FCCPC digital lending/regulations resources: https://fccpc.gov.ng/resources-library/regulations/
- FCCPC home/releases on digital lending regulation: https://fccpc.gov.ng/
- CBN Consumer Protection: https://www.cbn.gov.ng/supervision/cpd.html
- CBN loan/access-to-credit consumer education material: https://www.cbn.gov.ng/OUT/2018/CPD/LOANS.PDF
- Co-operative Development Act reference: https://lawsofnigeria.placng.org/view2.php?sn=83
- Nigerian Co-operative Societies Act reference: https://www.judy.legal/legislation/akn/ng/act/1993/90

Readiness position:

- Keep Cooperatives as internal bookkeeping for registered/managed associations and savings groups.
- Do not market SME MoneyBook as a bank, microfinance institution, lending institution, deposit taker, payment provider, or cooperative registrar.
- Do not automate disbursement, repayment collection, bank transfer, or external payout.
- Require explicit user actions for contributions, loan approvals, disbursement records, repayments, reversals, transfers, statements, and exports.
- Mask member phone/email/full-name fields unless `cooperatives:view_member_sensitive` is granted.
- Preserve audit logs for sensitive write/export workflows.
- Include an in-app disclaimer that Cooperatives is internal bookkeeping only.

## Permissions

Owner default permissions:

- `cooperatives:read`
- `cooperatives:manage`
- `cooperatives:manage_members`
- `cooperatives:record_contributions`
- `cooperatives:review_loans`
- `cooperatives:approve_loans`
- `cooperatives:record_disbursement`
- `cooperatives:record_repayment`
- `cooperatives:export`
- `cooperatives:view_member_sensitive`

Accountant defaults are read/export/sensitive-view only. Staff receive no Cooperatives permission by default and require explicit policy/override grants.

## Data And Ledger Readiness

- Schema changes are additive only.
- Prisma uses `directUrl = env("DIRECT_URL")` for migration commands.
- Cooperative ledger batches enforce balanced debit and credit totals.
- Contribution, contribution reversal, loan disbursement, repayment, and transfer postings are explicit.
- Loan interest support is limited to zero-interest and flat-interest schedules until reducing-balance formulas receive separate validation.

## Deployment Guardrails

- Production was not modified.
- Production database was not queried or migrated.
- Vercel variables were configured only for Preview `phase-3-staging`.
- `phase-2-staging` variables were not changed.
