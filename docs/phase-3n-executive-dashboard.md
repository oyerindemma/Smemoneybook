# SME MoneyBook Phase 3D Executive Dashboard

Status: implemented as a read-only Preview module on `phase-3-staging`.

Executive Dashboard is an owner decision view for recorded sales, expenses, profit, cash movement, receivables, payables, stock, staff operations, bank reconciliation, tax readiness, attention items, and data-quality disclosures.

## Implemented Scope

- Feature-gated by both:
  - `PHASE3_EXECUTIVE_DASHBOARD_ENABLED`
  - `NEXT_PUBLIC_PHASE3_EXECUTIVE_DASHBOARD_ENABLED`
- APIs:
  - `GET /api/executive-dashboard`
  - `GET /api/executive-dashboard/summary`
  - `GET /api/executive-dashboard/attention`
  - `GET /api/executive-dashboard/drilldown`
  - `GET /api/executive-dashboard/export`
  - `POST /api/executive-dashboard/refresh`
- Access controls:
  - authenticated user
  - business membership
  - Pro plan with `executive_dashboard` entitlement
  - `executive_dashboard:*` permissions
  - optional location scope
- Metric version: `executive-dashboard-v2`.
- Additive migration already available: `20260719123000_phase_3_executive_dashboard`.
- More page route: `/more/executive-dashboard`.
- Audit events:
  - `executive_dashboard.viewed`
  - `executive_dashboard.period_changed`
  - `executive_dashboard.drilldown_opened`
  - `executive_dashboard.export_generated`
  - `executive_dashboard.refresh_requested`

## Metrics

- Sales, paid sales, credit sales and average sale value
- Expenses and expense categories
- Recorded gross profit, estimated net operating result and margin
- Recorded cash inflows, outflows and net movement
- Bank-reconciled and unreconciled imported amounts
- Customer debt, overdue customer debt and ageing
- Supplier obligations, overdue obligations and ageing
- Stock cost value, potential revenue, potential profit and low stock
- Pending transfers and warehouse count
- Staff activity summary from Staff Performance
- Tax readiness from deterministic Tax Assistant
- Reconciliation rate and unresolved imported bank rows
- Attention queue and data-quality status

## Safeguards

- Reversed transactions are excluded.
- Bank balance is not shown because imported statements are not a live bank balance.
- Staff metrics are activity indicators, not employment rankings.
- Tax readiness reuses deterministic Tax Assistant and is not a filed return.
- Snapshot save is not exposed in Phase 3D Preview.
- Unsupported write methods return `405`.
- Every metric includes formula id, source service, period, comparison period, data-quality status, timestamp and business scope.

Phase 3D requires Preview QA evidence before broad activation.
