# SME MoneyBook Phase 3C Tax Assistant

Status: implemented as a gated, read-only Preview module on `phase-3-staging`.

Tax Assistant is a recordkeeping and preparation tool for Nigerian SMEs. It explains recorded tax position from SME MoneyBook data, deterministic formulas, and versioned rule sources. It does not file returns, submit to tax authorities, make payments, change tax settings, mutate ledgers, or provide legal/tax advice.

## Feature Flags

- Server: `PHASE3_AI_ENABLED`
- Server: `PHASE3_TAX_ASSISTANT_ENABLED`
- Client: `NEXT_PUBLIC_PHASE3_TAX_ASSISTANT_ENABLED`

All default to `false` outside branch-scoped Preview configuration.

## Implemented Scope

- Workspace: `/more/tax-assistant`
- Summary API: `GET /api/tax-assistant` and `GET /api/tax-assistant/summary`
- Period API: `GET /api/tax-assistant/periods`
- Review API: `GET /api/tax-assistant/review-items`, `GET /api/tax-assistant/review-items/[id]`
- Rule-source API: `GET /api/tax-assistant/rules`
- Chat API: `POST /api/tax-assistant/chat`
- Conversation APIs: `GET /api/tax-assistant/conversations`, `GET /api/tax-assistant/conversations/[id]`
- Export API: `GET /api/tax-assistant/export`
- Write verbs on read-only endpoints return `405`.

## Authorization

- Authenticated user
- Business membership
- Growth or Pro plan with `tax_assistant`
- Dedicated permissions:
  - `tax_assistant:read`
  - `tax_assistant:ask`
  - `tax_assistant:review`
  - `tax_assistant:export`
  - `tax_assistant:manage_settings`
- Optional location scoping through existing location membership and permission override rules

## Tax Rules

- Current rule set: `ng-federal-2026-preview-v1`
- Jurisdiction: `NG-FED`
- Source authority: Nigeria Revenue Service
- Source references:
  - `https://www.nrs.gov.ng/uploads/NIGERIA_TAX_ACT_2025_ef6bb812a5.pdf`
  - `https://www.nrs.gov.ng/page/withholding-tax`
- WHT is recorded-only in this Preview. The assistant does not infer WHT category rates from descriptions.

## Calculations

- Output VAT: taxable sale base x verified VAT rate; inclusive records use gross less base.
- Eligible input VAT: eligible expense base x verified VAT rate; missing receipt/invoice/tax snapshot evidence is excluded from eligible input VAT.
- Net VAT estimate: output VAT estimate - eligible input VAT estimate.
- WHT position: explicit WHT amount, rate, or transaction metadata only.
- Estimated tax due: max(net VAT estimate - recorded customer WHT, 0).
- Readiness score: rule verification, profile completion, data completeness, reconciliation coverage, and critical review clearance.

## Review Items

Generated review items include missing categories, missing suppliers/customers, missing receipts or invoice evidence, missing or invalid tax treatment, missing VAT registration status, duplicate records, unreconciled bank entries, unreconciled transactions, unverified rule sets, unexpected negative values, and reversed records excluded from estimates.

Each item has explanation, affected record where available, severity, and recommended review action. No automatic write action is attached.

## AI Behavior

Tax Assistant chat uses only approved read tools:

- `get_tax_summary`
- `get_vat_estimate`
- `get_wht_summary`
- `get_tax_periods`
- `get_tax_review_items`
- `get_transaction_tax_context`
- `get_reconciliation_tax_impact`
- `get_data_quality_summary`
- `explain_tax_calculation`
- `get_tax_rule_source`

Prohibited write tools are not present. When OpenAI provider variables are unavailable, chat returns deterministic tool-grounded fallback answers and marks provider state as setup required.

## Persistence

- Additive migration: `20260723180000_phase_3_tax_assistant_completion`
- New tables: `TaxRuleSet`, `TaxRule`, `BusinessTaxProfile`, `TaxPeriodSnapshot`, `TaxReviewItem`, `TaxAssistantConversation`, `TaxAssistantMessage`
- Optional transaction tax metadata fields: `taxTreatment`, `taxMetadata`, `vatInclusive`, `withholdingTaxRate`, `withholdingTaxAmount`, `receiptId`
- Legacy `TaxAssistantSnapshot` remains for historical compatibility but is no longer written by the Phase 3C assistant.

## Limitations

- Nigeria federal Preview rules only.
- WHT category-specific rates require explicit recorded metadata or future verified rule expansion.
- No tax filing, payment, tax authority submission, automatic transaction classification, or tax setting mutation.
- Conversational AI provider setup requires branch-scoped `OPENAI_API_KEY` and `OPENAI_MODEL`; deterministic fallback remains available without them.
