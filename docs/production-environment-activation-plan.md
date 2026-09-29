# SME MoneyBook Production Environment Activation Plan

Plan date: 2026-09-28; Preview remediation updated 2026-09-29

Source branch: `phase-3-staging`

Audited application source commit: `3a1d628029301f937c8783facb71d935dadbb841`

Status: core database mappings, canonical URL, and fail-closed rollout controls applied under authorization. Preview migrations, local release testing, fresh Preview deployment, and exact-deployment Staff QA are complete. Provider verification, Production deployment, and activation remain blocked.

## Conventions

- `<PRODUCTION_SECRET_REQUIRED>` means an authorized operator must supply and independently verify the Production secret in Vercel. It is not a literal value.
- `<MANUAL_VERIFICATION_REQUIRED>` means the value is non-secret but cannot be safely inferred from the repository.
- Public flags are embedded at build time. Configure them before creating the approved Production deployment.
- Server flags should be configured before the same immutable deployment.
- Production and Preview provider credentials must be isolated.
- The controlled Vercel remediation recorded below was authorized and completed. Preview migration/deployment/QA occurred only on `phase-3-staging`; no Production database write, DNS change, provider mutation, Production deployment, or Production feature activation was performed.

## Core

| Variable | Recommended Production value | Current status | Activation note |
|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://smemoneybook.com` | VERIFIED readable Config | Exact canonical HTTPS origin confirmed |
| `NEXT_PUBLIC_SITE_URL` | `https://smemoneybook.com` | Missing, optional | Canonical metadata URL; source otherwise falls back safely |
| `ADMIN_EMAILS` | `<PRODUCTION_SECRET_REQUIRED>` | Present, unverified | Verify authorized Production admin allowlist |
| `CRON_SECRET` | `<PRODUCTION_SECRET_REQUIRED>` | Present, unverified | Use a Production-only random value of at least 16 characters |
| `NEXT_PUBLIC_PHASE1_ONBOARDING_ENABLED` | `true` | Missing | Explicitly preserve the current default-enabled behavior |
| `NEXT_PUBLIC_PHASE1_POS_ENABLED` | `true` | Missing | Explicitly preserve the current default-enabled behavior |
| `NEXT_PUBLIC_PHASE1_RETURNS_ENABLED` | `true` | Missing | Explicitly preserve the current default-enabled behavior |
| `NEXT_PUBLIC_PHASE1_HELP_ENABLED` | `true` | Missing | Explicitly preserve the current default-enabled behavior |
| `NEXT_PUBLIC_PHASE1_OFFLINE_QUEUE_ENABLED` | `true` | Missing | Explicitly preserve the current default-enabled behavior |
| `NEXT_PUBLIC_POSTHOG_KEY` | `<MANUAL_VERIFICATION_REQUIRED>` or unset | Missing, optional | Keep unset while analytics is intentionally disabled; otherwise use a Production-only project |
| `NEXT_PUBLIC_POSTHOG_HOST` | `<MANUAL_VERIFICATION_REQUIRED>` or unset | Missing, optional | Must be an approved HTTPS regional host when analytics is enabled |

`NODE_ENV`, `VERCEL_ENV`, `VERCEL_URL`, and Git deployment metadata remain Vercel-managed and must not be manually overridden.

## Database

| Variable | Recommended Production value | Current status | Activation note |
|---|---|---|---|
| `DATABASE_URL` | `<PRODUCTION_SECRET_REQUIRED>` | VERIFIED Secret | Neon `production` pooled endpoint `ep-dawn-sky-amvgvfjj` |
| `DIRECT_URL` | `<PRODUCTION_SECRET_REQUIRED>` | VERIFIED Secret | Neon `production` direct endpoint `ep-dawn-sky-amvgvfjj` |

The authorized replacement used Neon-generated URLs without printing them. Sanitized verification confirms Production pooled/direct mappings use `ep-dawn-sky-amvgvfjj`; Preview branch-scoped pooled/direct mappings use `ep-curly-poetry-am5ua3ev`. Both use database `neondb`, role `neondb_owner`, and required SSL. Production was previously verified schema-current at 41/41. Preview remediation applied the seven reviewed completion migrations and is now schema-current at 41/41 with zero pending.

## Phase 2

All ten values are configured in Production with the following fail-closed values:

| Variable | Initial value | Later activation |
|---|---:|---|
| `NEXT_PUBLIC_PHASE2_LOCATIONS_ENABLED` | `false` | Only after migration and location isolation QA |
| `NEXT_PUBLIC_PHASE2_TRANSFERS_ENABLED` | `false` | Only after full transfer lifecycle QA |
| `NEXT_PUBLIC_PHASE2_REPORTING_CENTRE_ENABLED` | `false` | Only after report/export QA |
| `NEXT_PUBLIC_PHASE2_PDF_EXPORTS_ENABLED` | `false` | Keep false until the dormant source gate is wired/tested |
| `NEXT_PUBLIC_PHASE2_TAX_ENABLED` | `false` | Only after tax setup QA |
| `NEXT_PUBLIC_PHASE2_INVOICE_BRANDING_ENABLED` | `false` | Only after document snapshot/render QA |
| `NEXT_PUBLIC_PHASE2_I18N_ENABLED` | `false` | Only after locale QA |
| `NEXT_PUBLIC_PHASE2_GRANULAR_PERMISSIONS_ENABLED` | `false` | Only after role/permission regression QA |
| `NEXT_PUBLIC_PHASE2_ANNOUNCEMENTS_ENABLED` | `false` | Only after admin allowlist and announcement QA |
| `NEXT_PUBLIC_PHASE2_BUSINESS_SWITCHER_ENABLED` | `false` | Keep false until the dormant source gate is wired/tested |

There are no private `PHASE2_*` module flags in current source.

## Phase 3

All values in this section are configured in Production. The current posture is fail-closed:

| Variable | Initial value | Feature/control |
|---|---:|---|
| `PHASE3_AI_ENABLED` | `false` | Provider-backed AI master gate |
| `PHASE3_AI_GLOBAL_KILL_SWITCH` | `true` | Emergency global disable |
| `PHASE3_AI_MONTHLY_COST_BUDGET_KOBO` | `0` | AI budget while disabled |
| `PHASE3_AI_DAILY_REQUEST_LIMIT_PER_BUSINESS` | `0` | AI request limit while disabled |
| `NEXT_PUBLIC_PHASE3_AI_ADVISOR_ENABLED` | `false` | AI Advisor |
| `NEXT_PUBLIC_PHASE3_HEALTH_SCORE_ENABLED` | `false` | Health Score |
| `NEXT_PUBLIC_PHASE3_EXECUTIVE_DASHBOARD_ENABLED` | `false` | Executive Dashboard UI |
| `PHASE3_EXECUTIVE_DASHBOARD_ENABLED` | `false` | Executive Dashboard server gate |
| `NEXT_PUBLIC_PHASE3_CASHFLOW_FORECASTS_ENABLED` | `false` | Cashflow Forecasts |
| `NEXT_PUBLIC_PHASE3_INVENTORY_FORECASTING_ENABLED` | `false` | Inventory Forecasting |
| `NEXT_PUBLIC_PHASE3_PREDICTIVE_ALERTS_ENABLED` | `false` | Predictive Alerts UI |
| `PHASE3_PREDICTIVE_ALERTS_ENABLED` | `false` | Predictive Alerts server gate |
| `PHASE3_PREDICTIVE_ALERTS_AI_EXPLANATION_ENABLED` | `false` | Optional AI explanations |
| `NEXT_PUBLIC_PHASE3_BANK_RECONCILIATION_ENABLED` | `false` | Bank Reconciliation UI |
| `PHASE3_BANK_RECONCILIATION_ENABLED` | `false` | Bank Reconciliation server gate |
| `NEXT_PUBLIC_PHASE3_TAX_ASSISTANT_ENABLED` | `false` | Tax Assistant UI |
| `PHASE3_TAX_ASSISTANT_ENABLED` | `false` | Tax Assistant server gate |
| `NEXT_PUBLIC_PHASE3_LOAN_READINESS_ENABLED` | `false` | Loan Readiness UI |
| `PHASE3_LOAN_READINESS_ENABLED` | `false` | Loan Readiness server gate |
| `NEXT_PUBLIC_PHASE3_COOPERATIVES_ENABLED` | `false` | Cooperatives UI |
| `PHASE3_COOPERATIVES_ENABLED` | `false` | Cooperatives server gate |
| `NEXT_PUBLIC_PHASE3_PAYROLL_ENABLED` | `false` | Payroll UI |
| `PHASE3_PAYROLL_ENABLED` | `false` | Payroll server gate |
| `NEXT_PUBLIC_PHASE3_STAFF_PERFORMANCE_ENABLED` | `false` | Staff Performance UI |
| `PHASE3_STAFF_PERFORMANCE_ENABLED` | `false` | Staff Performance server gate |
| `NEXT_PUBLIC_PHASE3_WHATSAPP_AUTOMATION_ENABLED` | `false` | WhatsApp Automation |
| `NEXT_PUBLIC_PHASE3_AI_MARKETING_ENABLED` | `false` | AI Marketing UI |
| `PHASE3_AI_MARKETING_ENABLED` | `false` | AI Marketing server gate |
| `PHASE3_AI_MARKETING_SENDING_ENABLED` | `false` | External campaign sending |
| `NEXT_PUBLIC_PHASE3_AI_EVALUATION_ENABLED` | `false` | AI Evaluation UI |
| `PHASE3_AI_EVALUATION_ENABLED` | `false` | AI Evaluation server gate |
| `NEXT_PUBLIC_PHASE3_ADMIN_AI_OPS_ENABLED` | `false` | Admin AI operations |

Do not turn the global kill switch off until at least one module has its independent migration, provider, authorization, isolation, observability, and rollback gates approved.

## Paystack

| Variable | Recommended Production value | Current status | Activation note |
|---|---|---|---|
| `PAYSTACK_PUBLIC_KEY` | `<PRODUCTION_SECRET_REQUIRED>` | Runtime live-compatible | Source-backed Production status confirms matching live-mode format; merchant ownership still requires provider verification |
| `PAYSTACK_SECRET_KEY` | `<PRODUCTION_SECRET_REQUIRED>` | Runtime live-compatible | No charge was performed; webhook registration remains unverified |

Do not add `PAYSTACK_WEBHOOK_SECRET`: current source does not consume it. Webhook HMAC uses `PAYSTACK_SECRET_KEY`. Register `https://smemoneybook.com/api/paystack/webhook` manually only in the authorized provider-release task.

## WhatsApp

| Variable | Recommended Production value | Current status | Activation note |
|---|---|---|---|
| `WHATSAPP_ACCESS_TOKEN` | `<PRODUCTION_SECRET_REQUIRED>` | Present, `WRONG_SCOPE` | Replace shared scope with a Production-only Meta credential |
| `WHATSAPP_PHONE_NUMBER_ID` | `<PRODUCTION_SECRET_REQUIRED>` | Present, `WRONG_SCOPE` | Verify Production sending number and isolate scope |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | `<PRODUCTION_SECRET_REQUIRED>` | Present, `WRONG_SCOPE` | Verify Production account and isolate scope |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | `<PRODUCTION_SECRET_REQUIRED>` | Present, `WRONG_SCOPE` | Use a separate Production token of at least 16 characters |
| `WHATSAPP_APP_SECRET` | `<PRODUCTION_SECRET_REQUIRED>` | Missing | Mandatory for Production `x-hub-signature-256` verification |
| `WHATSAPP_LOW_STOCK_TEMPLATE_NAME` | `<MANUAL_VERIFICATION_REQUIRED>` | Missing, optional while disabled | Approved Production Meta template name |
| `WHATSAPP_LOW_STOCK_TEMPLATE_LANGUAGE` | `en` | Missing, optional | Change only to the approved template language |

Keep `NEXT_PUBLIC_PHASE3_WHATSAPP_AUTOMATION_ENABLED=false` until Meta app, webhook, templates, consent, suppression, and monitoring QA pass.

## Resend

| Variable | Recommended Production value | Current status | Activation note |
|---|---|---|---|
| `RESEND_API_KEY` | `<PRODUCTION_SECRET_REQUIRED>` | Present, `WRONG_SCOPE` | Replace shared scope with a Production-only credential |
| `EMAIL_FROM` | `SME MoneyBook <admin@smemoneybook.com>` | Present, `WRONG_SCOPE` and unverified | Use only after the exact domain/sender is verified in Resend |

Prefer leaving legacy `ADMIN_EMAIL` and `Admin_Email` unset. Verify password-reset and staff-invitation delivery, expiry, replay protection, and Production-only links.

## OpenAI

| Variable | Recommended Production value | Current status | Activation note |
|---|---|---|---|
| `OPENAI_API_KEY` | `<PRODUCTION_SECRET_REQUIRED>` | Present, unverified | Verify dedicated Production project, privacy/retention, access, and spend controls |
| `OPENAI_MODEL` | `<MANUAL_VERIFICATION_REQUIRED>` | Present, unverified | Record an explicitly approved supported model; do not infer one |

Keep `PHASE3_AI_ENABLED=false`, the global kill switch true, all AI module flags false, and budget/limit values zero until governance approval supplies non-zero controls.

## Payroll

| Variable | Recommended Production value | Current status | Activation note |
|---|---|---|---|
| `PHASE3_PAYROLL_STATUTORY_RULES_JSON` | `<PRODUCTION_SECRET_REQUIRED>` | Missing; no approved payload exists | Do not configure until strict validation, authoritative source review, legal approval, and versioned tests exist |

Keep both Payroll flags false. Payroll's absence does not require enabling or blocking unrelated modules after the shared core/database gates pass.

## Activation Order

1. Completed: verify Neon endpoint identity and recovery capability.
2. Completed: run status against verified targets; Production was verified 41/41 and Preview is now 41/41.
3. Completed: configure the canonical URL and all Phase 2/3 rollout controls fail-closed.
4. Correct provider secret scope and complete manual provider verification.
5. Completed: inspect and apply the seven Preview migrations only to the verified `phase-3-staging` Neon branch.
6. Completed: local gate suite, fresh Vercel Preview build, commit match, Ready status, and exact-deployment Staff QA.
7. If all gates pass, create the final recovery checkpoint and follow the approved merge/deploy workflow.
8. Validate core behavior with all modules disabled, then activate approved waves one at a time.
9. Keep external-action and financial workflow modules disabled until their dedicated gates pass.
