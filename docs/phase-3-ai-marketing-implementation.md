# SME MoneyBook Phase 3H AI Marketing Implementation

Final classification: PREVIEW OPERATIONAL

## Branch And Commits

- Branch: `phase-3-staging`
- Implementation commit: `c37e5c8`
- Preview deployment commit: `c37e5c8`
- Production branch: unchanged
- Main branch: not merged

## Feature Flags

Exact flags:

- `PHASE3_AI_MARKETING_ENABLED`
- `NEXT_PUBLIC_PHASE3_AI_MARKETING_ENABLED`
- `PHASE3_AI_MARKETING_SENDING_ENABLED`

Defaults remain `false` in source and `.env.example`. AI drafting also requires `PHASE3_AI_ENABLED=true` and configured OpenAI provider variables. Production flags were not changed.

Server enforcement requires the server flag, public flag, and no `PHASE3_AI_GLOBAL_KILL_SWITCH`. Client navigation and `/more/ai-marketing` visibility use the public Phase 3 flag state. Sending requires `PHASE3_AI_MARKETING_SENDING_ENABLED=true`; Preview keeps sending disabled.

## Access And Entitlement

- Entitlement: `ai_marketing`
- Permissions: `ai_marketing:read`, `ai_marketing:create`, `ai_marketing:approve`, `ai_marketing:send`, `ai_marketing:export`, `ai_marketing:manage_consent`
- Owner workspaces: allowed when entitled
- Accountant: no default access
- Normal staff: no default access
- Explicit permission policy/override grants can allow manager-style staff access

## Schema And Migration

Migration: `20260730100000_phase_3_ai_marketing_completion`

The migration is additive. It adds customer consent fields and the campaign workflow tables:

- `MarketingCampaign`
- `MarketingCampaignRecipient`
- `MarketingMessageDraft`
- `MarketingDelivery`
- `MarketingOptOut`

It also adds an optional `MarketingDraft.campaignId` link for legacy draft compatibility. SQL constraints limit consent, campaign, recipient, and delivery statuses to supported values. No destructive SQL is included.

Preview database migration status:

- `DATABASE_URL` and `DIRECT_URL` were verified as present, valid Postgres URLs, non-placeholder values, and scoped to the dedicated `phase-3-staging` Neon Preview branch.
- Production database URLs were not used.
- `npx prisma validate`: passed.
- `npx prisma migrate status`: initially reported pending migration `20260730100000_phase_3_ai_marketing_completion`.
- The migration SQL was inspected before deploy and confirmed additive.
- `npx prisma migrate deploy`: applied the inspected migration to the Preview database only.
- `npx prisma migrate status`: passed after deploy; `39` migrations found and the schema is up to date.

## Service Layer

Implemented service files:

- `src/lib/ai-marketing/segments.ts`
- `src/lib/ai-marketing/service.ts`
- `src/lib/ai-marketing/authorization.ts`
- `src/lib/ai-marketing/consent.ts`
- `src/lib/ai-marketing/drafting.ts`
- `src/lib/ai-marketing/delivery.ts`
- `src/lib/ai-marketing/export.ts`
- `src/lib/ai-marketing/api.ts`

## APIs

Implemented routes:

- `GET /api/ai-marketing/segments`
- `POST /api/ai-marketing/campaigns`
- `GET /api/ai-marketing/campaigns`
- `GET /api/ai-marketing/campaigns/[id]`
- `POST /api/ai-marketing/campaigns/[id]/draft`
- `POST /api/ai-marketing/campaigns/[id]/approve`
- `POST /api/ai-marketing/campaigns/[id]/send`
- `GET /api/ai-marketing/campaigns/[id]/recipients`
- `GET /api/ai-marketing/export`
- `PUT /api/ai-marketing/customers/[id]/consent`

Unsupported methods return `405`. The send endpoint records a send attempt and returns a disabled/setup-required result while outbound delivery is disabled.

The legacy `GET/POST /api/ai-marketing` draft-only route remains for compatibility, now behind the Phase 3H server authorization helper. `PUT`, `PATCH`, and `DELETE` return `405`.

## UI

Route: `/more/ai-marketing`

The UI includes:

- Segment overview
- Start/end date filters
- Campaign objective and channel controls
- Recipient eligibility summary
- Consent exclusion preview
- AI draft generation state
- Manual draft editing
- Required approval action
- Send-disabled notice and send-attempt result
- Delivery status summary
- Campaign history
- Opt-out management
- CSV export
- Empty and permission-denied states

## Audit Events

Implemented audit actions:

- `ai_marketing.segment_viewed`
- `ai_marketing.campaign_created`
- `ai_marketing.draft_generated`
- `ai_marketing.content_edited`
- `ai_marketing.campaign_approved`
- `ai_marketing.sending_attempted`
- `ai_marketing.consent_updated`
- `ai_marketing.opt_out_recorded`
- `ai_marketing.export_generated`

## Local Validation

Completed validation:

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- Focused Phase 3H tests:
  - Command: `npx vitest run src/lib/ai-marketing/consent.test.ts src/lib/ai-marketing/segments.test.ts src/lib/ai-marketing/drafting.test.ts src/lib/ai-marketing/authorization.test.ts src/app/api/ai-marketing/route.test.ts src/lib/phase3/ai-marketing.test.ts`
  - Result: passed, 6 files and 30 tests.
- Full test suite:
  - Command: `npm run test`
  - Result: passed, 89 files and 348 tests.
- Playwright:
  - Command: `NEXT_PUBLIC_PHASE3_AI_MARKETING_ENABLED=true PHASE3_AI_MARKETING_ENABLED=true PHASE3_AI_ENABLED=true PHASE3_AI_MARKETING_SENDING_ENABLED=false npx playwright test tests/e2e/ai-marketing.spec.ts`
  - Result: passed, 6 tests across desktop Chrome, mobile Chrome, and mobile Safari.
  - The spec executed and did not skip.
- `npm run build`: passed.
- `npx prisma validate`: passed.
- `npx prisma migrate status`: passed against the `phase-3-staging` Preview database after deploy.
- `git diff --check`: passed.

Focused test evidence covers:

- Owner access
- Unauthorized-user rejection
- Business isolation
- Date filtering
- Consent and opt-out exclusion
- Deterministic segment formulas
- Provider unavailable/setup-required behavior
- Provider-backed draft generation using aggregate context
- Explicit approval
- Sending disabled
- Sensitive targeting rejection
- Prompt injection rejection
- CSV export
- Rate limits
- Empty state
- Feature flag off and on behavior
- Unsupported API methods returning `405`

Full validation passed.

## Preview Deployment

- Environment: Preview
- Branch: `phase-3-staging`
- Deployment commit: `c37e5c8`
- Status: Ready
- Preview URL: `https://smemoneybook-j9z5sxjm7-emmanuel-oyerindes-projects.vercel.app`
- Branch alias: `https://smemoneybook-git-phase-3-staging-emmanuel-oyerindes-projects.vercel.app`

## Preview QA

Live QA passed against the newest Ready Preview deployment for commit `c37e5c8`.

Verified checks:

- `/more` showed AI Marketing as `Preview`.
- `/more/ai-marketing` loaded successfully.
- Summary metrics and all 10 deterministic segments loaded.
- Date filters worked for a July 2026 range.
- Campaign creation worked.
- Recipient detail and consent exclusions worked.
- Empty data state worked for a seeded empty business.
- Unauthenticated access was rejected with `401`.
- Staff and accountant users without AI Marketing grants were rejected with `403`.
- Cross-business `businessId` access was rejected with `403`.
- Sensitive targeting was rejected with `400`.
- AI draft generation succeeded with prompt version `phase3h-ai-marketing-draft-v1`.
- Explicit approval worked.
- CSV export worked and did not include raw phone/contact values.
- Owner-managed opt-out worked.
- No native `404` or unexpected `500` occurred in the AI Marketing UI/API flow.
- No real outbound send operation was available; send attempt returned disabled with `0` sent.
- Unsupported methods returned `405`.

## Known Limitations

- Outbound marketing delivery is intentionally disabled for Preview.
- AI drafting depends on `PHASE3_AI_ENABLED=true`, `OPENAI_API_KEY`, and `OPENAI_MODEL`; if absent, the module is implemented but setup-required.
- No SMS, WhatsApp, or email provider send integration is enabled.
- Consent evidence is owner-managed; imported historical customers remain `unknown` until updated.
- CSV export redacts secrets and excludes raw phone/contact values.

## Production Confirmation

Production was not deployed, promoted, queried, modified, migrated, or configured for AI Marketing.
