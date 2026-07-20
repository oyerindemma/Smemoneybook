# SME MoneyBook Phase 3B AI Business Advisor

Status: implemented as a gated foundation on `phase-3-staging`.

Phase 3B upgrades the existing MoneyBook Assistant into a business-scoped AI Business Advisor. It is not enabled by default and must remain behind `NEXT_PUBLIC_PHASE3_AI_ADVISOR_ENABLED` until product, security, support, and cost-monitoring gates pass.

## Implemented Scope

- Assistant page is gated by the Phase 3 AI advisor flag.
- Chat API requires:
  - authenticated user
  - same-origin request
  - authorized business membership
  - Growth-or-higher active plan
  - global request rate limit
  - optional per-business daily Phase 3 advisor limit
- Server-side assistant tools re-check business access before reading business data.
- Mutation tools remain blocked and return `pendingActionRequired`.
- Read-only tool outputs include:
  - metric version `phase3b-advisor-v1`
  - recorded/estimated/recommendation kind
  - period start/end
  - generated timestamp
  - source table list
  - confidence
  - data warnings
- OpenAI responses are tool-grounded. If the model does not call a tool, the system falls back to the audited local tool response.
- Assistant replies store source citations, latency, provider, prompt version, and confirmation-needed status in message metadata.
- Assistant tool use and chat responses write audit log records.
- Users can mark assistant responses helpful or not helpful; feedback is stored on assistant message metadata and audited.

## Current Read-only Tools

| Tool | Source tables | Output kind | Notes |
| --- | --- | --- | --- |
| `get_today_summary` | `Transaction` | recorded | Today money in, money out, profit, count |
| `get_debt_summary` | `Debt`, `Customer`, `Supplier` | recorded | Open customer debt and supplier bills |
| `get_low_stock_items` | `InventoryItem`, `InventoryBalance` | recorded | Current low-stock items |
| `get_invoice_summary` | `Debt`, `Transaction` | recorded | Unpaid invoice summary |
| `get_monthly_report_summary` | `Transaction`, `TransactionPayment`, `TaxRun` | recorded/estimated | Monthly summary with VAT estimate warning |
| `draft_whatsapp_debt_reminder` | `Debt`, `Customer` | recommendation | Draft only; does not send |
| `prepare_stock_alert` | `InventoryItem`, `InventoryBalance` | recommendation | Draft only; does not send |
| `prepare_invoice_message` | `Debt`, `Transaction`, `Customer` | recommendation | Draft only; does not send |

Disabled mutation tools:

- `send_whatsapp_message`
- `create_invoice`
- `record_payment`
- `adjust_stock`

## User-facing Rules

The assistant must:

- use server tools for business figures
- state the period and whether values are recorded, estimated, or recommendations
- ask for clarification when amount, period, location, or scope is ambiguous
- include grounding details from source metrics
- refuse secret requests and cross-business access
- never mutate records or send external messages without explicit confirmation

## Rollout Requirements

Before enabling for beta users:

- Set `NEXT_PUBLIC_PHASE3_AI_ADVISOR_ENABLED=true` only in the intended environment.
- Set `PHASE3_AI_DAILY_REQUEST_LIMIT_PER_BUSINESS` to a nonzero beta limit.
- Set `PHASE3_AI_MONTHLY_COST_BUDGET_KOBO` for the environment.
- Confirm OpenAI model and key are configured for the environment.
- Confirm Growth/Pro entitlement expectations with Product.
- Run cross-tenant chat tests against seeded businesses.
- Monitor `assistant.chat`, `assistant.tool`, and `assistant.feedback` audit events.
- Review provider latency and fallback behavior.

## Remaining Work

- Dedicated admin AI operations dashboard metrics.
- Token/cost estimator with real provider usage.
- Richer source-metric service shared with the executive dashboard and health score.
- Location-scoped assistant questions.
- Conversation history retrieval UI.
- Structured evaluation dataset for grounded answers and prompt-injection attempts.
- Explicit pending-action confirmation UI for future writes.

Phase 3B is ready for internal flagged QA, not broad Production activation.
