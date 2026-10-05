# Phase 3E Predictive Alerts Implementation

Implementation commit: `4e3e7d4dd96c39fd5767e0bbb14f8360408dfbdc`

## Summary

Phase 3E introduces Preview-gated Predictive Alerts for SME MoneyBook. Alerts are generated from deterministic rules, persisted with evidence, deduplicated by rule/entity scope, and exposed through read/lifecycle/export APIs plus a `/more/predictive-alerts` owner UI.

## Rules

Rule version: `predictive-alerts-v2`

Implemented rules:

- `sales_decline`: previous-period sales minus current-period sales, with minimum sample and drop thresholds.
- `expense_spike`: current expenses against baseline, with amount and percentage thresholds.
- `receivables_concentration`: largest customer debt share of total open customer debt.
- `overdue_debt_increase`: material overdue customer debt or increase against comparison period.
- `supplier_payment_pressure`: supplier obligations overdue or due soon.
- `low_stock_risk`: quantity on hand at or below low-stock level with material stock value.
- `stock_out_forecast`: quantity on hand divided by recent daily sales velocity.
- `slow_moving_stock`: high-value stock with no recorded sale in the lookback period.
- `reconciliation_backlog`: unresolved bank rows by count, amount, or age.
- `duplicate_import_risk`: duplicate/probable duplicate bank import rows.
- `tax_readiness_gap`: open/high-severity Tax Assistant review items.
- `missing_data_risk`: sale/expense value missing categories, customers, suppliers, or source detail.
- `staff_attribution_anomaly`: activity with weak staff audit attribution.
- `cash_pressure_indicator`: recorded outflows plus supplier obligations against paid inflows and conservative receivables credit.
- `subscription_setup_risk`: setup gaps that reduce alert quality.

All alert evidence includes what changed, comparison period, metric values, threshold values, formula reference, source data, recommended manual review action, and disclaimers where needed.

## Data Model

Migration: `20260724200000_phase_3_predictive_alerts_completion`

Additive schema changes:

- Extends `PredictiveAlert` with rule, category, lifecycle, evidence, formula, dedupe, period, acknowledgement, resolution, and delivery metadata.
- Adds `PredictiveAlertRule`.
- Adds `BusinessAlertPreference`.
- Adds `PredictiveAlertDelivery`.

The migration backfills legacy Predictive Alert rows into the new fields and inserts default v2 rules.

## APIs

- `GET /api/predictive-alerts`
- `GET /api/predictive-alerts/[id]`
- `GET /api/predictive-alerts/preferences`
- `PUT /api/predictive-alerts/preferences`
- `POST /api/predictive-alerts/evaluate`
- `POST /api/predictive-alerts/[id]/acknowledge`
- `POST /api/predictive-alerts/[id]/dismiss`
- `POST /api/predictive-alerts/[id]/reopen`
- `GET /api/predictive-alerts/export`

Unsupported write methods return 405. No endpoint creates payments, sends customer messages, mutates stock, changes tax records, or changes financial source records.

## Access

Entitlement: `predictive_alerts`

Permissions:

- `predictive_alerts:read`
- `predictive_alerts:manage`
- `predictive_alerts:acknowledge`
- `predictive_alerts:export`

Owner receives all permissions. Accountant receives read, acknowledge, and export. Staff receives no default Predictive Alerts permission.

## UI

Route: `/more/predictive-alerts`

The UI includes:

- Active alerts.
- Date, severity, and category filters.
- Evidence panel with metrics, formula, missing-data notes, recommended review action, and disclaimer.
- Acknowledge, dismiss, and reopen lifecycle controls.
- Resolved history.
- Data quality state.
- Preferences.
- CSV export.

## Preview Evidence

Local validation:

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run test`: passed, 307 tests.
- `npm run build`: passed.
- `npx prisma validate`: passed.
- Preview `npx prisma migrate status`: up to date.
- `git diff --check`: passed.

Playwright:

- Command executed with `NEXT_PUBLIC_PHASE3_PREDICTIVE_ALERTS_ENABLED=true` and `PHASE3_PREDICTIVE_ALERTS_ENABLED=true`.
- Result: 6 passed across Chromium, mobile Chrome, and mobile Safari; not skipped.

Preview deployment:

- Branch: `phase-3-staging`
- Environment: Preview
- Commit: `4e3e7d4dd96c39fd5767e0bbb14f8360408dfbdc`
- URL: `https://smemoneybook-354z0ycg4-emmanuel-oyerindes-projects.vercel.app`
- State: Ready

Preview QA passed for navigation, page load, metrics, date filtering, staff detail, export, empty state, lifecycle, preferences, unauthorized rejection, business isolation, 405 method guards, and no unexpected 404/500.

## Limitations

- AI explanations are disabled with `PHASE3_PREDICTIVE_ALERTS_AI_EXPLANATION_ENABLED=false`.
- External email/WhatsApp delivery is disabled.
- Alerts are owner-review signals only and are not decisions, filings, fraud findings, bank balances, or automated actions.
- The module is enabled only for Preview `phase-3-staging`.

## Production

Production was not modified.
