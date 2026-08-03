# Phase 3J Cooperatives Implementation

## Status

Current classification: `PREVIEW OPERATIONAL`.

Cooperatives are implemented behind exact Preview flags and remain disabled by default in source examples.

## Exact Feature Flags

- `PHASE3_COOPERATIVES_ENABLED`
  - Consumed by server/API authorization in `src/lib/cooperatives/authorization.ts`.
  - Required for all Cooperatives API routes.
- `NEXT_PUBLIC_PHASE3_COOPERATIVES_ENABLED`
  - Consumed by client navigation/UI visibility through `src/lib/phase3/feature-flags.ts`, `/more`, and `/more/cooperatives*`.
  - Also required by server authorization so public-only enablement cannot open APIs.

No additional Cooperatives rollout flags were introduced.

## Implemented Surface

- Additive Prisma schema and migration for cooperative profile metadata, members, contribution plans, contributions, loan approvals, guarantors, repayment schedules, approval actions, ledger accounts, balanced ledger batches, ledger entries, and controlled ledger transfers.
- Service layer under `src/lib/cooperatives/`:
  - `authorization.ts`
  - `approvals.ts`
  - `ledger.ts`
  - `contributions.ts`
  - `loans.ts`
  - `repayments.ts`
  - `statements.ts`
  - `export.ts`
- API routes:
  - `/api/cooperatives`
  - `/api/cooperatives/[id]`
  - `/api/cooperatives/[id]/members`
  - `/api/cooperatives/[id]/contribution-plans`
  - `/api/cooperatives/[id]/contributions`
  - `/api/cooperatives/[id]/contributions/[contributionId]/reverse`
  - `/api/cooperatives/[id]/loans`
  - `/api/cooperatives/[id]/loans/[loanId]/submit`
  - `/api/cooperatives/[id]/loans/[loanId]/approve`
  - `/api/cooperatives/[id]/loans/[loanId]/reject`
  - `/api/cooperatives/[id]/loans/[loanId]/record-disbursement`
  - `/api/cooperatives/[id]/loans/[loanId]/repayments`
  - `/api/cooperatives/[id]/members/[memberId]/statement`
  - `/api/cooperatives/[id]/export`
  - `/api/cooperatives/[id]/transfers`
- UI routes:
  - `/more/cooperatives`
  - `/more/cooperatives/members`
  - `/more/cooperatives/contributions`
  - `/more/cooperatives/loans`
  - `/more/cooperatives/reports`

## Authorization And Entitlement

- Added Pro entitlement: `cooperatives`.
- Added granular permissions:
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
- Owner has full default access.
- Accountant has read/export/sensitive-view defaults.
- Staff has no default Cooperatives access.

## Prisma Migration Status

Database target verification:

- `DATABASE_URL` exists, uses a Postgres protocol, is not a placeholder, is Neon-like, and has no production/main marker.
- `DIRECT_URL` exists, uses a Postgres protocol, is not a placeholder, is Neon-like, and has no production/main marker.
- Vercel metadata confirms `DATABASE_URL` and `DIRECT_URL` exist for Preview branch `phase-3-staging`.
- Vercel sensitive values are not retrievable through `vercel env pull`; local non-production Neon env was used for Prisma commands.

Executed:

- `npx prisma validate` passed.
- `npx prisma migrate status` initially reported pending migration `20260803100000_phase_3j_cooperatives_completion`.
- Migration SQL was inspected and confirmed additive.
- `npx prisma migrate deploy` applied `20260803100000_phase_3j_cooperatives_completion`.
- Rerun `npx prisma migrate status` reported database schema is up to date.

## Local Validation Results

Final validation run:

- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm run test` passed: 95 test files, 374 tests.
- `npm run build` passed.
- `npx prisma validate` passed.
- `npx prisma migrate status` passed: database schema is up to date.
- `git diff --check` passed.

Targeted Cooperatives tests:

- `src/app/api/cooperatives/route.test.ts`
- `src/lib/cooperatives/authorization.test.ts`
- `src/lib/cooperatives/ledger.test.ts`
- Existing `src/lib/phase3/cooperative-ledger.test.ts`

Coverage includes owner access path, server feature gate, public-only flag rejection, business isolation through access scoping, contribution write/audit, loan request path, unsupported methods returning 405, balanced ledger batches, member savings balance calculation from the member-savings ledger account, zero/flat interest schedules, reducing-balance rejection, and legacy ledger summaries.

## Playwright Result

Executed with both required flags enabled:

```bash
PHASE3_COOPERATIVES_ENABLED=true NEXT_PUBLIC_PHASE3_COOPERATIVES_ENABLED=true npx playwright test tests/e2e/cooperatives.spec.ts --project=chromium
```

Result: 2 passed, 0 skipped.

Covered:

- `/more` shows Cooperatives as Preview.
- `/more/cooperatives` loads.
- Empty state.
- Cooperative profile creation.
- Member creation.
- Member statement.
- Contribution recording.
- Loan request, submit, approval, disbursement record, repayment.
- Reports and repayment schedules.
- CSV export.
- Unauthorized state.
- API feature-disabled state.
- Business isolation.
- No unexpected 404/500 in Cooperatives page/API responses.
- Unsupported methods return 405.

## Vercel Preview Variables

Using authenticated Vercel CLI:

- `PHASE3_COOPERATIVES_ENABLED` set to encrypted `true` for Environment `Preview`, Git branch `phase-3-staging`.
- `NEXT_PUBLIC_PHASE3_COOPERATIVES_ENABLED` set to encrypted `true` for Environment `Preview`, Git branch `phase-3-staging`.
- `DATABASE_URL`, `DIRECT_URL`, and `NEXT_PUBLIC_APP_URL` confirmed present for Environment `Preview`, Git branch `phase-3-staging`.
- Production variables were not modified.
- `phase-2-staging` variables were not modified.

## Preview Deployment

- Environment: Preview
- Branch: `phase-3-staging`
- Deployment commit: `24d8abeabb3d9d8cd9f012d4a0d31dee654c38d0`
- Preview URL: `https://smemoneybook-pi3qgsovt-emmanuel-oyerindes-projects.vercel.app`
- Branch alias: `https://smemoneybook-git-phase-3-staging-emmanuel-oyerindes-projects.vercel.app`
- Status: Ready

## Preview QA

Completed against the Ready Vercel Preview deployment for commit `24d8abeabb3d9d8cd9f012d4a0d31dee654c38d0`.

Synthetic QA data was created only in the verified `phase-3-staging` Preview database. The QA setup created disposable users, sessions, businesses, a Pro entitlement, and an owner permission policy only for the synthetic Preview business.

Passed checks:

- Unauthenticated Cooperatives API access was rejected with `401`.
- Cross-business access was rejected with `403`.
- Non-Pro business access was rejected with `402`.
- Owner access returned `200` with empty groups and manage capability.
- `/more` showed Cooperatives as `Preview`.
- `/more/cooperatives` loaded with the internal-bookkeeping disclaimer and empty state.
- Cooperative profile setup worked through the UI.
- Member creation worked through the UI.
- Member statement loaded through the UI.
- Contribution plan creation and contribution recording worked through the UI.
- Loan application worked through the UI.
- Requesting-owner self-approval was rejected with `403`.
- A separate owner approved the loan and recorded disbursement through the Preview API.
- Loan repayment worked through the UI.
- Controlled transfer bridge record worked without an automatic business transaction when no account was selected.
- Reports and repayment schedules rendered.
- CSV export downloaded `cooperative-*.csv`.
- Member savings balance reported `5000` after the contribution.
- Loan metrics reported status `active`, outstanding `15000`, and total due `20000` after repayment.
- Guarantor-required loan entered `guarantor_pending`, blocked approval before guarantor confirmation, and approved after confirmation.
- Unsupported method checks returned `405` for root `PUT/PATCH/DELETE`, members `PUT`, plans `DELETE`, export `POST`, statement `PATCH`, repayment `GET`, and transfer `GET`.
- `/more/cooperatives/members`, `/contributions`, `/loans`, and `/reports` loaded.
- No native `404` or unexpected `500` was observed in the Cooperatives UI/API flow.

Preview QA found and fixed one issue before final passing evidence:

- Member savings balances initially summed all member-tagged ledger lines, causing the cash-control debit to cancel the member-savings credit. The fix passes account codes into the summary and calculates savings balances from `MEMBER_SAVINGS` entries when account codes are available. Member statements use the same savings-account basis.

## Known Limitations

- Reducing-balance cooperative loan interest is intentionally disabled until a validated formula and tests are added.
- Cooperative registration/legal compliance is not automated.
- The module records internal disbursement/repayment events but does not initiate bank transfers or external collections.
- Controlled transfers are explicit bridge records and optional business-ledger transactions, not automatic money movement.

## Production Unchanged

- No merge to `main`.
- No Production deployment or promotion.
- No Production env changes.
- No Production database migration or query.
