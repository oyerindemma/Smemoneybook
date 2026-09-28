# SME MoneyBook Production Readiness Remediation

Audit date: 2026-09-28

Branch: `phase-3-staging`

Final classification: `DEPENDENCY GATE PASSED — INFRASTRUCTURE REMEDIATION NEXT`

No Production deployment, merge, environment mutation, database command, or database query was performed.

## Step 2 Evidence - 2026-09-28

### Dependency Security

Baseline command: `npm audit --omit=dev --json`.

Baseline result: 17 Production-tree findings: 1 critical, 4 high, 12 moderate.

| Package/group | Installed before | Severity | Affected range/advisory | Dependency path | Direct/transitive | Fix selected | Breaking risk |
|---|---:|---|---|---|---|---|---|
| `next` | `16.2.6` | Critical | Eleven advisories, including middleware/proxy bypass, Server Action denial of service/SSRF, cache confusion, endpoint disclosure, and RCE; latest affected range ended below `16.3.3` | Direct application framework | Direct | Manifest minimum `^16.3.3`; lock resolved `16.3.6` | Non-breaking minor/patch within major 16; full regression required |
| `postcss` | `8.5.14` | High | Source-map path traversal/file disclosure, affected through `8.5.22` | Direct dev declaration and Next runtime tree | Direct plus framework dependency | Manifest minimum `^8.5.23`; lock resolved `8.5.28` | Non-breaking patch |
| `nanoid` | `3.3.11` | High | Generator infinite loops/integer overflow, affected below `3.3.18` | Next -> PostCSS -> Nanoid | Transitive | `3.3.19` through refreshed tree | Non-breaking patch |
| `sharp` | `0.34.5` | High | libvips/libheif inherited vulnerabilities, affected below `0.35.4` | Next optional image dependency | Transitive, runtime image path | `0.35.5` through Next | Minor transitive update; image/build regression covered |
| `protobufjs` | `7.6.0` | High | unbounded expansion, shadowed runtime properties, parser loop; affected through `7.6.4` | PostHog -> OpenTelemetry | Transitive, conditional analytics path | Removed from current Production dependency tree by PostHog update | Non-breaking PostHog major-1 update |
| `posthog-js` and OpenTelemetry subtree | `1.374.3`; OpenTelemetry `2.2.0`/`0.208.0` | Moderate | PostHog dependency effects plus OpenTelemetry baggage memory allocation below `2.8.0` | Direct analytics SDK and transitive telemetry | Direct/transitive, reachable only when analytics key is set | `posthog-js` `1.434.16`; vulnerable telemetry tree removed | Non-breaking within major 1 |
| `dompurify` | `3.4.5` | Moderate | Multiple sanitization bypass advisories through `3.4.12` | PostHog | Transitive, conditional analytics/browser features | `3.4.16` | Non-breaking patch |
| `fflate` | `0.4.8` | Moderate | malformed ZIP64 infinite loop, affected `0.4.5` through `0.4.8` | PostHog | Transitive, conditional analytics path | `0.4.9` | Non-breaking patch |
| `baseline-browser-mapping` | `2.10.24` | Moderate | process termination on invalid input, affected below `2.11.0` | Next build tree | Transitive build-time | `2.11.26` | Non-breaking minor |

`eslint-config-next` moved from `^16.2.6` to `^16.3.3` to keep framework lint rules aligned. React and React DOM were unchanged because Next `16.3.3+` supports the existing React 19 range.

After remediation, `npm audit --omit=dev --json` reports zero critical, high, moderate, low, or total Production-tree findings. No `npm audit fix --force`, major upgrade, suppression, or audit exception was used.

Validation results:

- `npm install`: passed; Prisma client regenerated.
- `npm run lint`: passed with zero errors and three existing/newly surfaced Next navigation warnings.
- `npm run typecheck`: passed.
- `npm run test`: passed, 95 files and 376 tests.
- `npm run build`: passed with Next `16.3.6`; 148 static pages generated.
- `npx prisma validate`: passed locally; no Production database command was run.
- Playwright safe mocked regression: passed, 51 tests across Chromium, Mobile Chrome, and Mobile Safari with Phase 2 and approved Phase 3 flags enabled.
- The initial broad Playwright run exposed stale landing-page locators in smoke/mobile setup. The smoke assertion and auth navigation were updated to the current landing/auth routes. The write-capable mobile suite was not rerun because local database URLs could not be positively identified as non-Production from safe metadata; this remains a controlled QA follow-up.

### Vercel Authentication

`vercel whoami` passed as `oyerindemma`. The linked project is `emmanuel-oyerindes-projects/smemoneybook`.

- `https://smemoneybook.com` is assigned to deployment `dpl_AAQBGWwQYUiBF8KykLsKncond3Zk`.
- Target: Production.
- Status: Ready.
- Production Git branch: `main`.
- Production commit: `77324e2487dca1c373ce7961a4c0ee53a6c87642`.
- No deployment, promotion, alias change, or environment mutation was performed.

### Production Environment

Current Vercel Production names present:

- Core: `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_APP_URL`, `ADMIN_EMAILS`, `CRON_SECRET`.
- Paystack: `PAYSTACK_PUBLIC_KEY`, `PAYSTACK_SECRET_KEY`.
- Resend: `RESEND_API_KEY`, `EMAIL_FROM`.
- WhatsApp: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_BUSINESS_ACCOUNT_ID`.
- OpenAI: `OPENAI_API_KEY`, `OPENAI_MODEL`.
- Legacy/unused by current source: `SUPPORT_EMAIL`, `BILLING_EMAIL`, and five `PAYSTACK_PLAN_*` variables.

Wrong or over-broad scope requiring review:

- Resend variables are shared across Preview and Production rather than environment-separated.
- WhatsApp variables are shared across Preview and Production rather than environment-separated.
- Legacy/unused support, billing, and Paystack-plan variables are shared across Preview and Production.

Missing from Production:

- `WHATSAPP_APP_SECRET`.
- Every Phase 2 rollout flag.
- Every Phase 3 public/private module flag and operational control.
- `PHASE3_PAYROLL_STATUTORY_RULES_JSON`.
- Optional analytics/canonical variables `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, and `NEXT_PUBLIC_SITE_URL` are absent; their absence is non-blocking while analytics is intentionally disabled. The encrypted `NEXT_PUBLIC_APP_URL` value still requires manual verification.

Encrypted Vercel metadata proves presence and scope, not correctness of secret values.

### Database

Production contains encrypted `DATABASE_URL` and `DIRECT_URL` names. This does not prove that they target the Neon `production` branch or that application/direct pooling roles are correct. Preview branch `phase-3-staging` separately contains both names. No value was copied, printed, compared, queried, or changed. Production migration status and restore capability remain blocked pending Neon-side manual verification.

### Paystack

Production has encrypted public and secret key variables. Mode is `UNKNOWN`: encrypted metadata cannot prove `pk_live_`/`sk_live_` prefixes or account ownership. `PAYSTACK_WEBHOOK_SECRET` is not expected by source; webhook HMAC uses `PAYSTACK_SECRET_KEY`. Live webhook registration and callback behavior remain manual-verification gates. No charge or provider mutation occurred.

### Payroll

Production has no `PHASE3_PAYROLL_STATUTORY_RULES_JSON`. Preview has an encrypted branch-scoped value, but it must not be copied blindly and the exact authoritative payload is not reproducible from source. Payroll remains `BLOCKED` pending strict validation, authoritative Nigerian source review, secure versioning, and Production-specific approval.

### Phase 2 Feature Flags

Vercel does not disclose encrypted flag values through the listing command. Preview existence is scoped to both `phase-2-staging` and `phase-3-staging`; Production existence is definitive from names.

| Flag | Source expects | Preview exists | Production exists/value | Action required |
|---|---|---|---|---|
| `NEXT_PUBLIC_PHASE2_LOCATIONS_ENABLED` | Boolean, default false | Yes | No / absent | Add explicit false before deployment; enable only after migration/QA |
| `NEXT_PUBLIC_PHASE2_TRANSFERS_ENABLED` | Boolean, default false | Yes | No / absent | Add explicit false; staged activation only |
| `NEXT_PUBLIC_PHASE2_REPORTING_CENTRE_ENABLED` | Boolean, default false | Yes | No / absent | Add explicit false; staged activation only |
| `NEXT_PUBLIC_PHASE2_PDF_EXPORTS_ENABLED` | Boolean, default false; currently dormant | Yes | No / absent | Keep false until source gate is wired/tested |
| `NEXT_PUBLIC_PHASE2_TAX_ENABLED` | Boolean, default false | Yes | No / absent | Add explicit false; staged activation only |
| `NEXT_PUBLIC_PHASE2_INVOICE_BRANDING_ENABLED` | Boolean, default false | Yes | No / absent | Add explicit false; staged activation only |
| `NEXT_PUBLIC_PHASE2_I18N_ENABLED` | Boolean, default false | Yes | No / absent | Add explicit false; staged activation only |
| `NEXT_PUBLIC_PHASE2_GRANULAR_PERMISSIONS_ENABLED` | Boolean, default false | Yes | No / absent | Add explicit false; permission regression before activation |
| `NEXT_PUBLIC_PHASE2_ANNOUNCEMENTS_ENABLED` | Boolean, default false | Yes | No / absent | Add explicit false; admin allowlist QA before activation |
| `NEXT_PUBLIC_PHASE2_BUSINESS_SWITCHER_ENABLED` | Boolean, default false; currently dormant | Yes | No / absent | Keep false until source gate is wired/tested |

### Phase 3 Feature Flags

| Flag/control | Source expects | Preview `phase-3-staging` exists | Production exists/value | Action required |
|---|---|---|---|---|
| `PHASE3_AI_ENABLED` | Boolean, default false | Yes | No / absent | Add false initially; provider approval before true |
| `PHASE3_AI_GLOBAL_KILL_SWITCH` | Boolean emergency control | No | No / absent | Add true for initial deployment |
| `PHASE3_AI_MONTHLY_COST_BUDGET_KOBO` | Positive integer | No | No / absent | Define approved budget before AI activation |
| `PHASE3_AI_DAILY_REQUEST_LIMIT_PER_BUSINESS` | Positive integer | No | No / absent | Define approved limit before AI activation |
| Staff Performance public/private pair | Both booleans | Yes | No / absent | Add false; read-only first after migration/QA |
| Bank Reconciliation public/private pair | Both booleans | Yes | No / absent | Add false; workflow QA before activation |
| Tax Assistant public/private pair | Both plus master AI flag | Yes | No / absent | Add false; read-only/governance gate |
| Executive Dashboard public/private pair | Both booleans | Yes | No / absent | Add false; candidate first read-only activation |
| Predictive Alerts public/private pair | Both booleans | Yes | No / absent | Add false; deterministic first |
| `PHASE3_PREDICTIVE_ALERTS_AI_EXPLANATION_ENABLED` | Optional boolean | Yes | No / absent | Keep false initially |
| AI Evaluation public/private pair | Both booleans | Yes | No / absent | Keep false; internal-only |
| AI Marketing public/private pair | Both booleans | Yes | No / absent | Add false; provider/consent QA |
| `PHASE3_AI_MARKETING_SENDING_ENABLED` | Separate send boolean | Yes | No / absent | Keep false |
| Payroll public/private pair | Both booleans | Yes | No / absent | Keep false; Payroll blocked |
| `PHASE3_PAYROLL_STATUTORY_RULES_JSON` | Verified JSON rules | Yes | No / absent | Do not copy; create reviewed Production ruleset |
| Cooperatives public/private pair | Both booleans | Yes | No / absent | Add false; financial workflow QA |
| Loan Readiness public/private pair | Both booleans | No | No / absent | Keep absent/false; excluded scope |
| `NEXT_PUBLIC_PHASE3_AI_ADVISOR_ENABLED` | Boolean | No | No / absent | Keep false unless separately approved |
| `NEXT_PUBLIC_PHASE3_HEALTH_SCORE_ENABLED` | Boolean | No | No / absent | Keep false unless separately approved |
| `NEXT_PUBLIC_PHASE3_CASHFLOW_FORECASTS_ENABLED` | Boolean | No | No / absent | Keep false unless separately approved |
| `NEXT_PUBLIC_PHASE3_INVENTORY_FORECASTING_ENABLED` | Boolean | No | No / absent | Keep false unless separately approved |
| `NEXT_PUBLIC_PHASE3_WHATSAPP_AUTOMATION_ENABLED` | Boolean | No | No / absent | Keep false; provider/webhook gate |
| `NEXT_PUBLIC_PHASE3_ADMIN_AI_OPS_ENABLED` | Boolean | No | No / absent | Keep false; internal-only |

### Provider Configuration

| Provider | Production presence | Scope/quality | Status |
|---|---|---|---|
| Paystack | Public and secret key names present | Production-only, mode/account/webhook unverified | `MANUAL VERIFICATION REQUIRED` |
| WhatsApp Cloud API | Token, phone ID, business ID, verify token present | Shared Preview/Production; app secret missing | `FAIL` |
| Resend | API key and sender present | Shared Preview/Production; sender-domain/delivery unverified | `MANUAL VERIFICATION REQUIRED` |
| OpenAI | API key and model present | Production-only; project/model/privacy/budget unverified | `MANUAL VERIFICATION REQUIRED` |

### Release Gate Matrix

| Gate | Status | Evidence | Required action |
|---|---|---|---|
| Branch and documentation baseline | PASS | `phase-3-staging`; `cb9efc2` contained only two readiness documents and was pushed to the same branch | Preserve branch isolation |
| Dependency Production audit | PASS | Before 17 findings; after zero findings | Preserve lockfile and rerun in CI |
| Next.js critical remediation | PASS | Installed `16.2.6` -> `16.3.6`; minimum safe floor `16.3.3` | Keep patched floor; monitor advisories |
| Lint/typecheck/unit/build/Prisma validation | PASS | All commands passed; 376 tests; 148 pages | Address three lint warnings opportunistically |
| Playwright mocked regression | PASS | 51 tests passed across three projects | Run write-capable mobile flow only on verified non-Production DB |
| Full write-capable Playwright regression | MANUAL VERIFICATION REQUIRED | Local DB branch could not be safely identified | Run on verified disposable/Preview database after dependency Preview deployment |
| Vercel authentication/project/domain | PASS | Authenticated account; linked project; Ready Production domain | Maintain read-only access for remaining audit |
| Production branch/deployment identity | PASS | Domain deployment metadata reports branch `main`, commit `77324e2` | Preserve rollback deployment ID |
| Production environment manifest completeness | FAIL | All Phase 2/3 flags and several controls missing | Configure explicitly in a later authorized task |
| Production database target | BLOCKED | Names present, encrypted targets not verifiable | Neon-side branch/pooling attestation |
| Production migration status/restore | BLOCKED | No Production Prisma command; restore capability unverified | Verify backup/PITR, then separately authorize status check |
| Paystack live billing | MANUAL VERIFICATION REQUIRED | Key names present; mode unknown | Verify live account, prefixes, webhook, callback |
| WhatsApp webhook security | FAIL | `WHATSAPP_APP_SECRET` missing | Add verified Production app secret in authorized configuration task |
| Resend delivery | MANUAL VERIFICATION REQUIRED | Names present but shared scope/value unverified | Verify sender domain and isolate credentials |
| OpenAI governance | MANUAL VERIFICATION REQUIRED | Names present; budgets/limits/flags missing | Verify project/model/privacy and add controls |
| Payroll statutory readiness | BLOCKED | Production rules absent; no reproducible authoritative payload | Legal/statutory review and strict schema remediation |
| Production release | BLOCKED | Infrastructure and application configuration gates remain open | Do not deploy or merge |

## Release Blockers

1. `DATABASE_URL` and `DIRECT_URL` exist, but encrypted Vercel metadata cannot prove that they target pooled/direct endpoints on the Neon `production` branch.
2. Production migration status, backup/PITR, and restore readiness remain unverified because no Production database command was authorized or run.
3. Production Phase 2 and Phase 3 flags and operational controls are absent; no Production variables were changed during this audit.
4. No reproducible, verified Production `PHASE3_PAYROLL_STATUTORY_RULES_JSON` exists.
5. Live Paystack credentials, webhook registration, and callback behavior have not been verified.
6. `WHATSAPP_APP_SECRET` is absent, while other WhatsApp and Resend credentials have over-broad Preview/Production scope.
7. OpenAI provider governance, budgets, and per-business request limits remain unverified or absent.

## Phase 2 Gate Matrix

There are no private Phase 2 server flags. Server APIs import the public flag module, then apply independent permissions, entitlements, and business isolation.

| Feature | Flag | Server gate | Permission | Billing entitlement | Database dependency | Production disposition |
|---|---|---|---|---|---|---|
| Locations/warehouses | `NEXT_PUBLIC_PHASE2_LOCATIONS_ENABLED` | Yes | `locations:view/create/edit/archive` | `multi_location` | `BusinessLocation`, memberships, inventory balances | Enable only after migrations and smoke QA |
| Transfers | `NEXT_PUBLIC_PHASE2_TRANSFERS_ENABLED` | Yes | `transfers:view/create/approve/receive/cancel` | `warehouse_transfers` | Transfer, item, movement, balance tables | Enable only after lifecycle QA |
| Reporting centre | `NEXT_PUBLIC_PHASE2_REPORTING_CENTRE_ENABLED` | Yes | `reports:write` / `canSaveReports` | `advanced_reports` | Report snapshots/export jobs and accounting data | Enable after export/report QA |
| PDF exports | `NEXT_PUBLIC_PHASE2_PDF_EXPORTS_ENABLED` | No executable consumer | Export permissions | `professional_pdf_exports` | Export records | Keep false; source wiring gap |
| Tax management | `NEXT_PUBLIC_PHASE2_TAX_ENABLED` | Yes | Owner/admin and tax management access | `tax_management` | Tax config/rates/runs | Enable after tax setup QA |
| Invoice branding | `NEXT_PUBLIC_PHASE2_INVOICE_BRANDING_ENABLED` | Yes | Business access | `invoice_branding` | Branding config and issued-document snapshots | Enable after document QA |
| Localization | `NEXT_PUBLIC_PHASE2_I18N_ENABLED` | Yes | Authenticated business access | No separate API entitlement | Language preference data | Enable after locale QA |
| Granular permissions | `NEXT_PUBLIC_PHASE2_GRANULAR_PERMISSIONS_ENABLED` | Yes | Admin | `granular_permissions` | Permission policies | Enable after role regression QA |
| Announcements | `NEXT_PUBLIC_PHASE2_ANNOUNCEMENTS_ENABLED` | Yes | Admin publish; authenticated read | No separate entitlement | Announcements/read state | Enable after sender allowlist QA |
| Business switcher | `NEXT_PUBLIC_PHASE2_BUSINESS_SWITCHER_ENABLED` | No executable consumer | Membership isolation exists independently | `business_switching` | Business memberships | Keep false; source wiring gap |

## Phase 3 Activation Classification

Classifications are cumulative. Preview success does not remove Production data, provider, migration, or manual-verification requirements.

| Module | Classification | Reason and first Production posture |
|---|---|---|
| Staff Performance | B, D, E | Read-only analytics/export, but needs migrations, Production data-isolation QA, paired flags, and permission verification |
| Bank Reconciliation | D, E | Imports and match-state writes; does not create accounting transactions automatically, but requires migrations and controlled workflow QA |
| Tax Assistant | B, D, E | Estimates and working papers should launch read-only first; deterministic path exists, but source/rule governance and Production migration/data QA are required |
| Executive Dashboard | A, B, D | Read-only aggregation/export is the safest first wave after migrations and metric reconciliation |
| Predictive Alerts | B, D, E | Deterministic alerts first; keep AI explanations off until provider and cost controls are verified |
| AI Evaluation | C, D, E | Internal-only, requires OpenAI configuration for provider runs, admin allowlist, migrations, and security review |
| AI Marketing drafting | B, C, D, E | Draft-only activation may follow provider, consent, cost, and migration verification |
| AI Marketing sending | C, E, F | Action-capable external messaging; keep `PHASE3_AI_MARKETING_SENDING_ENABLED=false` until provider, templates, consent, suppression, monitoring, and incident controls pass |
| Loan Readiness | B, D, E, F | Advisory-only source exists, but it was excluded from the approved release scope; keep both flags false |
| Cooperatives | D, E | Financial ledger and approval workflows require migrations, data controls, reversal QA, and manual operational approval |
| Payroll | D, E, F | No verified Production statutory ruleset; financial posting workflow and statutory controls require remediation |

## Payroll Remediation

The exact declared configuration schema and runtime behavior are documented in `docs/production-environment-manifest.md`. Production activation is blocked because:

- the exact Preview secret was not committed and cannot be reproduced from evidence;
- repository documentation is not an independently approved Production ruleset;
- runtime validation does not enforce dates, rule types, threshold schemas, category coverage, or source authenticity;
- threshold values do not drive calculations;
- a single accepted metadata record unlocks all reviewed statutory inputs;
- tests use a synthetic single PAYE record and do not validate a full Production ruleset.

Required remediation: design a strict runtime schema, require complete jurisdiction/category coverage, validate effective periods, bind each input category to its matching verified rule, securely version the approved payload, obtain Nigerian payroll/legal review, and add configuration plus calculation tests. Do not invent rates.

## OpenAI Readiness

| Module/path | Provider dependency | Missing-provider behavior | Production recommendation |
|---|---|---|---|
| Tax Assistant answers | Provider status checks key/model, but current answer composition is deterministic | Returns grounded deterministic answer and marks provider/setup status; no runtime provider call in this path | Can launch deterministic/read-only only after tax governance; do not imply LLM generation |
| AI Marketing drafting | Requires `PHASE3_AI_ENABLED`, key, and model | Throws controlled setup-required domain error | Keep disabled until key/model, budget, rate limit, consent, and QA pass |
| AI Evaluation runner | Requires key and model | Run fails with setup error | Internal-only after admin/security approval |
| Predictive Alert explanations | Optional separate flag | Deterministic explanation remains available when AI explanation flag is false | Keep AI explanation false initially |

Use a dedicated Production OpenAI project/key, an explicitly approved model, spend controls, retention/privacy settings, a non-zero monthly budget, and a positive per-business request limit. Never expose the key in public variables.

## Paystack Readiness

Production requires matching `pk_live_...` and `sk_live_...` credentials. `src/lib/billing/env.ts` rejects malformed prefixes, mixed test/live modes, and test mode on a Production deployment. Current live mode cannot be verified, so Production billing is blocked.

- Checkout route: `/api/paystack/initialize`.
- Callback: `https://smemoneybook.com/payment/success?reference=...`, derived from `NEXT_PUBLIC_APP_URL`.
- Webhook: `https://smemoneybook.com/api/paystack/webhook`.
- Signature: HMAC-SHA512 of the raw request body using `PAYSTACK_SECRET_KEY`, compared with `x-paystack-signature` using timing-safe equality.
- Activation: server verification or signed `charge.success`; duplicate processing is guarded in subscription persistence.
- `PAYSTACK_WEBHOOK_SECRET` is not read by source and must not be invented as a release requirement.

Before release, manually verify the keys belong to the intended live merchant, register the exact webhook URL in Paystack, execute a controlled low-value live transaction/refund procedure, verify callback and idempotent webhook processing, and confirm plan amounts in `src/lib/billing/plans.ts` are commercially approved.

## WhatsApp And Resend Readiness

WhatsApp sending requires the access token, phone number ID, business account ID, and Production app setup. Webhook verification requires the verify token. `WHATSAPP_APP_SECRET` is mandatory in Production because its absence makes every POST signature invalid. Low-stock templates additionally need an approved template name/language. Invoice/payment/debt messaging that uses WhatsApp links can degrade to manual links, while Cloud API sending fails explicitly when provider configuration is absent.

Resend requires a valid API key and a verified `EMAIL_FROM` domain. Password reset and staff invitations use the canonical Production origin and fail closed when email is unconfigured. Production tests must verify delivery, expiry, replay prevention, and that Preview links cannot appear in Production email.

## Database And Migration Inventory

Production must use a pooled `DATABASE_URL` and direct `DIRECT_URL`, both on the Neon `production` branch. Preview must remain on `phase-3-staging`. No Production Prisma command may run until host/project/branch metadata and backup/PITR restore capability are independently verified without printing credentials.

The source diff from deployed Production commit `77324e2487dca1c373ce7961a4c0ee53a6c87642` contains 23 migrations:

| Migration | Module / affected area | Change type | Data migration | Main risk / rollback concern |
|---|---|---|---|---|
| `20260717090000_phase_1_core_foundation` | Product metadata, payments, returns, receipts, onboarding, offline sync; alters Business/inventory/movements | Additive, existing-table alters | Yes: inventory decimal backfills and default product-unit inserts | Medium locks/data reconciliation; forward fix or verified restore |
| `20260717110000_phase_2_location_foundation` | Locations, memberships, balances, transfers; nullable location FKs on operational tables | Additive | Yes: default locations/members/balances inserted and operational location IDs backfilled | High backfill/FK/index locks; verify row counts and stock totals |
| `20260717130000_phase_2_completion_modules` | Reports, tax, branding, documents, i18n, permissions, announcements | Additive plus guarded index rename | Defaults only | Verify index state; forward fix preferred |
| `20260719070000_phase_3_health_score` | Health snapshots | Additive | No | Low; disable flag |
| `20260719073000_phase_3_cashflow_forecasts` | Cashflow snapshots | Additive | No | Low; disable flag |
| `20260719080000_phase_3_inventory_forecasts` | Inventory forecast snapshots | Additive | No | Low; disable flag |
| `20260719083000_phase_3_bank_reconciliation` | Statement imports, rows, matches | Additive | No | Medium indexes/FKs; preserve audit evidence |
| `20260719090000_phase_3_loan_readiness` | Readiness snapshots/sharing logs | Additive | No | Low; excluded module remains disabled |
| `20260719093000_phase_3_tax_assistant` | Tax snapshots | Additive | No | Low; disable flag |
| `20260719100000_phase_3_cooperatives` | Cooperative member, contribution, loan, ledger foundation | Additive | No | High financial schema surface; preserve ledger evidence |
| `20260719103000_phase_3_payroll` | Employees, runs, items, journal entries | Additive | No | Payroll remains blocked; preserve snapshots |
| `20260719110000_phase_3_staff_performance` | Goals and snapshots | Additive | No | Low; disable flag |
| `20260719113000_phase_3_whatsapp_automation` | Contacts, templates, jobs | Additive | No | External-send operational risk |
| `20260719120000_phase_3_ai_marketing` | Drafts and feedback | Additive | No | Keep sending disabled |
| `20260719123000_phase_3_executive_dashboard` | Dashboard snapshots | Additive | No | Low; metric reconciliation |
| `20260719130000_phase_3_predictive_alerts_and_ai_evaluation` | Alerts, feedback, evaluation datasets/runs | Additive | No | Medium volume/index growth; cancel runs on rollback |
| `20260723143000_phase_3_bank_reconciliation_completion` | Bank profiles/actions; import/row/match additions | Additive nullable columns | No | Medium FK/index impact |
| `20260723180000_phase_3_tax_assistant_completion` | Rules, profiles, periods, reviews, conversations; transaction tax metadata | Additive existing-table alters | Yes: initial tax rule-set and rule records inserted | Medium transaction-table lock and legal-source governance |
| `20260724200000_phase_3_predictive_alerts_completion` | Rules, preferences, deliveries; alert key | Additive | Yes: existing alert keys updated and default rules inserted | Low to medium; verify uniqueness before index creation |
| `20260724213000_phase_3_ai_evaluation_completion` | Suites, cases, results, baselines; run suite link | Additive nullable link | Yes: existing evaluation runs updated | Medium data growth and unique constraints |
| `20260730100000_phase_3_ai_marketing_completion` | Campaigns, recipients, drafts, deliveries, opt-outs; customer consent fields | Additive existing-table alters | Consent defaults | Medium customer-table lock; sending remains off |
| `20260730120000_phase_3_payroll_completion` | Compensation, components, payslips, approvals; payroll snapshot/setup fields | Additive | Yes: employee numbers and run/item snapshots backfilled | Medium; uniqueness, statutory setup, and posting controls |
| `20260803100000_phase_3j_cooperatives_completion` | Ledger accounts/batches/schedules/actions/transfers; base table additions | Additive | Nullable/defaulted additions | High financial workflow surface; no destructive rollback |

Source scan found no `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, `DELETE FROM`, destructive type conversion, or unguarded destructive rename. Foreign keys, unique constraints, indexes, and `ON DELETE CASCADE` relationships still require lock/runtime review against Production size. Production migration status remains unknown.

## Dependency Audit

Command executed: `npm audit --omit=dev --json` on 2026-09-28. Result: 17 findings: 1 critical, 4 high, 12 moderate. Every reported package has a non-force fix available according to npm, but upgrades and regression tests were not performed.

| Package | Severity | Direct/transitive | Runtime/build reachability | Fix | Release decision |
|---|---|---|---|---|---|
| `next` | Critical | Direct runtime | Reachable across all application requests/build output | Available above affected `<=16.3.2` range | Production blocker |
| `postcss` | High | Direct dev declaration; runtime-tree dependency of Next | Primarily build pipeline, not expected in request path | Available | Block until Next/build-chain update is validated |
| `nanoid` | High | Transitive through Next/PostCSS | Build pipeline; no direct application import found | Available | Remediate with framework tree; non-standalone blocker |
| `sharp` | High | Transitive through Next | Potentially reachable through Next image optimization | Available | Production blocker pending image-path review/update |
| `protobufjs` | High | Transitive through PostHog/OpenTelemetry | Potentially reachable when browser analytics telemetry initializes | Available | Block analytics activation until upgraded |
| `posthog-js` | Moderate | Direct runtime | Reachable when `NEXT_PUBLIC_POSTHOG_KEY` is configured | Available | Keep analytics unset or upgrade before release |
| `@opentelemetry/core` | Moderate | Transitive through PostHog | Conditional on PostHog telemetry | Available | Same as PostHog |
| `@opentelemetry/exporter-logs-otlp-http` | Moderate | Transitive through PostHog | Conditional on PostHog telemetry | Available | Same as PostHog |
| `@opentelemetry/otlp-exporter-base` | Moderate | Transitive through PostHog | Conditional on PostHog telemetry | Available | Same as PostHog |
| `@opentelemetry/otlp-transformer` | Moderate | Transitive through PostHog | Conditional on PostHog telemetry | Available | Same as PostHog |
| `@opentelemetry/resources` | Moderate | Transitive through PostHog | Conditional on PostHog telemetry | Available | Same as PostHog |
| `@opentelemetry/sdk-logs` | Moderate | Transitive through PostHog | Conditional on PostHog telemetry | Available | Same as PostHog |
| `@opentelemetry/sdk-metrics` | Moderate | Transitive through PostHog | Conditional on PostHog telemetry | Available | Same as PostHog |
| `@opentelemetry/sdk-trace-base` | Moderate | Transitive through PostHog | Conditional on PostHog telemetry | Available | Same as PostHog |
| `dompurify` | Moderate | Transitive through PostHog | Potentially reachable in PostHog browser features | Available | Same as PostHog |
| `fflate` | Moderate | Transitive through PostHog | Potentially reachable in PostHog browser features | Available | Same as PostHog |
| `baseline-browser-mapping` | Moderate | Transitive build dependency | Build-time browser-target metadata; no direct runtime import | Available | Upgrade in validated dependency refresh |

Reachability labels are source/dependency-tree assessments, not exploitability proofs. The direct critical Next.js advisory is sufficient to stop Production release.

## Ordered Remediation

1. Preserve authenticated, read-only Vercel access and the current Production deployment ID as the rollback reference.
2. Have a Neon-authorized operator attest that Production `DATABASE_URL` is pooled and `DIRECT_URL` is direct, both target the `production` branch, and neither targets `phase-3-staging`.
3. Verify Neon backup/PITR retention and perform or document a restore drill before migration approval.
4. Reconcile `npx prisma migrate status` against the verified Production target in a separately authorized release window; inspect the exact pending set before any deploy command.
5. Preserve the remediated Next/PostCSS/Sharp/PostHog dependency tree and rerun `npm audit --omit=dev` in CI.
6. Run the write-capable Playwright suite only against a positively verified disposable or Preview database.
7. Manually verify `NEXT_PUBLIC_APP_URL=https://smemoneybook.com` and optionally configure matching `NEXT_PUBLIC_SITE_URL`; verify no generated callback or email uses localhost, Preview, or `*.vercel.app`.
8. Verify Production Resend sender/domain, email delivery, invitation/reset links, expiry, and replay controls.
9. Verify the Production Meta app, token, IDs, webhook verify token, app-secret signatures, approved templates, consent, suppression, and monitoring before enabling WhatsApp automation.
10. Verify live Paystack account ownership and matching live keys; register the exact Production webhook; execute controlled end-to-end billing and idempotency QA.
11. Add explicit Phase 1/2 flags. Keep Phase 2 false for migration deployment, then activate tested modules gradually. Keep PDF exports and business switcher false until their dormant flags are wired and tested.
12. Add Phase 3 global controls with the kill switch initially true and all feature flags false. Set approved budgets and request limits before provider AI activation.
13. Activate read-only modules first: Executive Dashboard, then Staff Performance, deterministic Predictive Alerts, and read-only Tax Assistant, each with paired flags, entitlements, permissions, business isolation, exports, and rollback checks.
14. Keep Loan Readiness excluded, AI Marketing sending false, AI Evaluation internal-only, and write-heavy Bank Reconciliation/Cooperatives disabled until dedicated Production workflow approval.
15. Remediate Payroll statutory validation and obtain an authoritative, legally reviewed, securely versioned Production ruleset. Keep Payroll flags false until then.
16. Perform a fresh Production-readiness audit. Only a complete evidence set can change the classification to `PRODUCTION CONFIGURATION READY`.
