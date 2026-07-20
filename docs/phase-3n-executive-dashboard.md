# SME MoneyBook Phase 3N Executive Dashboard

Status: implemented as a gated foundation on `phase-3-staging`.

Executive Dashboard is an owner decision view for recorded business metrics, inventory value, debt exposure, location comparison, and recommended actions.

## Implemented Scope

- Feature-gated by `NEXT_PUBLIC_PHASE3_EXECUTIVE_DASHBOARD_ENABLED`.
- API:
  - `GET /api/executive-dashboard` calculates current summary.
  - `POST /api/executive-dashboard` saves a snapshot.
- Access controls:
  - authenticated user
  - business membership
  - `reports:write` permission
  - optional location access
  - Pro active plan
- Formula version: `executive-dashboard-v1`.
- Additive migration only: `20260719123000_phase_3_executive_dashboard`.
- More page route: `/more/executive-dashboard`.
- Audit event: `executive_dashboard.snapshot_saved`.

## Metrics

- Revenue
- Expenses
- Profit
- Cash available
- Outstanding customer debt
- Supplier bills
- Stock cost value
- Potential stock revenue
- Gross margin percent
- Best products
- Slow products
- Location comparison
- Recommended actions
- Data freshness

## Safeguards

- Reversed transactions are excluded.
- Gross margin uses sales gross profit, not net profit after expenses.
- Missing sales data returns `null` margin and recommends recording data first.
- Snapshotting is additive and does not mutate source records.
- Recommended actions are review-oriented, not guarantees.

## Remaining Work

- Drill-down links into source reports.
- Cached summary invalidation strategy.
- Location comparison visualizations.
- Staff-performance merge once transparency notices are complete.
- Forecast alert merge after Phase 3O alert state is implemented.

Phase 3N is ready for internal flagged QA, not broad Production activation.
