# SME MoneyBook Phase 3H AI Marketing Readiness

Status: `PREVIEW OPERATIONAL` on the `phase-3-staging` Vercel Preview branch. Production remains unchanged.

## Exact Flags

- `PHASE3_AI_MARKETING_ENABLED`
- `NEXT_PUBLIC_PHASE3_AI_MARKETING_ENABLED`
- `PHASE3_AI_MARKETING_SENDING_ENABLED`

All default to `false`. AI drafting also requires the global AI provider gate `PHASE3_AI_ENABLED=true` plus configured provider secrets. Server APIs require both AI Marketing flags and honor `PHASE3_AI_GLOBAL_KILL_SWITCH`. Outbound sending remains disabled unless `PHASE3_AI_MARKETING_SENDING_ENABLED=true`; Preview is expected to keep sending disabled.

## Source Consumption

- Server-side API and route authorization: `src/lib/ai-marketing/authorization.ts` requires `PHASE3_AI_MARKETING_ENABLED` and `NEXT_PUBLIC_PHASE3_AI_MARKETING_ENABLED`; `src/lib/ai-marketing/delivery.ts` requires `PHASE3_AI_MARKETING_SENDING_ENABLED` before any send can proceed.
- Client-side navigation and UI visibility: `src/lib/phase3/feature-flags.ts`, `src/lib/phase3/navigation-status.ts`, `/more`, and `/more/ai-marketing`.
- Tests: `src/lib/ai-marketing/authorization.test.ts`, `src/app/api/ai-marketing/route.test.ts`, `tests/e2e/ai-marketing.spec.ts`, and existing `src/lib/phase3/feature-flags.test.ts`.

## Entitlement And Permissions

- Entitlement: `ai_marketing`
- Permissions:
  - `ai_marketing:read`
  - `ai_marketing:create`
  - `ai_marketing:approve`
  - `ai_marketing:send`
  - `ai_marketing:export`
  - `ai_marketing:manage_consent`

Owners have the default grant when the business is entitled. Accountants and staff require explicit policy or override grants.

## Consent And Privacy

Customer consent fields:

- `marketingConsentStatus`
- `marketingConsentSource`
- `marketingConsentAt`
- `marketingOptOutAt`
- `preferredChannel`
- `doNotContact`
- `consentNotes`

Consent statuses are `unknown`, `consented`, `opted_out`, and `transactional_only`. Existing customers default to `unknown`. Invoice phone numbers do not count as marketing consent. Opted-out, transactional-only, do-not-contact, unknown-consent, and missing-contact customers are excluded from marketing recipient eligibility.

## Deterministic Segments

Implemented segment keys:

- `new_customers`
- `frequent_customers`
- `high_value_customers`
- `dormant_customers`
- `repeat_customers`
- `unpaid_invoices`
- `overdue_debt`
- `purchased_product_category`
- `active_in_range`
- `verified_marketing_consent`

Segments are calculated from recorded customer, sales, invoice, debt, product, and consent data. Protected or sensitive segmentation is blocked.

## AI Drafting Safeguards

- Uses aggregate segment context for prompts.
- Does not include customer recipient lists in draft prompts.
- Blocks sensitive targeting, false scarcity, guaranteed outcomes, secret requests, and delivery-status claims.
- Requires provider setup; if provider setup is missing the draft endpoint returns setup-required instead of fake output.
- Drafts display `AI-generated draft — review before approval.`
- Approval requires explicit owner review.
- Approval does not mutate invoices, debts, stock, payments, or customer financial records.
- Sending remains disabled in Preview.

## Preview QA Plan

1. Validate Prisma schema.
2. Verify `DATABASE_URL` and `DIRECT_URL` target the dedicated `phase-3-staging` Neon branch and not Production without printing values.
3. Check migration status against the Preview database.
4. If pending, inspect SQL and apply only with `npx prisma migrate deploy`.
5. Configure only Vercel Preview branch `phase-3-staging` flags:
   - `PHASE3_AI_MARKETING_ENABLED=true`
   - `NEXT_PUBLIC_PHASE3_AI_MARKETING_ENABLED=true`
   - `PHASE3_AI_MARKETING_SENDING_ENABLED=false`
6. Confirm `PHASE3_AI_ENABLED`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `DATABASE_URL`, `DIRECT_URL`, and `NEXT_PUBLIC_APP_URL` are present for Preview branch `phase-3-staging` without revealing values.
7. Run local focused tests and full validation.
8. Run Playwright with both AI Marketing flags enabled and confirm it executes rather than skips.
9. Deploy only Vercel Preview for branch `phase-3-staging`.
10. QA the newest Preview URL for owner access, unauthorized rejection, business isolation, segment filters, campaign creation, draft generation, edit, approval, send-disabled response, export, consent opt-out, empty state, method guards, and no native 404 or unexpected 500.

## Executed Evidence

Date: `2026-07-30`

Prisma Preview target:

- `DATABASE_URL`: present, uses a Postgres protocol, not a placeholder, and verified against the dedicated `phase-3-staging` Neon Preview branch.
- `DIRECT_URL`: present, uses a Postgres protocol, not a placeholder, and verified against the dedicated `phase-3-staging` Neon Preview branch.
- Production database was not queried or migrated.

Prisma results:

- `npx prisma validate`: passed.
- `npx prisma migrate status`: initially detected pending migration `20260730100000_phase_3_ai_marketing_completion` on the Preview database.
- Migration SQL was inspected and confirmed additive: customer consent fields, AI Marketing campaign tables, indexes, foreign keys, and check constraints.
- `npx prisma migrate deploy`: applied only the inspected additive migration to the `phase-3-staging` Preview database.
- `npx prisma migrate status`: passed after deploy; `39` migrations found and the schema is up to date.

Vercel Preview flags:

- Environment: Preview
- Git branch: `phase-3-staging`
- `PHASE3_AI_MARKETING_ENABLED=true`
- `NEXT_PUBLIC_PHASE3_AI_MARKETING_ENABLED=true`
- `PHASE3_AI_MARKETING_SENDING_ENABLED=false`
- Supporting Preview variables confirmed present for the same branch without revealing values: `PHASE3_AI_ENABLED`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_APP_URL`.
- Production and `phase-2-staging` variables were not modified.

Local validation:

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- Focused Phase 3H tests: passed, 6 files and 30 tests.
- `npm run test`: passed, 89 files and 348 tests.
- `npm run build`: passed.
- `npx prisma validate`: passed.
- `npx prisma migrate status`: passed against the Preview database after deploy.
- `git diff --check`: passed.

Playwright:

- Playwright with `NEXT_PUBLIC_PHASE3_AI_MARKETING_ENABLED=true`, `PHASE3_AI_MARKETING_ENABLED=true`, `PHASE3_AI_ENABLED=true`, and `PHASE3_AI_MARKETING_SENDING_ENABLED=false`: passed, 6 tests across desktop Chrome, mobile Chrome, and mobile Safari; executed and did not skip.

Vercel Preview deployment:

- Branch: `phase-3-staging`
- Deployment commit: `c37e5c8`
- Deployment status: Ready
- Preview URL: `https://smemoneybook-j9z5sxjm7-emmanuel-oyerindes-projects.vercel.app`
- Branch alias: `https://smemoneybook-git-phase-3-staging-emmanuel-oyerindes-projects.vercel.app`

Live Preview QA:

- Synthetic QA data was seeded only into the verified Preview staging database.
- `/more`: returned `200` and showed AI Marketing as `Preview`.
- `/more/ai-marketing`: returned `200` and loaded the campaign workflow.
- Owner access: passed.
- Unauthenticated access: rejected with `401`.
- Staff without AI Marketing grant: rejected with `403`.
- Accountant without AI Marketing grant: rejected with `403`.
- Business isolation: cross-business `businessId` request rejected with `403`.
- Summary metrics and all 10 deterministic segments loaded.
- Date filtering worked for the selected range.
- Staff/customer recipient detail and consent exclusion preview worked.
- Empty data state worked for a seeded empty business.
- Sensitive targeting was rejected.
- AI draft generation succeeded with prompt version `phase3h-ai-marketing-draft-v1`.
- Draft review label was returned.
- Explicit approval worked.
- Send endpoint remained disabled and reported zero sent messages.
- CSV export worked and did not include raw phone/contact values.
- Opt-out management worked.
- Unsupported methods returned `405`.
- No native `404` or unexpected `500` was observed in AI Marketing UI/API flows.

## Known Limitations

- Outbound delivery is intentionally disabled for Preview.
- AI drafting is setup-dependent and requires the global AI provider configuration.
- Email/SMS/WhatsApp provider integrations are not enabled by this phase.
- Legacy Phase 3M draft-only APIs remain for compatibility while the Phase 3H campaign workflow is gated.
- Preview QA must use synthetic Preview data only.

## Production Confirmation

Production has not been deployed, promoted, queried, migrated, or configured for Phase 3H AI Marketing.
