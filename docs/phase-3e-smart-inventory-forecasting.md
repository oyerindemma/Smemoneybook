# SME MoneyBook Phase 3E Smart Inventory Forecasting

Status: implemented as a gated foundation on `phase-3-staging`.

Smart Inventory Forecasting estimates product demand and restock timing from recorded stock movements. It is a planning aid only. It never creates purchase orders, supplier messages, or stock mutations automatically.

## Implemented Scope

- Feature-gated by `NEXT_PUBLIC_PHASE3_INVENTORY_FORECASTING_ENABLED`.
- API:
  - `GET /api/inventory-forecast` calculates inventory forecasts.
  - `POST /api/inventory-forecast` recalculates and saves forecast snapshots.
- Access controls:
  - authenticated user
  - business membership
  - `inventory:write` permission
  - optional location access when `locationId` is supplied
  - Growth-or-higher active plan
- Formula version: `inventory-forecast-v1`.
- Snapshot table: `InventoryForecastSnapshot`.
- Additive migration only: `20260719080000_phase_3_inventory_forecasts`.
- Stock dashboard card renders only when the Phase 3 inventory-forecast flag is enabled.
- Snapshot saves write an audit event: `inventory_forecast.snapshot_saved`.

## Inputs

| Input | Source | Treatment |
| --- | --- | --- |
| Current quantity | `InventoryItem.quantityOnHandDecimal` or `InventoryBalance.quantityOnHandDecimal` | Location balance is preferred when scoped |
| Low-stock level | `InventoryItem.lowStockLevelDecimal` or `InventoryBalance.lowStockLevelDecimal` | Location level is preferred when scoped |
| Demand | `InventoryMovement` stock-out movements with stock-out adjustment type | Non-demand reductions like damage/theft are separated from demand |
| Stock-in movement | `InventoryMovement` stock-in movements | Used as source context, not as demand |
| Supplier lead time | default or manual override | Default is 14 days |
| Safety stock | default days or manual quantity override | Default is 7 days of forecast demand |
| Seasonality | prior-year demand window | Applied only when enough prior-year movement history exists |

## Thresholds

- Minimum history: 14 days.
- Minimum demand movements per product: 5 stock-out demand movements.
- Below threshold: confidence is `insufficient_data`.
- Confidence improves with more history, more demand movement records, and recent demand freshness.

## Output Contract

The forecast response includes:

- `formulaVersion`
- `generatedAt`
- `periodStart`
- `recordedThrough`
- `forecastHorizonDays`
- product forecasts
- source metrics
- data warnings

Each product forecast includes:

- `classification`
- `confidence`
- `currentQuantity`
- `lowStockLevel`
- `averageDailyDemand`
- `recentDailyDemand`
- `forecastDailyDemand`
- `daysOfStockRemaining`
- `predictedStockoutAt`
- `restockByDate`
- `suggestedReorderQuantity`
- `supplierLeadTimeDays`
- `safetyStockQuantity`
- `manualOverride`
- `assumptions`
- `recommendation`
- `dataWarnings`
- `accuracyMetrics`

## Classifications

- `out_of_stock`
- `likely_stockout`
- `fast_moving`
- `steady`
- `slow_moving`
- `dead_stock`
- `excess_inventory`

Recommendations are explainable and refer to recorded movement counts, demand rates, lead time, and safety stock.

## Manual Overrides

The API and dashboard allow manual override of:

- supplier lead time
- safety-stock days
- safety-stock quantity
- minimum reorder quantity

Overrides are stored in forecast snapshots so later review can distinguish system defaults from user assumptions.

## Accuracy Tracking

`inventory-forecast-v1` includes an in-line demand backtest where enough completed product demand history exists. Snapshots also include nullable future evaluation fields for actual demand and forecast error.

## Safeguards

- Forecasts use authorized business and location data only.
- Forecasts do not create purchases, transfers, WhatsApp messages, or stock entries.
- Non-demand stock reductions are not treated as customer demand.
- Low-history products show insufficient-data warnings.
- Forecasts always state that recommendations are planning estimates.

## Remaining Work

- Scheduled forecast evaluation job to fill actual demand and forecast error fields.
- Per-supplier lead-time settings.
- Product-level override persistence outside snapshots.
- Exportable reorder report.
- Alert feedback loop for accepted/incorrect restock recommendations.
- Stronger seasonality once a full year of movement data exists for more businesses.

Phase 3E is ready for internal flagged QA, not broad Production activation.
