# SME MoneyBook Phase 3Q Admin AI Operations

Status: implemented as a gated foundation on `phase-3-staging`.

Admin AI Operations extends `/admin` with aggregate AI, automation, reconciliation, payroll, cooperative, and customer-success health signals. It does not expose sensitive business content.

## Implemented Scope

- Feature-gated by `NEXT_PUBLIC_PHASE3_ADMIN_AI_OPS_ENABLED`.
- Route: `/admin`, visible only to existing admin access rules.
- Service: `getAdminAiOperationsOverview`.
- Summary version: built from `ai-evaluation-v1` and aggregate operational records.
- No new migration beyond the Phase 3O/3P evaluation and alert state tables.

## Metrics

- AI request volume
- AI cost estimate
- Average and p95 latency
- Tool failure rate
- Recommendation acceptance rate
- Categorization accuracy
- Forecast accuracy from evaluated cashflow forecast snapshots
- Anomaly precision from confirmed versus incorrect predictive-alert feedback
- WhatsApp automation sent, queued, failed, and failure rate
- Bank import failures
- Reconciliation backlog
- Tax assistant usage
- Payroll failures or reversals
- Cooperative arrears
- At-risk businesses
- Customer-success intervention count

## Safeguards

- Uses aggregate counts, rates, and status fields only.
- Does not render prompt text, assistant answer content, bank descriptions, payroll employee details, cooperative member names, or customer names.
- Existing `/admin` access control remains the outer gate.
- Dashboard remains invisible when the feature flag is off.

## Remaining Work

- Time-series charts and alert thresholds.
- Admin runbook links for each intervention type.
- Provider-reconciled AI cost ingestion.
- Scheduled anomaly precision and forecast accuracy rollups.

Phase 3Q is ready for internal flagged QA, not broad Production activation.
