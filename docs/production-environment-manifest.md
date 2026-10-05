# SME MoneyBook Production Environment Manifest

Audit date: 2026-09-28

Source branch: `phase-3-staging`

Source commit before this documentation update: `138797152a70e7b395b5de6f5817bbda31d52d41`

Production application URL: `https://smemoneybook.com`

Final classification: `PRODUCTION CONFIGURATION INCOMPLETE`

## Safety And Evidence Boundary

This is a source-derived configuration manifest. No Production deployment, environment update, database query, Prisma command, or branch merge was performed.

The Vercel CLI was not authenticated during this audit and entered a device-login flow. Therefore current Production values and scopes could not be inspected. The earlier release record in `docs/phase-3-production-release.md` is retained as historical evidence only: it recorded core provider variables as present but redacted, and all Phase 2/3 rollout flags as missing. A variable is not classified as correctly configured merely because its name was previously present.

Source-code usage is authoritative. Variables mentioned only in old documentation or an earlier Vercel listing, including `SUPPORT_EMAIL`, `BILLING_EMAIL`, Paystack plan variables, and `PAYSTACK_WEBHOOK_SECRET`, are not application inputs in the current source and are not invented here.

## Value Conventions

- `<REQUIRED_SECRET>` means an operator must set a real Production secret through Vercel without placing it in Git.
- `false initially` means keep the capability unavailable until its migration, provider, data, security, and QA gates pass.
- Public variables are embedded into the Next.js build and require redeployment after a change.
- Server variables also require a fresh deployment for a deterministic Vercel release, even where the runtime platform can expose updated values.
- Production and Preview must use separate provider credentials and database branches.

## Core Runtime Variables

| Variable | Purpose | Requirement | Surface | Expected format | Production scope | Preview scope | Secret | Module | Missing behavior | Source | Recommended Production value |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `DATABASE_URL` | Prisma application connection | Required | Server | `postgresql://` or `postgres://`; Neon pooled endpoint; TLS | Production only, Neon `production` branch | Dedicated Preview Neon `phase-3-staging` branch | Yes | All persisted features | Prisma cannot initialize; database routes fail | `prisma/schema.prisma:7` | `<REQUIRED_SECRET>`; verified pooled Production URL |
| `DIRECT_URL` | Prisma migration/direct connection | Required | Server | `postgresql://` or `postgres://`; Neon direct endpoint; TLS | Production only, Neon `production` branch | Dedicated direct Preview URL | Yes | Prisma migrations | Prisma validation/migration operations cannot use direct connection | `prisma/schema.prisma:8` | `<REQUIRED_SECRET>`; verified direct Production URL |
| `NEXT_PUBLIC_APP_URL` | Canonical origin, Paystack callback, invitations, password reset, referral and WhatsApp links | Required | Public and server | Absolute HTTPS URL, no trailing slash preferred | Production | Branch Preview URL | No | Core/auth/billing/messaging | Some helpers fall back to localhost or request origin; Paystack configuration fails if absent | `src/lib/env.ts:6`, `src/lib/billing/env.ts:1` | `https://smemoneybook.com` |
| `NEXT_PUBLIC_SITE_URL` | Landing-page metadata canonical URL | Optional | Public/build | Absolute HTTPS URL | Production | Preview URL or unset | No | SEO | Falls back to `https://smemoneybook.com` | `src/app/page.tsx:4` | `https://smemoneybook.com` |
| `ADMIN_EMAILS` | Production admin and internal AI Evaluation allowlist | Required for admin/internal operations | Server | Comma-separated normalized email addresses | Production | Separate test admins | Sensitive | Admin, announcements, AI Evaluation | Production admin page denies non-configured users; internal operations unavailable | `src/app/admin/page.tsx:810`, `src/lib/ai-evaluation/authorization.ts:237` | `<REQUIRED_SECRET>` |
| `CRON_SECRET` | Bearer authentication for automation cron | Required if cron route is scheduled | Server | Random string, minimum 16 characters | Production | Separate Preview secret | Yes | Automation | Cron route returns controlled `500`; no automation runs | `src/lib/env.ts:23`, `src/app/api/cron/automation/route.ts:7` | `<REQUIRED_SECRET>` |
| `NODE_ENV` | Framework/runtime mode and secure-cookie/webhook behavior | Platform-required | Server/build | `production` | Platform-managed | Platform-managed | No | Core/security | Incorrect mode weakens expected production behavior | `next.config.ts:3`, `src/lib/auth/session.ts:14` | Vercel-managed `production` |
| `VERCEL_ENV` | Distinguishes Production for live Paystack enforcement | Platform-required | Server | `production`, `preview`, or `development` | Platform-managed | Platform-managed | No | Billing | Fallback uses `NODE_ENV`; wrong value can misclassify deployment | `src/lib/billing/env.ts:66` | Vercel-managed `production` |
| `VERCEL_URL` | Deployment-origin input used only by guarded Preview seeding | Platform-managed | Server/tooling | Hostname | Platform-managed | Platform-managed | No | Seed safety | No normal runtime impact | `src/lib/preview-staging-seed-guard.ts:147` | Vercel-managed |
| `VERCEL_GIT_COMMIT_REF` | Branch identity for guarded Preview entitlement seed | Preview tooling only | Server/tooling | Git branch name | Do not set manually | `phase-3-staging` | No | Seed safety | Seed script falls back to local Git branch | `scripts/seed-phase2-preview-entitlement.ts:72` | Vercel-managed |

## External Provider Variables

| Variable | Purpose | Requirement | Surface | Expected format | Production scope | Preview scope | Secret | Module | Missing behavior | Source | Recommended Production value |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `PAYSTACK_PUBLIC_KEY` | Paystack account mode and checkout configuration | Required for live billing | Server despite name | `pk_live_...` in Production | Production live account | `pk_test_...` only | Sensitive | Billing | Billing reports unavailable; checkout fails closed | `src/lib/billing/env.ts:1` | `<REQUIRED_SECRET>` with `pk_live_` prefix |
| `PAYSTACK_SECRET_KEY` | Paystack API authentication and webhook HMAC key | Required for live billing | Server | `sk_live_...` in Production | Production live account | `sk_test_...` only | Yes | Billing/webhook | Checkout, verification, and webhook handling fail | `src/lib/billing/env.ts:1`, `src/app/api/paystack/webhook/route.ts:24` | `<REQUIRED_SECRET>` with `sk_live_` prefix |
| `RESEND_API_KEY` | Resend API authentication | Required for password reset and staff invitation email delivery | Server | Resend API key | Production sender account | Separate test credential | Yes | Email/auth/staff | Email functions throw; password reset endpoint returns setup failure | `src/lib/email/resend.ts:20` | `<REQUIRED_SECRET>` |
| `EMAIL_FROM` | Verified sender identity | Required with Resend | Server | `Display Name <address@verified-domain>` | Production verified domain | Preview sender | No | Email/auth/staff | Email is considered unconfigured | `src/lib/email/resend.ts:13` | `SME MoneyBook <admin@smemoneybook.com>` after Resend verification |
| `ADMIN_EMAIL` | Legacy fallback sender alias | Optional compatibility alias | Server | Email address | Prefer unset | Prefer unset | Sensitive | Email | Used only when `EMAIL_FROM` is absent | `src/lib/email/resend.ts:13` | Unset; use `EMAIL_FROM` |
| `Admin_Email` | Legacy case-sensitive sender alias | Optional compatibility alias | Server | Email address | Prefer unset | Prefer unset | Sensitive | Email | Used only when newer aliases are absent | `src/lib/email/resend.ts:13` | Unset; use `EMAIL_FROM` |
| `WHATSAPP_ACCESS_TOKEN` | Meta Graph API bearer token | Required for WhatsApp sending | Server | Meta access token | Production Meta app | Separate Preview/test app | Yes | WhatsApp, reminders, messaging | WhatsApp client construction/send fails | `src/lib/env.ts:10`, `src/lib/whatsapp/client.ts:46` | `<REQUIRED_SECRET>` |
| `WHATSAPP_PHONE_NUMBER_ID` | Sending phone-number identifier | Required for WhatsApp sending | Server | Non-empty Meta ID | Production number | Test number | Sensitive | WhatsApp | Send fails configuration validation | `src/lib/env.ts:12` | `<REQUIRED_SECRET>` |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Meta business account identity | Required by shared WhatsApp env validator | Server | Non-empty Meta ID | Production account | Test account | Sensitive | WhatsApp | Shared WhatsApp validation fails, including client initialization | `src/lib/env.ts:14` | `<REQUIRED_SECRET>` |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Meta webhook challenge token | Required for webhook subscription | Server | Random string; shared validator requires at least 16 characters | Production webhook | Separate Preview token | Yes | WhatsApp webhook | GET verification cannot succeed | `src/lib/env.ts:13`, `src/app/api/webhooks/whatsapp/route.ts:194` | `<REQUIRED_SECRET>` |
| `WHATSAPP_APP_SECRET` | Validates `x-hub-signature-256` | Required in Production | Server | Meta app secret | Production Meta app | Separate Preview app | Yes | WhatsApp webhook | Production POST signatures all fail when absent; non-production permits unsigned webhook payloads | `src/app/api/webhooks/whatsapp/route.ts:203` | `<REQUIRED_SECRET>` |
| `WHATSAPP_LOW_STOCK_TEMPLATE_NAME` | Approved low-stock template | Optional unless alert sending is enabled | Server | Approved Meta template name | Production approved template | Preview template | No | Stock alerts | Template-based low-stock alert path is unavailable | `src/lib/whatsapp/templates.ts:99` | Approved Production template name |
| `WHATSAPP_LOW_STOCK_TEMPLATE_LANGUAGE` | Template language | Optional | Server | Meta language code | Production | Preview | No | Stock alerts | Defaults to `en` | `src/lib/whatsapp/templates.ts:107` | `en` or approved template language |
| `OPENAI_API_KEY` | OpenAI provider authentication | Required only for provider-backed AI paths | Server | OpenAI API key, not `[SENSITIVE]` | Production project/key | Separate Preview project/key | Yes | AI Marketing, AI Evaluation; Tax Assistant provider status | AI Marketing reports setup required; AI Evaluation fails run; Tax Assistant uses deterministic grounded response | `src/lib/env.ts:18`, `src/lib/ai-evaluation/runner.ts:63` | `<REQUIRED_SECRET>` after provider approval |
| `OPENAI_MODEL` | Provider model identifier | Required with OpenAI key | Server | Supported model ID | Production-approved model | Preview model | No | AI modules | Same fallback/error behavior as missing key | `src/lib/env.ts:20` | Explicit approved model; do not rely on stale documentation default |
| `NEXT_PUBLIC_POSTHOG_KEY` | Browser analytics project key | Optional | Public | PostHog project key | Production analytics project | Separate Preview project | No | Analytics | Analytics initialization is skipped | `src/lib/analytics/product-analytics.ts:15` | Production project key or unset |
| `NEXT_PUBLIC_POSTHOG_HOST` | PostHog API host | Optional | Public | Absolute HTTPS URL | Production | Preview | No | Analytics | Defaults to `https://app.posthog.com` | `src/lib/analytics/product-analytics.ts:21` | Approved regional PostHog host |

`PAYSTACK_WEBHOOK_SECRET` is deliberately absent from the manifest because current code does not read it. Paystack validates webhooks with `PAYSTACK_SECRET_KEY` using HMAC-SHA512. Adding an unused variable would not improve security.

## Phase 1 And Phase 2 Public Flags

All flags accept `1`, `true`, `yes`, or `on` as enabled values. Missing or any other value resolves to the documented default. Public values are build-time inputs.

| Variable | Purpose | Requirement | Surface | Expected format | Production scope | Preview scope | Secret | Missing behavior | Source | Recommended Production value |
|---|---|---|---|---|---|---|---|---|---|---|
| `NEXT_PUBLIC_PHASE1_ONBOARDING_ENABLED` | Onboarding | Optional explicit control | Public/server | Boolean text | Production | Preview | No | Defaults `true` | `src/lib/phase1/feature-flags.ts:4` | `true` |
| `NEXT_PUBLIC_PHASE1_POS_ENABLED` | POS | Optional explicit control | Public/server | Boolean text | Production | Preview | No | Defaults `true` | `src/lib/phase1/feature-flags.ts:5` | `true` |
| `NEXT_PUBLIC_PHASE1_RETURNS_ENABLED` | Returns | Optional explicit control | Public/server | Boolean text | Production | Preview | No | Defaults `true` | `src/lib/phase1/feature-flags.ts:6` | `true` |
| `NEXT_PUBLIC_PHASE1_HELP_ENABLED` | Help | Optional explicit control | Public | Boolean text | Production | Preview | No | Defaults `true` | `src/lib/phase1/feature-flags.ts:7` | `true` |
| `NEXT_PUBLIC_PHASE1_OFFLINE_QUEUE_ENABLED` | Offline queue | Optional explicit control | Public | Boolean text | Production | Preview | No | Defaults `true` | `src/lib/phase1/feature-flags.ts:8` | `true` |
| `NEXT_PUBLIC_PHASE2_LOCATIONS_ENABLED` | Locations/warehouses | Required for activation | Public and server API gate | Boolean text | Production | Preview | No | Defaults `false`; UI/API hidden | `src/lib/phase2/feature-flags.ts:14` | `false initially`; `true` after migration and Production QA |
| `NEXT_PUBLIC_PHASE2_TRANSFERS_ENABLED` | Warehouse transfers | Required for activation | Public and server API gate | Boolean text | Production | Preview | No | Defaults `false`; UI/API hidden | `src/lib/phase2/feature-flags.ts:15` | `false initially`; then `true` |
| `NEXT_PUBLIC_PHASE2_REPORTING_CENTRE_ENABLED` | Advanced reports and current export routes | Required for activation | Public and server API gate | Boolean text | Production | Preview | No | Defaults `false`; advanced reports hidden | `src/lib/phase2/feature-flags.ts:16` | `false initially`; then `true` |
| `NEXT_PUBLIC_PHASE2_PDF_EXPORTS_ENABLED` | Intended professional PDF export rollout | Required by release inventory; currently dormant | Public declaration only | Boolean text | Production | Preview | No | Defaults `false`; no current executable effect | `src/lib/phase2/feature-flags.ts:17` | `false` until source gate is wired and tested |
| `NEXT_PUBLIC_PHASE2_TAX_ENABLED` | Phase 2 tax settings/summary | Required for activation | Public and server API gate | Boolean text | Production | Preview | No | Defaults `false`; UI/API hidden | `src/lib/phase2/feature-flags.ts:18` | `false initially`; then `true` |
| `NEXT_PUBLIC_PHASE2_INVOICE_BRANDING_ENABLED` | Document branding | Required for activation | Public and server API gate | Boolean text | Production | Preview | No | Defaults `false`; panel/API hidden | `src/lib/phase2/feature-flags.ts:19` | `false initially`; then `true` |
| `NEXT_PUBLIC_PHASE2_I18N_ENABLED` | Language preferences | Required for activation | Public and server API gate | Boolean text | Production | Preview | No | Defaults `false`; panel/API hidden | `src/lib/phase2/feature-flags.ts:20` | `false initially`; then `true` |
| `NEXT_PUBLIC_PHASE2_GRANULAR_PERMISSIONS_ENABLED` | Permission policies | Required for activation | Public and server API gate | Boolean text | Production | Preview | No | Defaults `false`; panel/API hidden | `src/lib/phase2/feature-flags.ts:21` | `false initially`; then `true` |
| `NEXT_PUBLIC_PHASE2_ANNOUNCEMENTS_ENABLED` | Announcement centre | Required for activation | Public and server API gate | Boolean text | Production | Preview | No | Defaults `false`; panel/API hidden | `src/lib/phase2/feature-flags.ts:25` | `false initially`; then `true` |
| `NEXT_PUBLIC_PHASE2_BUSINESS_SWITCHER_ENABLED` | Intended business-switching rollout | Required by release inventory; currently dormant | Public declaration only | Boolean text | Production | Preview | No | Defaults `false`; no current executable effect | `src/lib/phase2/feature-flags.ts:26` | `false` until source gate is wired and tested |

There are no private `PHASE2_*` runtime feature flags. The same `NEXT_PUBLIC_PHASE2_*` module is imported by server routes. Authorization, permissions, entitlements, and business isolation remain separate server-side checks.

## Phase 3 Platform Controls

| Variable | Purpose | Requirement | Surface | Expected format | Production scope | Preview scope | Secret | Missing behavior | Source | Recommended Production value |
|---|---|---|---|---|---|---|---|---|---|---|
| `PHASE3_AI_ENABLED` | Master provider-backed AI enablement; also required by Tax Assistant authorization | Required for approved AI operation | Server | Boolean text | Production | Preview | No | Defaults `false`; provider AI disabled and Tax Assistant gate remains closed | `src/lib/phase3/feature-flags.ts:41`, `src/lib/tax-assistant/authorization.ts:32` | `false initially` |
| `PHASE3_AI_GLOBAL_KILL_SWITCH` | Emergency disable for Phase 3 | Required operational control | Server | Boolean text | Production | Preview | No | Defaults `false` | `src/lib/phase3/feature-flags.ts:42` | `true` during initial deployment; set `false` only for approved activation |
| `PHASE3_AI_MONTHLY_COST_BUDGET_KOBO` | AI monthly budget metadata/control | Required before provider AI activation | Server | Positive integer kobo | Production-specific | Preview-specific | No | Invalid/missing becomes `0` | `src/lib/phase3/feature-flags.ts:43` | Approved non-zero budget; `0` while AI disabled |
| `PHASE3_AI_DAILY_REQUEST_LIMIT_PER_BUSINESS` | Per-business AI request control | Required before provider AI activation | Server | Positive integer | Production-specific | Preview-specific | No | Invalid/missing becomes `0` | `src/lib/phase3/feature-flags.ts:44` | Approved positive limit; `0` while AI disabled |

## Phase 3 Feature Flags

Boolean flags accept `1`, `true`, `yes`, or `on`; missing or malformed values resolve to `false`. Every public variable is build-visible, non-secret, Production-scoped in Production, branch-scoped in Preview, and requires redeployment. Every private variable is server-only, non-secret unless explicitly marked otherwise, separately scoped per environment, and should also be deployed as part of a new immutable release.

| Variable | Purpose | Requirement | Surface | Format | Production scope | Preview scope | Secret | Feature | Missing behavior | Source | Recommended Production value |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `NEXT_PUBLIC_PHASE3_AI_ADVISOR_ENABLED` | Advisor UI/API rollout | Required for activation | Public/server gate | Boolean text | Production | Branch Preview | No | AI Advisor | Defaults false; hidden/404 | `src/lib/phase3/feature-flags.ts:22` | `false initially` |
| `NEXT_PUBLIC_PHASE3_HEALTH_SCORE_ENABLED` | Health score rollout | Required for activation | Public/server gate | Boolean text | Production | Branch Preview | No | Health Score | Defaults false; hidden/404 | `src/lib/phase3/feature-flags.ts:23` | `false initially` |
| `NEXT_PUBLIC_PHASE3_EXECUTIVE_DASHBOARD_ENABLED` | Dashboard UI rollout | Required with private flag | Public/server gate | Boolean text | Production | Branch Preview | No | Executive Dashboard | Defaults false; hidden/404 | `src/lib/phase3/feature-flags.ts:24` | `false initially` |
| `NEXT_PUBLIC_PHASE3_CASHFLOW_FORECASTS_ENABLED` | Cashflow forecast rollout | Required for activation | Public/server gate | Boolean text | Production | Branch Preview | No | Cashflow Forecasts | Defaults false; hidden/404 | `src/lib/phase3/feature-flags.ts:25` | `false initially` |
| `NEXT_PUBLIC_PHASE3_INVENTORY_FORECASTING_ENABLED` | Inventory forecast rollout | Required for activation | Public/server gate | Boolean text | Production | Branch Preview | No | Inventory Forecasting | Defaults false; hidden/404 | `src/lib/phase3/feature-flags.ts:26` | `false initially` |
| `NEXT_PUBLIC_PHASE3_PREDICTIVE_ALERTS_ENABLED` | Alerts UI rollout | Required with private flag | Public/server gate | Boolean text | Production | Branch Preview | No | Predictive Alerts | Defaults false; hidden/404 | `src/lib/phase3/feature-flags.ts:27` | `false initially` |
| `NEXT_PUBLIC_PHASE3_BANK_RECONCILIATION_ENABLED` | Reconciliation UI rollout | Required with private flag | Public/server gate | Boolean text | Production | Branch Preview | No | Bank Reconciliation | Defaults false; hidden/404 | `src/lib/phase3/feature-flags.ts:28` | `false initially` |
| `NEXT_PUBLIC_PHASE3_TAX_ASSISTANT_ENABLED` | Tax Assistant UI rollout | Required with private/master AI flags | Public/server gate | Boolean text | Production | Branch Preview | No | Tax Assistant | Defaults false; hidden/404 | `src/lib/phase3/feature-flags.ts:29` | `false initially` |
| `NEXT_PUBLIC_PHASE3_LOAN_READINESS_ENABLED` | Loan Readiness UI rollout | Required with private flag | Public/server gate | Boolean text | Production | Branch Preview | No | Loan Readiness | Defaults false; hidden/404 | `src/lib/phase3/feature-flags.ts:30` | `false` |
| `NEXT_PUBLIC_PHASE3_COOPERATIVES_ENABLED` | Cooperatives UI rollout | Required with private flag | Public/server gate | Boolean text | Production | Branch Preview | No | Cooperatives | Defaults false; hidden/404 | `src/lib/phase3/feature-flags.ts:31` | `false initially` |
| `NEXT_PUBLIC_PHASE3_PAYROLL_ENABLED` | Payroll UI rollout | Required with private flag/rules | Public/server gate | Boolean text | Production | Branch Preview | No | Payroll | Defaults false; hidden/404 | `src/lib/phase3/feature-flags.ts:32` | `false` |
| `NEXT_PUBLIC_PHASE3_STAFF_PERFORMANCE_ENABLED` | Staff analytics UI rollout | Required with private flag | Public/server gate | Boolean text | Production | Branch Preview | No | Staff Performance | Defaults false; hidden/404 | `src/lib/phase3/feature-flags.ts:33` | `false initially` |
| `NEXT_PUBLIC_PHASE3_WHATSAPP_AUTOMATION_ENABLED` | WhatsApp automation rollout | Required for activation | Public/server gate | Boolean text | Production | Branch Preview | No | WhatsApp Automation | Defaults false; hidden/404 | `src/lib/phase3/feature-flags.ts:34` | `false` until Meta QA |
| `NEXT_PUBLIC_PHASE3_AI_MARKETING_ENABLED` | Marketing UI rollout | Required with private flag | Public/server gate | Boolean text | Production | Branch Preview | No | AI Marketing | Defaults false; hidden/404 | `src/lib/phase3/feature-flags.ts:35` | `false initially` |
| `NEXT_PUBLIC_PHASE3_AI_EVALUATION_ENABLED` | Evaluation UI rollout | Required with private flag | Public/server gate | Boolean text | Production | Branch Preview | No | AI Evaluation | Defaults false; hidden/404 | `src/lib/phase3/feature-flags.ts:36` | `false`; internal-only |
| `NEXT_PUBLIC_PHASE3_ADMIN_AI_OPS_ENABLED` | Admin AI operations rollout | Required for activation | Public/server gate | Boolean text | Production | Branch Preview | No | Admin AI Operations | Defaults false; hidden/404 | `src/lib/phase3/feature-flags.ts:37` | `false` |
| `PHASE3_EXECUTIVE_DASHBOARD_ENABLED` | Private dashboard release gate | Required with public flag | Server | Boolean text | Production | Branch Preview | No | Executive Dashboard | Defaults false; authorization denies | `src/lib/executive-dashboard/authorization.ts:35` | `false initially` |
| `PHASE3_PREDICTIVE_ALERTS_ENABLED` | Private alert release gate | Required with public flag | Server | Boolean text | Production | Branch Preview | No | Predictive Alerts | Defaults false; authorization denies | `src/lib/predictive-alerts/authorization.ts:36` | `false initially` |
| `PHASE3_PREDICTIVE_ALERTS_AI_EXPLANATION_ENABLED` | Allows optional AI explanation path | Optional | Server | Boolean text | Production | Branch Preview | No | Predictive Alerts | Defaults false; deterministic explanation remains | `src/lib/predictive-alerts/explanations.ts:39` | `false` |
| `PHASE3_BANK_RECONCILIATION_ENABLED` | Private reconciliation gate | Required with public flag | Server | Boolean text | Production | Branch Preview | No | Bank Reconciliation | Defaults false; authorization denies | `src/lib/bank-reconciliation/authorization.ts:33` | `false initially` |
| `PHASE3_TAX_ASSISTANT_ENABLED` | Private Tax Assistant gate | Required with public/master AI flags | Server | Boolean text | Production | Branch Preview | No | Tax Assistant | Defaults false; authorization denies | `src/lib/tax-assistant/authorization.ts:35` | `false initially` |
| `PHASE3_LOAN_READINESS_ENABLED` | Private Loan Readiness gate | Required with public flag | Server | Boolean text | Production | Branch Preview | No | Loan Readiness | Defaults false; authorization denies | `src/lib/phase3/feature-flags.ts:74` | `false` |
| `PHASE3_COOPERATIVES_ENABLED` | Private cooperative gate | Required with public flag | Server | Boolean text | Production | Branch Preview | No | Cooperatives | Defaults false; authorization denies | `src/lib/cooperatives/authorization.ts:51` | `false initially` |
| `PHASE3_PAYROLL_ENABLED` | Private payroll gate | Required with public flag | Server | Boolean text | Production | Branch Preview | No | Payroll | Defaults false; authorization denies | `src/lib/payroll/authorization.ts:48` | `false` |
| `PHASE3_PAYROLL_STATUTORY_RULES_JSON` | Verified statutory source metadata | Required before Payroll activation | Server | JSON array described below | Production only | Separate Preview rules | Yes | Payroll | Missing/malformed becomes `setup_required`; statutory inputs suppressed | `src/lib/payroll/statutory-rules.ts:46` | Do not set until verified Production rules exist |
| `PHASE3_STAFF_PERFORMANCE_ENABLED` | Private staff analytics gate | Required with public flag | Server | Boolean text | Production | Branch Preview | No | Staff Performance | Defaults false; authorization denies | `src/lib/staff-performance/authorization.ts:32` | `false initially` |
| `PHASE3_AI_MARKETING_ENABLED` | Private marketing gate | Required with public flag | Server | Boolean text | Production | Branch Preview | No | AI Marketing | Defaults false; authorization denies | `src/lib/ai-marketing/authorization.ts:44` | `false initially` |
| `PHASE3_AI_MARKETING_SENDING_ENABLED` | External campaign delivery gate | Required for sending only | Server | Boolean text | Production | Branch Preview | No | AI Marketing Sending | Defaults false; delivery fails closed | `src/lib/ai-marketing/delivery.ts:23` | `false` |
| `PHASE3_AI_EVALUATION_ENABLED` | Private evaluation gate | Required with public flag | Server | Boolean text | Production | Branch Preview | No | AI Evaluation | Defaults false; authorization denies | `src/lib/ai-evaluation/authorization.ts:41` | `false`; internal-only |

There are no paired private module flags for AI Advisor, Health Score, Cashflow Forecasts, Inventory Forecasting, WhatsApp Automation, or Admin AI Operations. Their public flags are also consumed by server route gates. All modules additionally honor `PHASE3_AI_GLOBAL_KILL_SWITCH` through the central flag state or their authorization helper.

## Payroll Statutory Rules

`PHASE3_PAYROLL_STATUTORY_RULES_JSON` is a secret server-side JSON array with the declared shape:

```json
[
  {
    "id": "string",
    "country": "NG",
    "ruleType": "PAYE | pension | statutory_deduction | employer_contribution",
    "effectiveFrom": "date string",
    "effectiveTo": "optional date string",
    "thresholds": [],
    "officialSource": "authoritative source URL or reference",
    "verificationDate": "date string",
    "status": "verified"
  }
]
```

Declared fields are in `src/lib/payroll/statutory-rules.ts:3`. Runtime acceptance checks only country equality, exact `verified` status, and truthy `effectiveFrom`, `officialSource`, and `verificationDate`. It does not validate date formats, rule type, IDs, threshold structure, effective periods, category completeness, or source authority. One accepted rule marks the entire setup configured.

The calculator does not calculate statutory rates from `thresholds`. Configuration merely permits reviewed employee pension, employer pension, PAYE, and statutory component amounts to be retained. Missing or malformed configuration becomes an empty ruleset, status `setup_required`, suppresses statutory lines/amounts to zero, and emits warnings while non-statutory payroll continues.

Internal versions are `phase3i-statutory-rules-ng-configured-v1`, `phase3i-payroll-custom-inputs-v1`, `phase3i-payroll-calculation-v1`, and `phase3i-payroll-snapshot-v1`. Preview documentation mentions five source records verified on 2026-07-30, but the exact payload is not committed and no verified Production ruleset exists. Production Payroll activation is `BLOCKED`; no Production value is supplied.

## Tooling-Only Variables

These are not Vercel Production runtime requirements:

| Variable | Use | Production recommendation | Source |
|---|---|---|---|
| `PLAYWRIGHT_BASE_URL` | Runs browser tests against an existing deployment | Do not set as application runtime config | `playwright.config.ts:3` |
| `CI` | Test retry/server behavior | Platform-managed | `playwright.config.ts:9` |
| `CAPACITOR_SERVER_URL` | Mobile packaging target | Set only in mobile build workflow to an approved HTTPS origin | `capacitor.config.ts:3` |
| `BETA_TEST_PASSWORD` | Beta-account seed override | Never set in Production runtime; use only in controlled seed workflow | `scripts/seed-beta-accounts.ts:58` |
| `PREVIEW_STAGING_SEED_CONFIRM` | Explicit Preview seed guard | Never set in Production | `src/lib/preview-staging-seed-guard.ts:3` |
| `PHASE2_STAGING_SEED_CONFIRM` | Legacy Phase 2 Preview seed guard | Never set in Production | `src/lib/preview-staging-seed-guard.ts:4` |
| `APP_URL`, `SITE_URL` | Inputs inspected only by Preview seed safety logic | Do not add unless a seed workflow explicitly requires them | `src/lib/preview-staging-seed-guard.ts:147` |

## Production And Preview Isolation

- Production `DATABASE_URL` must use a pooled connection to the Neon `production` branch.
- Production `DIRECT_URL` must use a direct connection to the same Neon `production` branch.
- Preview URLs must remain on the dedicated Neon `phase-3-staging` branch.
- Provider secrets must be separate by environment. Preview/test Paystack keys must never be copied to Production.
- `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_SITE_URL` must be `https://smemoneybook.com` in Production. Runtime source contains safe Production fallbacks and test/local URLs; no runtime hard-coded `*.vercel.app`, `phase-2-staging`, or `phase-3-staging` origin is used as the Production callback base.

## Current Configuration Classification

### Correctly Configured For Production

None can be independently certified in this audit because current Vercel metadata access is unauthenticated and secret values are intentionally unavailable. Platform-managed `NODE_ENV`, `VERCEL_ENV`, and `VERCEL_URL` are expected to be supplied by Vercel but were not revalidated.

### Last Recorded As Present, Correctness Unverified

The 2026-08-06 release record reported these Production names present: `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_APP_URL`, `PAYSTACK_PUBLIC_KEY`, `PAYSTACK_SECRET_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, WhatsApp variables, `OPENAI_API_KEY`, `OPENAI_MODEL`, `ADMIN_EMAILS`, and `CRON_SECRET`. Values were redacted or placeholder-like and target/mode correctness was not proven.

### Last Recorded Missing

- All Phase 2 rollout flags.
- All Phase 3 public and paired server flags.
- `PHASE3_AI_ENABLED`, kill switch, budget, and rate controls.
- `PHASE3_PAYROLL_STATUTORY_RULES_JSON`.

### Documented Preview-Only Configuration

Module implementation reports document the Phase 2 flags and paired Phase 3 module flags as configured for Vercel Preview branch `phase-3-staging`, together with a Preview-only Payroll statutory secret. This is historical readiness evidence, not current cloud-state proof. None of those values may be copied blindly to Production, and the Payroll payload is intentionally unavailable and not reproducible from the repository.

### Manual Secret Values Required

`DATABASE_URL`, `DIRECT_URL`, `ADMIN_EMAILS`, `CRON_SECRET`, `PAYSTACK_PUBLIC_KEY`, `PAYSTACK_SECRET_KEY`, `RESEND_API_KEY`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, and `OPENAI_API_KEY` require operator-supplied Production values and independent provider/account verification.
