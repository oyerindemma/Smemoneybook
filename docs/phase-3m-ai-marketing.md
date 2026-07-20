# SME MoneyBook Phase 3M AI Marketing Assistant

Status: implemented as a gated foundation on `phase-3-staging`.

AI Marketing creates draft-only promotional content for SME owners. It does not send, publish, or run campaigns automatically.

## Implemented Scope

- Feature-gated by `NEXT_PUBLIC_PHASE3_AI_MARKETING_ENABLED`.
- API:
  - `GET /api/ai-marketing` lists recent drafts.
  - `POST /api/ai-marketing` supports explicit actions:
    - `create_draft`
    - `approve_draft`
    - `feedback`
- Access controls:
  - authenticated user
  - business membership
  - `money:write` permission
  - optional location access
  - Growth active plan
- Draft model version: `marketing-draft-template-v1`.
- Additive migration only: `20260719120000_phase_3_ai_marketing`.
- More page route: `/more/ai-marketing`.
- Audit events: `ai_marketing.create_draft`, `ai_marketing.approve_draft`, and `ai_marketing.feedback`.

## Schema

- `MarketingDraft`
- `MarketingDraftFeedback`

## Safeguards

- Drafts are saved with status `DRAFT`.
- Approval requires explicit `reviewConfirmed`.
- Critical safety warnings block approval.
- Product price and stock are used only when the caller grants product-data permission.
- No send/publish endpoint exists in this foundation.
- Draft audit metadata marks `draftOnly: true`.

## Remaining Work

- OpenAI-backed generation with prompt/version tracking.
- Channel-specific safety classifiers.
- Brand voice presets.
- Product picker UI with explicit permission controls.
- Approval workflow and export/send handoff.
- Usage/cost monitoring in admin AI operations.

Phase 3M is ready for internal flagged QA, not broad Production activation.
