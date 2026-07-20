# SME MoneyBook Phase 3S Testing

Status: documented baseline plus focused unit/API coverage on `phase-3-staging`.

Phase 3 testing must prove that AI answers are grounded, predictions state uncertainty, tenant boundaries hold, and high-impact workflows require human confirmation.

## Implemented Focused Coverage

- AI advisor guardrails, context, tools, chat API, and feedback API
- Business Health Score formula/API
- Cashflow Forecast formula/API
- Inventory Forecast formula/API
- Bank Reconciliation parser/matching/API
- Loan Readiness formula/API
- Tax Assistant formula/API
- Cooperative ledger/API
- Payroll formula/API
- Staff Performance formula/API
- WhatsApp Automation policy/API
- AI Marketing draft/API
- Executive Dashboard formula/API
- Predictive Alerts formula/API
- AI Evaluation summary/API
- Admin AI Operations summary

## Required Test Categories

- Metric-calculation tests for every formula version.
- AI tool authorization tests for every server-side assistant tool.
- Prompt-injection tests for user messages and tool routing.
- Cross-tenant tests for every business-scoped API.
- Forecast backtests and accuracy persistence.
- Inventory forecast tests for demand, stockout, override, and low-data cases.
- Bank matching, duplicate import, and reconciliation locking tests.
- Tax-rule version and historical snapshot tests.
- Payroll locking and reversal tests.
- Cooperative ledger integrity tests.
- WhatsApp consent, quiet-hour, opt-out, and template-status tests.
- Anomaly false-positive tests and feedback loop tests.
- AI response grounding tests with source citations.
- Cost-limit and kill-switch tests.

## Critical E2E Scenarios

1. AI answers a profit question using only the signed-in business records.
2. AI refuses cross-business data access.
3. Cashflow forecast states assumptions, confidence, recorded period, and forecast period.
4. Inventory recommendation links to real product data and does not auto-purchase.
5. Bank import identifies possible matches without duplicate import records.
6. User confirms reconciliation and locked records are protected.
7. Loan readiness report includes non-approval disclaimer.
8. Tax assistant preserves historical rule versions.
9. Payroll run locks and cannot be recalculated without reversal.
10. WhatsApp automation respects opt-out and approved templates.
11. AI marketing content remains draft until approval.
12. Predictive alert can be marked incorrect and appears in evaluation precision metrics.

## Gate Commands

Run before declaring Phase 3 locally ready:

```bash
npx prisma validate
npx prisma generate
npm run lint
npm run typecheck
npm run test
npm run build
npx prisma migrate status
```

`npx prisma migrate deploy` is not part of local verification unless explicitly operating on a non-production preview database with approved credentials.

## Release Validation

- Validate each rollout wave separately.
- Keep all feature flags default-off until a specific beta cohort is approved.
- Confirm no migration banner appears in Preview after applying migrations to the Preview database only.
- Confirm new routes render access/upgrade UI instead of native 404 for authenticated users without entitlement.
- Record final gate output in `docs/phase-3-final-readiness-report.md`.

Phase 3S is not complete until the full gate commands pass after the last Phase 3 change.
