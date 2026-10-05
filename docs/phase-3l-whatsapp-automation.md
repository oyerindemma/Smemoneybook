# SME MoneyBook Phase 3L Smart WhatsApp Automation

Status: implemented as a gated foundation on `phase-3-staging`.

Smart WhatsApp automation expands existing messaging with consent, approved template tracking, quiet hours, queue decisions, retry metadata, and cost visibility. It does not send unsolicited bulk messages.

## Implemented Scope

- Feature-gated by `NEXT_PUBLIC_PHASE3_WHATSAPP_AUTOMATION_ENABLED`.
- API:
  - `GET /api/whatsapp-automation` returns preferences, contacts, templates, recent jobs, and queue health.
  - `POST /api/whatsapp-automation` supports explicit actions:
    - `upsert_contact`
    - `register_template`
    - `queue_message`
- Access controls:
  - authenticated user
  - business membership
  - `admin` permission
  - Growth active plan
- Policy version: `whatsapp-automation-policy-v1`.
- Additive migration only: `20260719113000_phase_3_whatsapp_automation`.
- UI: existing `/more/automation` page.
- Audit events: `whatsapp_automation.upsert_contact`, `whatsapp_automation.register_template`, and `whatsapp_automation.queue_message`.

## Schema

- `WhatsAppAutomationContact`
- `WhatsAppAutomationTemplate`
- `WhatsAppAutomationJob`

## Policy Rules

- Business-level WhatsApp automation must be enabled.
- Recipient must be explicitly opted in.
- Opted-out recipients are skipped.
- Template messages require an approved template status.
- Quiet hours skip the job instead of sending.
- Queue records include policy version, decision reason, opt-out check time, retry count, and cost.

## Safeguards

- Queue endpoint does not send directly.
- Manual fallback links remain available for user-reviewed sending.
- No unsolicited bulk spam.
- Contacts preserve consent source and opt-out state.
- Failed/skipped jobs are measurable for admin monitoring.

## Remaining Work

- Meta template sync integration.
- Delivery/read/failure event reconciliation into job state.
- Retry worker for queued jobs.
- Opt-out keyword handling wired from inbound WhatsApp messages.
- Template-level cost estimation by destination/category.
- E2E tests for consent and approved-template enforcement in actual sends.

Phase 3L is ready for internal flagged QA, not broad Production activation.
