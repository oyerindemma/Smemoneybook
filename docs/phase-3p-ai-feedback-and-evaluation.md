# SME MoneyBook Phase 3P AI Feedback And Evaluation

Status: implemented as a gated foundation on `phase-3-staging`.

AI Feedback and Evaluation provides a shared telemetry ledger for AI request volume, user feedback, recommendation acceptance, correctness, tool-call health, latency, cost, safety labels, evaluation datasets, and regression runs.

## Implemented Scope

- Feature-gated by `NEXT_PUBLIC_PHASE3_AI_EVALUATION_ENABLED`.
- API:
  - `GET /api/ai-evaluation` returns aggregate overview for the active business.
  - `POST /api/ai-evaluation` records evaluation events, dataset metadata, or evaluation run metadata.
- Access controls:
  - authenticated user
  - business membership
  - `reports:write` permission
  - Pro active plan
- Evaluation version: `ai-evaluation-v1`.
- Additive migration only: `20260719130000_phase_3_predictive_alerts_and_ai_evaluation`.
- More page route: `/more/ai-evaluation`.
- Existing integrations:
  - AI advisor request telemetry
  - AI advisor answer feedback
  - AI advisor tool-call telemetry
  - AI Marketing request, approval, and feedback telemetry
  - Predictive Alert feedback telemetry

## Metrics

- Request volume
- Helpful/not-helpful feedback
- Correct/incorrect categorization
- Recommendation acceptance/rejection
- User corrections
- Prompt/model version tracking
- Tool-call failure rate
- Latency average and p95
- Cost estimate in kobo
- Safety event count
- Dataset count and redaction/consent status
- Evaluation run failures

## Safeguards

- The API accepts metadata, not raw prompt or response content.
- Best-effort telemetry writers do not break user workflows if evaluation is disabled.
- Customer data must not be used for training outside applicable terms, consent, and privacy controls.
- Evaluation datasets store redaction and consent flags.
- Tool-call metrics are recorded from server-side allowlisted tools only.

## Remaining Work

- Curated redacted regression dataset.
- Automated safety regression runner in CI.
- Provider-reconciled token and cost accounting.
- Admin trend charts and alerting in Phase 3Q.

Phase 3P is ready for internal flagged QA, not broad Production activation.
