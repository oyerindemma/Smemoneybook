# SME MoneyBook Phase 3T Deployment Strategy

Status: documented rollout plan for gated Phase 3 QA on `phase-3-staging`.

Phase 3 must be released incrementally. Do not enable every module for all users at once.

## Feature Flags

- `NEXT_PUBLIC_PHASE3_AI_ADVISOR_ENABLED`
- `NEXT_PUBLIC_PHASE3_HEALTH_SCORE_ENABLED`
- `NEXT_PUBLIC_PHASE3_EXECUTIVE_DASHBOARD_ENABLED`
- `NEXT_PUBLIC_PHASE3_CASHFLOW_FORECASTS_ENABLED`
- `NEXT_PUBLIC_PHASE3_INVENTORY_FORECASTING_ENABLED`
- `NEXT_PUBLIC_PHASE3_PREDICTIVE_ALERTS_ENABLED`
- `NEXT_PUBLIC_PHASE3_BANK_RECONCILIATION_ENABLED`
- `NEXT_PUBLIC_PHASE3_TAX_ASSISTANT_ENABLED`
- `NEXT_PUBLIC_PHASE3_LOAN_READINESS_ENABLED`
- `NEXT_PUBLIC_PHASE3_COOPERATIVES_ENABLED`
- `NEXT_PUBLIC_PHASE3_PAYROLL_ENABLED`
- `NEXT_PUBLIC_PHASE3_STAFF_PERFORMANCE_ENABLED`
- `NEXT_PUBLIC_PHASE3_WHATSAPP_AUTOMATION_ENABLED`
- `NEXT_PUBLIC_PHASE3_AI_MARKETING_ENABLED`
- `NEXT_PUBLIC_PHASE3_AI_EVALUATION_ENABLED`
- `NEXT_PUBLIC_PHASE3_ADMIN_AI_OPS_ENABLED`
- `PHASE3_AI_GLOBAL_KILL_SWITCH`
- `PHASE3_AI_MONTHLY_COST_BUDGET_KOBO`
- `PHASE3_AI_DAILY_REQUEST_LIMIT_PER_BUSINESS`

## Release Waves

| Wave | Modules | Validation |
| --- | --- | --- |
| Wave 1 | AI advisor read-only, Health Score, Executive Dashboard | Grounding, tenant isolation, source metrics, owner dashboard calculations |
| Wave 2 | Cashflow Forecasts, Inventory Forecasting, Predictive Alerts | Forecast uncertainty, backtests, anomaly feedback, false-positive review |
| Wave 3 | Bank Reconciliation, Tax Assistant, Loan Readiness | Import idempotency, historical tax rules, consented loan-readiness sharing |
| Wave 4 | Payroll, Cooperative module, Staff Performance | Locking, reversal, financial integrity, transparency and role visibility |
| Wave 5 | WhatsApp Automation, AI Marketing | Consent, opt-out, template status, review-before-send |
| Ops | AI Evaluation, Admin AI Operations | Aggregate-only monitoring, cost and latency tracking, admin access control |

## Preview Deployment Requirements

- Use Vercel Preview only until Production approval.
- Confirm Preview environment variables point to Preview services.
- Apply Prisma migrations only to the Preview database.
- Confirm Preview database schema is current.
- Seed Preview entitlement explicitly for the test business only.
- Smoke-test route rendering and access/upgrade UI.
- Record deployment URL and verification results in the final readiness report.

## Rollback

1. Disable the affected feature flag.
2. Use `PHASE3_AI_GLOBAL_KILL_SWITCH` for broad AI incidents.
3. Stop scheduled jobs if introduced.
4. Preserve snapshots, alert state, evaluation events, audit logs, and imports.
5. Revert deployment only if flags cannot contain the issue.
6. Do not delete financial ledgers, payroll runs, cooperative records, bank imports, or reconciliation decisions during rollback.

## Support Runbook

- Triage by feature flag, business ID, route, and audit event.
- Use aggregate admin dashboards first.
- Request explicit customer permission before inspecting sensitive business content.
- For AI concerns, capture event IDs, model/prompt versions, source metrics, and feedback state.
- For financial integrity concerns, freeze the workflow with flags before attempting remediation.

Phase 3T authorizes incremental Preview and beta rollout only. Production activation requires explicit approval.
