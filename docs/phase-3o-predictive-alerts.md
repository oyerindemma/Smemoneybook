# SME MoneyBook Phase 3O Predictive Alerts

Status: implemented as a gated foundation on `phase-3-staging`.

Predictive Alerts detects review-worthy business changes from authorized records. Alerts are not accusations and are not financial guarantees.

## Implemented Scope

- Feature-gated by `NEXT_PUBLIC_PHASE3_PREDICTIVE_ALERTS_ENABLED`.
- API:
  - `GET /api/predictive-alerts` lists stored alerts.
  - `POST /api/predictive-alerts` with `action: "scan"` recalculates alert candidates.
  - `POST /api/predictive-alerts` with `dismissed`, `confirmed`, `incorrect`, or `resolved` records feedback.
- Access controls:
  - authenticated user
  - business membership
  - `reports:write` permission
  - optional location access
  - Growth active plan
- Rule version: `predictive-alerts-v1`.
- Additive migration only: `20260719130000_phase_3_predictive_alerts_and_ai_evaluation`.
- More page route: `/more/predictive-alerts`.
- Audit events:
  - `predictive_alerts.scanned`
  - `predictive_alerts.dismissed`
  - `predictive_alerts.confirmed`
  - `predictive_alerts.incorrect`
  - `predictive_alerts.resolved`

## Alert Types

- Revenue drop
- Expense spike
- Duplicate transaction
- Unusual refund
- Unusual discount
- Stock shrinkage
- Bank reconciliation backlog
- Customer payment slowdown
- Supplier price increase
- Dormant high-value customer
- Product demand shift
- Potential cash shortage from cashflow snapshots

## Safeguards

- Alerts include confidence, impact, source period, and source metrics.
- Trend alerts require minimum samples and minimum impact.
- Dismissed or incorrect alerts are not silently reset by repeat scans for the same alert key.
- Fraud language is intentionally avoided.
- Scan writes only alert state; it does not mutate transactions, debts, stock, or cash records.
- Human feedback is stored for precision and false-positive monitoring.

## Remaining Work

- Scheduled scans per rollout cohort.
- Dedicated notification channel once quiet hours and opt-in policy are confirmed.
- Per-industry thresholds after enough validated feedback exists.
- Admin-facing precision trend is introduced in Phase 3Q.

Phase 3O is ready for internal flagged QA, not broad Production activation.
