# SME MoneyBook Phase 3K Staff Performance

Status: implemented as a gated foundation on `phase-3-staging`.

Staff Performance is a coaching-oriented dashboard for legitimate business activity metrics. It must not be used for hidden surveillance, sensitive profiling, or unsupported attendance tracking.

## Implemented Scope

- Feature-gated by `NEXT_PUBLIC_PHASE3_STAFF_PERFORMANCE_ENABLED`.
- API:
  - `GET /api/staff-performance` calculates staff activity metrics for a period.
  - `POST /api/staff-performance` supports explicit actions:
    - `create_goal`
    - `save_snapshot`
- Access controls:
  - authenticated user
  - business membership
  - `reports:write` for reading
  - `admin` for creating goals or snapshots
  - optional location access
  - Pro active plan
- Formula version: `staff-performance-v1`.
- Additive migration only: `20260719110000_phase_3_staff_performance`.
- More page route: `/more/staff-performance`.
- Audit events: `staff_performance.create_goal` and `staff_performance.save_snapshot`.

## Metrics

- Sales recorded: count of auditable sale actions.
- Revenue handled: sum of explicit amount fields in auditable metadata. If unavailable, it stays unavailable.
- Transactions processed: count of transaction and POS actions.
- Returns processed: count of customer and supplier return actions.
- Debt actions: count of debt reminders, collections, and settlements.
- Goal progress: current metric value divided by configured target.

## Safeguards

- No attendance metric is included.
- No sensitive profiling is included.
- Revenue is never parsed from free-text audit messages.
- Location filtering uses explicit `metadata.locationId` only.
- User-facing language must remain coaching-oriented.
- Metrics include warnings when source data is incomplete.

## Remaining Work

- Dedicated staff visibility settings.
- Staff-facing transparency notice.
- Location-aware metadata coverage for all money-entry flows.
- Goal management UI.
- Cash variance only after explicit cash session controls exist.
- E2E tests for staff role visibility.

Phase 3K is ready for internal flagged QA, not broad Production activation.
