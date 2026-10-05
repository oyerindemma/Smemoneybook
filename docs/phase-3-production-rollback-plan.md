# Phase 3 Production Rollback Plan

Date: 2026-08-06

Status: `DRAFT - BACKUP/RESTORE NOT CONFIRMED`

## Current Gate Result

Rollback readiness is not confirmed. The release must not proceed to Production migration, merge, deployment, or feature enablement until an authorized operator confirms Neon Production restore capability and an immediately restorable backup/restore point.

## Current Production Deployment

Vercel inspection of `https://smemoneybook.com` reported:

- Target: Production
- Status: Ready
- Deployment ID: `dpl_AAQBGWwQYUiBF8KykLsKncond3Zk`
- Immutable URL: `https://smemoneybook-82j2ko4a2-emmanuel-oyerindes-projects.vercel.app`
- Domain aliases include `https://smemoneybook.com`
- Created: 2026-07-24 01:30:37 WAT

Current `origin/main` commit:

- `77324e2487dca1c373ce7961a4c0ee53a6c87642`

## Database Rollback Procedure

Preferred database rollback path for additive migrations:

1. Disable affected feature flags.
2. Redeploy if a `NEXT_PUBLIC_*` flag changed.
3. Stop affected writes through the app UI/API.
4. Apply a forward-fix migration if needed.
5. Preserve audit and financial evidence tables.

Neon restore path, only under explicit human authorization:

1. Confirm the exact Production branch identifier.
2. Confirm the restore point timestamp created before migration.
3. Confirm expected migration count before migration.
4. Initiate restore through the authorized Neon operator.
5. Verify restored database schema and critical data.
6. Point Production app back to the approved restored branch/connection strings if restore creates a branch.
7. Redeploy Production.
8. Run Phase 1/2 smoke tests and any affected Phase 3 smoke tests.

Do not run ad hoc destructive SQL.

## Application Rollback Procedure

1. Disable affected feature flags in Production.
2. Redeploy Production if any client-side `NEXT_PUBLIC_*` flag changed.
3. If a code rollback is required, redeploy the previous known-good Vercel Production deployment:
   - `dpl_AAQBGWwQYUiBF8KykLsKncond3Zk`
4. Verify `https://smemoneybook.com` resolves to the intended deployment.
5. Verify core routes: `/`, `/auth`, `/money`, `/people`, `/stock`, `/pos`, `/more`, `/reports`, `/more/billing`, `/more/staff`, `/more/business-settings`, `/stock/warehouses`, `/stock/transfers`.
6. Review Vercel runtime logs for Prisma, auth, payment, and 500 errors.

## Feature Flag Rollback

For any module:

1. Set the server-side Production flag false.
2. Set the matching `NEXT_PUBLIC_*` Production flag false.
3. Redeploy Production.
4. Verify module is hidden/unavailable.
5. Verify core app routes still work.

Flags that must stay false unless separately approved:

- `PHASE3_AI_MARKETING_SENDING_ENABLED`
- `PHASE3_LOAN_READINESS_ENABLED`
- `NEXT_PUBLIC_PHASE3_LOAN_READINESS_ENABLED`

## DNS/Domain Verification

After rollback or redeploy:

- Confirm `https://smemoneybook.com` serves the intended Production deployment.
- Confirm Vercel aliases include `smemoneybook.com`.
- Confirm no Preview deployment is aliased to Production.

## Responsible Operator

Not confirmed. Must be assigned before approval.

Required roles:

- Release operator for Vercel deployment/flag changes.
- Database operator authorized for Neon restore.
- Product/business approver for feature enablement order.

## Verification After Rollback

Minimum verification:

- Login/logout.
- Business switching.
- Sales and expense record flows.
- Stock and POS flows.
- Reports and exports.
- Staff and billing routes.
- Paystack initialization and webhook health.
- No native 404.
- No unexpected 500.
- Vercel logs healthy.
- Database connection healthy.
- Affected module hidden or stable after rollback.

## Rollback Conditions

Rollback or disable immediately on:

- Unexpected financial write.
- Cross-business data exposure.
- Auth or permission bypass.
- Materially wrong payroll or tax result.
- Unbalanced cooperative ledger.
- Bank reconciliation changing accounting records unexpectedly.
- AI secret exposure or unsupported claim.
- Production error-rate increase.
- Phase 1/2 regression.

## Result

NO-GO until backup/restore capability is confirmed and responsible operators are named.
