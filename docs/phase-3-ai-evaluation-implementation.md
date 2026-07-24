# SME MoneyBook Phase 3F AI Evaluation Implementation

Final classification: PREVIEW OPERATIONAL

## Branch And Commits

- Branch: `phase-3-staging`
- Implementation commit: `5b66292`
- Production branch: unchanged
- Main branch: not merged

## Feature Flags

Exact flags:

- `PHASE3_AI_EVALUATION_ENABLED`
- `NEXT_PUBLIC_PHASE3_AI_EVALUATION_ENABLED`

Defaults remain `false` in source and `.env.example`. Vercel Preview has both flags set to `true` only for Git branch `phase-3-staging`. No Production flag was enabled.

Server enforcement requires the server flag, the public flag, and no `PHASE3_AI_GLOBAL_KILL_SWITCH`. Client navigation and `/more/ai-evaluation` visibility use the public Phase 3 flag state.

## Access And Entitlement

- Entitlement: `ai_evaluation`
- Permissions: `ai_evaluation:read`, `ai_evaluation:run`, `ai_evaluation:manage_cases`, `ai_evaluation:export`, `ai_evaluation:compare_models`
- Owner/admin workspaces: allowed when entitled
- Internal admin: full access
- Accountant: no default access
- Normal staff: no default access

Preview QA confirmed owner access, staff rejection, accountant rejection, unauthenticated rejection, and cross-business rejection.

## Schema And Migration

Migration: `20260724213000_phase_3_ai_evaluation_completion`

The migration is additive. It extends legacy AI evaluation metadata and adds:

- `AiEvaluationSuite`
- `AiEvaluationCase`
- `AiEvaluationResult`
- `AiEvaluationBaseline`

Preview database validation:

- `npx prisma validate`: passed
- `npx prisma migrate status`: initially showed the Phase 3F migration pending
- SQL inspected before deploy: additive governance tables/columns only; no `DROP`, `DELETE`, or `TRUNCATE`
- `npx prisma migrate deploy`: applied only to the phase-3-staging Preview Neon branch
- `npx prisma migrate status`: schema up to date, 38 migrations found

Production database was not queried or modified.

## Datasets

Dataset version: `phase3f-synthetic-v1`

The default Preview suite uses 16 synthetic cases covering:

- Tax questions
- Missing data
- Incorrect assumptions
- Cross-business access attempts
- Prompt injection
- Tool misuse
- Sensitive-data requests
- Unsupported legal or tax claims
- Numerical calculations
- Reconciliation questions
- Empty-data handling
- Rate-limit handling
- Provider failure retry
- Malformed tool results
- High-cost prompt attempts
- Predictive-alert regression checks

No Production customer data is used.

## Evaluators

Evaluator version: `phase3f-deterministic-evaluators-v1`

Implemented deterministic evaluators:

- Tool authorization
- Required tool
- Forbidden tool
- Numeric accuracy
- Citation/rule version
- Business isolation
- Sensitive-data leakage
- Missing-data disclosure
- Unsupported claim
- Refusal
- Read-only compliance
- Latency
- Cost
- Token limit
- Response format

Critical failures override aggregate score and block baseline acceptance.

## Thresholds

- Aggregate score: at least 85
- Pass rate: at least 85 percent
- Category score: at least 75
- Average latency: at most 8 seconds
- P95 latency: at most 12 seconds
- Case cost: at most 250 kobo
- Run cost: at most 2,000 kobo
- Case tokens: at most 1,500
- Run tokens: at most 15,000

## APIs

Implemented routes:

- `GET /api/ai-evaluation/suites`
- `POST /api/ai-evaluation/suites`
- `GET /api/ai-evaluation/suites/[id]`
- `POST /api/ai-evaluation/suites/[id]/run`
- `GET /api/ai-evaluation/runs`
- `GET /api/ai-evaluation/runs/[id]`
- `POST /api/ai-evaluation/runs/[id]/cancel`
- `POST /api/ai-evaluation/runs/[id]/accept-baseline`
- `GET /api/ai-evaluation/compare`
- `GET /api/ai-evaluation/export`

All writes are governance writes only. They do not mutate accounting, inventory, tax filing, payment, invoice, or customer financial records. Unsupported methods return `405`.

## UI

Route: `/more/ai-evaluation`

The UI includes:

- Evaluation suites
- Latest run status
- Pass rate
- Critical failures
- Score breakdown
- Cost and latency
- Prompt/model/tool version
- Failed cases
- Case detail
- Compare runs
- Baseline management
- Export report
- Empty state
- Provider setup status

## Local Validation

- `npm run lint`: passed
- `npm run typecheck`: passed
- `npm run test`: passed, 85 files and 326 tests
- `npm run build`: passed
- `npx prisma validate`: passed
- `npx vercel env run -e preview --git-branch phase-3-staging -- npx prisma migrate status`: passed, schema up to date
- `git diff --check`: passed

Focused Phase 3F tests:

- Command: `npx vitest run src/lib/ai-evaluation/evaluators.test.ts src/lib/ai-evaluation/scoring.test.ts src/lib/ai-evaluation/runner.test.ts src/lib/ai-evaluation/authorization.test.ts src/app/api/ai-evaluation/route.test.ts`
- Result: passed, 5 files and 23 tests

Playwright:

- Command: `NEXT_PUBLIC_PHASE3_AI_EVALUATION_ENABLED=true PHASE3_AI_EVALUATION_ENABLED=true npx playwright test tests/e2e/ai-evaluation.spec.ts`
- Result: passed, 6 tests across desktop Chrome, mobile Chrome, and mobile Safari
- The spec executed and did not skip.

## Preview Deployment

- Vercel environment: Preview
- Vercel branch: `phase-3-staging`
- Implementation deployment commit: `5b66292`
- Deployment status: Ready
- Deployment URL: `https://smemoneybook-fhxq99ai1-emmanuel-oyerindes-projects.vercel.app`
- Branch alias: `https://smemoneybook-git-phase-3-staging-emmanuel-oyerindes-projects.vercel.app`

## Preview QA

Live Preview QA was executed against the deployment URL above using synthetic Preview data only.

Result:

- Suite case count: 16
- Completed run total cases: 16
- Pass rate: 100 percent
- Critical failures: 0
- Total cost: 210 kobo
- Total tokens: 5,700
- Average latency: 341 ms

Checks passed:

- Owner access
- Normal staff rejection
- Accountant rejection
- Unauthorized-user rejection
- Business isolation
- Empty state
- Suite creation
- Suite execution
- Deterministic evaluator coverage
- Critical failure blocks baseline acceptance
- Cost capture
- Token capture
- Latency capture
- Baseline acceptance
- Regression comparison
- CSV export with secret redaction
- Provider configured state
- `/more` shows AI Evaluation as Preview
- `/more/ai-evaluation` loads
- Score breakdown and case detail load
- Unsupported API methods return `405`
- No native 404
- No unexpected 500

## Known Limitations

- The default safety approval path uses deterministic synthetic fixtures.
- Optional OpenAI-backed evaluation remains setup-dependent and supplementary.
- The module does not automatically promote models or prompts.
- The module is Preview-only and remains disabled by default in source.

## Production Confirmation

Production was not deployed, promoted, queried, modified, or configured for AI Evaluation. Production feature flags remain unchanged.
