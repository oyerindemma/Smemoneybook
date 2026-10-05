# SME MoneyBook Phase 3C Business Health Score

Status: implemented as a gated foundation on `phase-3-staging`.

The Business Health Score is a transparent operational score, not a black-box AI result. It uses recorded SME MoneyBook data and returns component reasons, confidence, data warnings, and recommended actions.

## Implemented Scope

- Feature-gated by `NEXT_PUBLIC_PHASE3_HEALTH_SCORE_ENABLED`.
- API:
  - `GET /api/health-score` calculates the current score.
  - `POST /api/health-score` recalculates and saves a snapshot.
- Access controls:
  - authenticated user
  - business membership
  - `reports:write` permission
  - optional location access when `locationId` is supplied
  - Growth-or-higher active plan
- Formula version: `health-score-v1`.
- Snapshot table: `BusinessHealthScoreSnapshot`.
- Additive migration only: `20260719070000_phase_3_health_score`.
- Dashboard card renders only when the Phase 3 health-score flag is enabled.
- Snapshot saves write an audit event: `health_score.snapshot_saved`.

## Components

| Component | Weight | Behavior |
| --- | ---: | --- |
| Recording consistency | 15 | Counts active recording days and avoids penalizing very new businesses |
| Sales trend | 15 | Compares current 30 days with previous 30 days when minimum records exist |
| Profit trend | 15 | Compares current profit with previous period when records are sufficient |
| Expense control | 10 | Reviews expenses as a percentage of recorded sales |
| Cash coverage | 10 | Estimates days of expense coverage from account balances |
| Customer debt ageing | 10 | Reviews open and overdue customer debt |
| Supplier bill ageing | 5 | Reviews open and overdue supplier bills |
| Inventory health | 10 | Reviews low stock and stockout risk from current stock records |
| Data completeness | 10 | Checks categories, parties, stock costs, and account presence |

## Output Contract

The score includes:

- `formulaVersion`
- `score`
- `rating`
- `confidence`
- `periodStart`
- `periodEnd`
- `components`
- `recommendations`
- `dataWarnings`
- `sourceMetrics`

Each component includes score, weight, status, trend, explanation, action, and source metrics.

## Safeguards

- New businesses with limited history receive `insufficient_data` component states instead of harsh trend penalties.
- Low-record periods avoid strong trend claims.
- Recommendations are operational suggestions only.
- The score should not be used for lending, tax, payroll, or compliance decisions without separate review.

## Remaining Work

- Admin monitoring for score recalculation volume and retention impact.
- Historical chart from saved snapshots.
- Location comparison view.
- Backfill job for beta cohorts.
- More precise cash coverage once bank reconciliation is implemented.
- Product analytics event for score views and actions.

Phase 3C is ready for internal flagged QA, not broad Production activation.
