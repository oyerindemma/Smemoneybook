# SME MoneyBook Production Readiness Remediation

Audit date: 2026-09-28

Branch: `phase-3-staging`

Final classification: `PRODUCTION CONFIGURATION INCOMPLETE`

No Production deployment, merge, environment mutation, database command, or database query was performed.

## Release Blockers

1. Current Vercel Production variables and deployment metadata could not be re-inspected because the CLI is unauthenticated.
2. `DATABASE_URL` and `DIRECT_URL` have not been proven to target pooled/direct endpoints on the Neon `production` branch.
3. Production migration status, backup/PITR, and restore readiness remain unverified.
4. Production Phase 2 and Phase 3 flags were missing in the last authenticated audit.
5. No reproducible, verified Production `PHASE3_PAYROLL_STATUTORY_RULES_JSON` exists.
6. Live Paystack credentials, webhook registration, and callback behavior have not been verified.
7. `npm audit --omit=dev` currently reports one critical direct Next.js advisory plus high and moderate runtime-tree findings.

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

1. Restore authenticated, read-only Vercel access and export only variable names, scopes, creation metadata, and safe validation booleans. Do not print values.
2. Verify the current Production deployment commit and preserve its deployment ID as rollback target.
3. Have a Neon-authorized operator attest that Production `DATABASE_URL` is pooled and `DIRECT_URL` is direct, both target the `production` branch, and neither targets `phase-3-staging`.
4. Verify Neon backup/PITR retention and perform or document a restore drill before migration approval.
5. Reconcile `npx prisma migrate status` against the verified Production target in a separately authorized release window; inspect the exact pending set before any deploy command.
6. Upgrade Next.js above the critical affected range and refresh the Next/PostCSS/Sharp dependency tree without force; upgrade PostHog and its telemetry tree; run audit again.
7. Run lint, typecheck, complete unit/integration tests, build, focused security tests, and all Phase 2/3 Playwright suites after dependency remediation.
8. Configure `NEXT_PUBLIC_APP_URL=https://smemoneybook.com` and optionally matching `NEXT_PUBLIC_SITE_URL`; verify no generated callback or email uses localhost, Preview, or `*.vercel.app`.
9. Verify Production Resend sender/domain, email delivery, invitation/reset links, expiry, and replay controls.
10. Verify the Production Meta app, token, IDs, webhook verify token, app-secret signatures, approved templates, consent, suppression, and monitoring before enabling WhatsApp automation.
11. Verify live Paystack account ownership and matching live keys; register the exact Production webhook; execute controlled end-to-end billing and idempotency QA.
12. Add explicit Phase 1/2 flags. Keep Phase 2 false for migration deployment, then activate tested modules gradually. Keep PDF exports and business switcher false until their dormant flags are wired and tested.
13. Add Phase 3 global controls with the kill switch initially true and all feature flags false. Set approved budgets and request limits before provider AI activation.
14. Activate read-only modules first: Executive Dashboard, then Staff Performance, deterministic Predictive Alerts, and read-only Tax Assistant, each with paired flags, entitlements, permissions, business isolation, exports, and rollback checks.
15. Keep Loan Readiness excluded, AI Marketing sending false, AI Evaluation internal-only, and write-heavy Bank Reconciliation/Cooperatives disabled until dedicated Production workflow approval.
16. Remediate Payroll statutory validation and obtain an authoritative, legally reviewed, securely versioned Production ruleset. Keep Payroll flags false until then.
17. Perform a fresh Production-readiness audit. Only a complete evidence set can change the classification to `PRODUCTION CONFIGURATION READY`.
