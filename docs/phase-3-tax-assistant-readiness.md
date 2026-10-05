# Phase 3C Tax Assistant Readiness Audit

Branch: `phase-3-staging`

Audit date: 2026-07-23

## Existing Tax Surfaces

- `TaxConfig` stores business-level country, registration number, enabled flag, inclusive pricing default and disclaimer.
- `TaxRate` stores business-level VAT/zero-rated/exempt/custom rates, but not statutory source metadata, effective dates, thresholds or verification status.
- `DocumentTaxSnapshot` stores immutable tax amounts attached to issued documents or transactions.
- `TaxRun` stores saved monthly VAT summaries from the old monthly report flow.
- `Business.vatRate` and `getMonthlyReport` calculate a simple VAT estimate as taxable sales times the business VAT rate.
- `/api/tax/settings` and `TaxManagementPanel` support Phase 2 tax setup behind Phase 2 tax flags and `tax_management`.
- `/api/tax/summary` saves a VAT run from the monthly report.
- Existing `src/lib/phase3/tax-assistant.ts` calculates one estimated tax amount from sales and the current default rate.

## Reusable Services

- Business and location access helpers in `src/lib/operations/access.ts`.
- Feature gating in `src/lib/phase3/feature-flags.ts`.
- Billing plan and entitlement checks in `src/lib/billing/subscriptions.ts` and `src/lib/billing/plans.ts`.
- Existing assistant guardrails, audit logging, source citation patterns, and OpenAI environment validation.
- Bank Reconciliation confirmed-match records can distinguish reconciled and unreconciled tax-impacting transactions.
- Report CSV helpers and export-job patterns can inform the working-paper export.

## Existing Formulas

- Monthly VAT estimate: `taxableSalesTotal * business.vatRate / 100`.
- Existing Tax Assistant estimate: period sale transaction total multiplied by the default configured `TaxRate`.
- Both formulas are recordkeeping estimates and do not include WHT, input VAT, tax-rule source verification, rule effective dates, or data-completeness scoring.

## Missing Transaction Fields

- No explicit tax treatment per transaction.
- No explicit VAT inclusive/exclusive override per transaction.
- No WHT rate or WHT amount per transaction.
- No direct receipt relationship from `Transaction` to `Receipt`.
- No explicit reviewed tax category status.
- No tax-rule version stamped on ordinary transaction rows.

## Missing Tax Metadata

- `TaxRate` lacks source authority, source reference, publication date, effective date and verification status.
- Current tax settings lack filing frequency, fiscal year start, VAT registration effective date, WHT applicability, industry category and accountant contact fields.
- Current Tax Assistant has no rule-set table, no review-item table, no dedicated conversation/message storage, and no prompt/tool version telemetry.

## Data-Quality Gaps

- Missing category, customer, supplier, receipt and invoice evidence are not turned into tax review items.
- Reversed transactions are partly detectable but old summaries can still be too broad.
- Duplicate transaction review is heuristic only.
- Bank reconciliation status is not included in the old tax estimate.
- Unverified rule versions do not block definitive estimates.
- Tax registration numbers are not masked in all Tax Assistant display contexts.

## AI Dependencies

- Existing OpenAI config is `OPENAI_API_KEY` and `OPENAI_MODEL`.
- Existing assistant can fall back to a local grounded router, but Phase 3C requires Tax Assistant conversational Preview readiness only when provider variables are present.
- Tax Assistant tools must be read-only, bounded, independently authorized and must not expose raw unrestricted database access to the model.

## Privacy Concerns

- Tax IDs must be masked by default.
- Chat messages must not store credentials, cookies, API keys, bank account credentials, Paystack secrets, WhatsApp tokens, password hashes or unnecessary personal identifiers.
- Customer/supplier details should be aggregated or minimally disclosed unless a specific transaction context is requested by an authorized user.

## Migration Requirements

- Add versioned `TaxRuleSet` and `TaxRule`.
- Add extended `BusinessTaxProfile`.
- Add `TaxPeriodSnapshot`, `TaxReviewItem`, `TaxAssistantConversation` and `TaxAssistantMessage`.
- Add optional tax metadata fields to `Transaction`.
- Seed an initial verified Nigerian Preview rule set for deterministic estimates.
- Keep all migration work additive.

## External Regulatory Dependencies

- Official Nigerian tax-law references must be recorded in rule-set configuration.
- Current official source references include:
  - Nigeria Revenue Service official site: https://www.nrs.gov.ng/
  - Nigeria Tax Act 2025 PDF hosted by NRS: https://www.nrs.gov.ng/uploads/NIGERIA_TAX_ACT_2025_ef6bb812a5.pdf
  - NRS withholding-tax page: https://www.nrs.gov.ng/page/withholding-tax
  - TaxPro Max filing portal: https://taxpromax.firs.gov.ng/
- Category-specific WHT rates must remain configurable/reviewable and should not be auto-applied to ambiguous records without explicit transaction metadata or user review.

## Preview QA Plan

- Keep all Tax Assistant flags disabled by default.
- Validate dedicated `phase-3-staging` Neon database URL structure before Prisma operations.
- Apply additive migration only with `npx prisma migrate deploy`.
- Configure only Vercel Preview branch `phase-3-staging` variables:
  - `PHASE3_AI_ENABLED=true`
  - `PHASE3_TAX_ASSISTANT_ENABLED=true`
  - `NEXT_PUBLIC_PHASE3_TAX_ASSISTANT_ENABLED=true`
- Confirm `OPENAI_API_KEY`, `OPENAI_MODEL`, `DATABASE_URL`, `DIRECT_URL`, and `NEXT_PUBLIC_APP_URL` exist without printing values.
- Run local lint, typecheck, tests, build, Prisma validate/status and Playwright with flags enabled.
- Deploy only Preview from `phase-3-staging`.
- Use synthetic Preview-only data to test summary, VAT, WHT, review items, chat, export, isolation, permissions, kill switch, no write controls, mobile and desktop.

## Readiness Conclusion

Phase 3C can reuse Phase 2 tax settings, document snapshots, transaction records, receipts, reports, assistant guardrails, audit logs, permissions and billing infrastructure. The old Tax Assistant is not Preview-ready for Phase 3C because it lacks authoritative rule governance, dedicated access controls, WHT support, input VAT support, review items, read-only AI tool governance, working-paper export and executed Preview QA evidence.
