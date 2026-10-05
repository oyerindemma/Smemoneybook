# SME MoneyBook Phase 3D Predictive Cashflow

Status: implemented as a gated foundation on `phase-3-staging`.

Predictive Cashflow estimates future cash position from recorded SME MoneyBook data. It is an operational planning aid, not a guarantee, loan decision, accounting opinion, or financial advice.

## Implemented Scope

- Feature-gated by `NEXT_PUBLIC_PHASE3_CASHFLOW_FORECASTS_ENABLED`.
- API:
  - `GET /api/cashflow-forecast` calculates forecasts.
  - `POST /api/cashflow-forecast` recalculates and saves forecast snapshots.
- Horizons: 7 days, 30 days, 90 days.
- Access controls:
  - authenticated user
  - business membership
  - `reports:write` permission
  - optional location access when `locationId` is supplied
  - Growth-or-higher active plan
- Formula version: `cashflow-forecast-v1`.
- Snapshot table: `CashflowForecastSnapshot`.
- Additive migration only: `20260719073000_phase_3_cashflow_forecasts`.
- Dashboard card renders only when the Phase 3 cashflow forecast flag is enabled.
- Snapshot saves write an audit event: `cashflow_forecast.snapshot_saved`.

## Inputs

| Input | Source | Treatment |
| --- | --- | --- |
| Current cash | `Account.balance` | Business-wide account balances are summed |
| Historical inflows | paid `Transaction` sale records | Reversed records and unpaid/credit entries are excluded |
| Historical outflows | paid `Transaction` expense records | Reversed records and unpaid entries are excluded |
| Expected customer payments | open customer `Debt` with due dates | Remaining balances due before the forecast end are included |
| Supplier obligations | open supplier `Debt` with due dates | Remaining balances due before the forecast end are included |
| Recurring expenses | repeated expense category/description patterns | Used as a conservative expense floor |
| Location scope | `Transaction.locationId` and debt source transaction location | Opening cash remains business-wide until account balances become location-specific |

## Thresholds

| Horizon | Minimum history | Minimum paid cash transactions |
| --- | ---: | ---: |
| 7 days | 30 days | 8 |
| 30 days | 60 days | 15 |
| 90 days | 120 days | 30 |

When thresholds are not met, the forecast returns `insufficient_data` confidence and explains the missing inputs.

## Output Contract

The forecast response includes:

- `formulaVersion`
- `generatedAt`
- `periodStart`
- `recordedThrough`
- `currentCash`
- recorded metrics
- source metrics
- data warnings
- one forecast per requested horizon

Each horizon includes:

- `confidence`
- `forecastStart`
- `forecastEnd`
- `openingCash`
- `projectedInflows`
- `projectedOutflows`
- `projectedNetCash`
- `forecastEndingCash`
- `lowerBound`
- `upperBound`
- `historicalInflows`
- `historicalOutflows`
- `expectedCustomerPayments`
- `supplierObligations`
- `recurringExpenseFloor`
- `assumptions`
- `alerts`
- `dataWarnings`
- `forecastSeries`
- `backtest`

Recorded values and forecast values are returned separately so the UI and AI advisor can label facts versus predictions.

## Backtesting And Accuracy

`cashflow-forecast-v1` backtests each horizon against the most recent completed equivalent period when enough history exists:

- Uses prior paid cash movements as the training period.
- Compares predicted net cash movement with actual recorded net cash movement.
- Stores absolute error and accuracy percentage in the snapshot payload.
- Snapshot fields also include nullable `actualEndingCash`, `absoluteError`, `accuracyPercent`, and `evaluatedAt` for future scheduled accuracy evaluation.

## Alerts

Initial alerts:

- Expected cash shortage
- Expenses growing faster than income
- Large upcoming supplier obligations
- Low cash coverage
- Overdependence on one customer

Alerts include source metrics and are review-oriented. They must not be phrased as guarantees.

## Safeguards

- Forecasts use authorized business data only.
- Feature is disabled by default.
- No financial records are mutated.
- No supplier payment, reminder, loan, or bank action is executed from a forecast.
- Forecasts always include assumptions and a non-guarantee warning.
- Open debts without due dates are excluded from dated projections and called out as data warnings.

## Remaining Work

- Scheduled evaluation job to update `actualEndingCash`, `absoluteError`, `accuracyPercent`, and `evaluatedAt`.
- Historical forecast accuracy dashboard.
- Exportable forecast report.
- User feedback controls for alert usefulness.
- More precise location cash once accounts can be mapped to locations.
- Bank reconciliation integration for stronger cash freshness.

Phase 3D is ready for internal flagged QA, not broad Production activation.
