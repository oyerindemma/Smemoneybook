# SME MoneyBook Phase 3 AI And Data Governance

Status: Phase 3A baseline. No Phase 3 AI capability is released by this document.
Branch: `phase-3-staging`.
Prerequisite gate checked on 2026-07-19: Phase 2 Preview deployment is Ready, required Phase 2 Preview variables are present, and authenticated Phase 2 smoke passed against the staging business.

## Operating Principles

Phase 3 turns SME MoneyBook into an AI-assisted operating system for African SMEs, but it must remain a bookkeeping product unless a licensed, compliant integration is explicitly introduced. AI features must:

- Use only authorized business data for the active tenant.
- Cite source metrics, periods, and freshness for financial answers.
- Distinguish recorded facts, estimates, forecasts, and recommendations.
- Refuse to invent missing figures.
- Require explicit confirmation before any write or external send.
- Stay behind feature flags, plan gates, rate limits, kill switches, and observability.
- Avoid presenting SME MoneyBook as a bank, lender, accountant, tax authority, auditor, or financial adviser.

No AI insight may be released unless it can be traced to source metrics and an audit record.

## Phase 3 Release Waves

| Wave | Modules | Release condition |
| --- | --- | --- |
| 1 | Read-only AI advisor, business health score, executive dashboard | Data governance complete, source-metric citations implemented, cross-tenant tests pass, cost controls active |
| 2 | Cashflow forecasts, inventory intelligence, predictive alerts | Backtests exist, confidence ranges shown, alert feedback loop active |
| 3 | Bank reconciliation, tax assistant, loan readiness | Import/audit locks implemented, tax and loan disclaimers reviewed, no partner sharing without consent |
| 4 | Payroll, cooperative module, staff performance | Ledger integrity tests pass, sensitive-data access controls reviewed, locked-run workflows implemented |
| 5 | Smart WhatsApp automation, AI marketing assistant | Consent and opt-out tracking active, approved template status monitored, drafts require user review |

Do not release all Phase 3 modules at the same time.

## Data Readiness Audit

| Domain | Current source tables | Required quality checks | Minimum threshold for AI insight | Missing-data handling | Outlier handling |
| --- | --- | --- | --- | --- | --- |
| Sales | `Transaction`, `TransactionPayment`, `InventoryItem` | Type is sale, not reversed, positive amount, valid business and optional location | At least 5 sale records in period or show insufficient-data state | State recorded sales are incomplete; do not forecast | Flag single sale over 3x trailing median as outlier candidate |
| Expenses | `Transaction`, `Account`, `Supplier` | Type is expense, not reversed, category/account present where available | At least 3 expense records or show low confidence | Separate uncategorized expenses | Flag expense over 3x trailing median by category/account |
| Products | `InventoryItem`, `ProductCategory`, `ProductBrand` | Name, price, cost, quantity, low-stock level validity | Product exists and has at least one movement or sale for performance claims | Exclude products without movement from ranking | Flag negative or impossible margins |
| Stock | `InventoryItem`, `InventoryBalance`, `InventoryMovement`, `StockTransfer` | Current balances reconcile to movement history per location | At least 7 days of stock movement for forecasting | Show current stock only; no days-remaining claim | Flag sudden shrinkage or adjustment spikes |
| Customers | `Customer`, `Debt`, `Transaction`, `CustomerReturn` | Customer references are scoped to business, debt statuses current | At least one linked sale/debt for customer behavior insight | Say customer history is limited | Flag one customer over 40 percent of period revenue |
| Suppliers | `Supplier`, `Debt`, `Transaction`, `SupplierReturn` | Supplier bills and payments reconcile | At least one linked expense/bill | Show recorded supplier obligations only | Flag supplier price increase over 20 percent where product match exists |
| Payments | `TransactionPayment`, `Account` | Allocations sum to transaction paid amount, method present | Any payment allocation exists | Mark payment-method mix unavailable | Flag split-payment mismatch |
| Invoices | `Transaction`, `Debt`, `IssuedDocument`, `DocumentTaxSnapshot` | Invoice numbers unique, unpaid balances reconcile to debt | At least one invoice or show not enough invoice data | Do not infer invoices from ordinary sales unless marked | Flag stale unpaid invoices past due date |
| Locations | `BusinessLocation`, location-scoped records | Active location exists, selected location authorized | At least one active location | Fall back to business-wide only with clear label | Flag location totals that do not reconcile to business total |
| Staff activity | `AuditLog`, `BusinessMember`, `User` | Actor belongs to business and has role/permission | At least 10 staff-recorded actions for performance insight | Do not rank staff with too little data | Flag cash variance only as review item, not accusation |
| Returns | `CustomerReturn`, `SupplierReturn`, `Transaction` | Return items reconcile to refund/settlement records | At least one return for return insight | Show no recorded returns | Flag unusual return rate vs trailing baseline |
| Tax | `TaxConfig`, `TaxRate`, `TaxRun`, `DocumentTaxSnapshot` | Effective rate, country, and snapshot version present | Tax settings configured and records exist | Show setup-needed state; no filing advice | Flag records missing tax snapshot where tax is enabled |
| Bank imports | Future `BankImport` module | File checksum, column mapping, duplicate detection | Import confirmed and matched by user | No reconciliation insight until import exists | Flag duplicate amount/date/reference matches |

## Data Freshness Rules

| Data type | Freshness rule | Display requirement |
| --- | --- | --- |
| Dashboard facts | Generated from current database query | Show generated timestamp |
| Report snapshots | Valid for stored period and filters | Show snapshot timestamp and filter scope |
| Health score | Recalculate daily or on demand | Show formula version and generated timestamp |
| Forecasts | Recalculate when source records change or after 24 hours | Show recorded cutoff date and forecast generated timestamp |
| Bank reconciliation | Locked after user confirmation | Show import version and lock state |
| Tax rules | Versioned by country and effective date | Show rule version and effective period |
| Payroll/cooperative ledgers | Locked runs/snapshots after approval | Show locked timestamp and reversal path |

If freshness is unknown, AI must say the data freshness is unknown and avoid high-confidence recommendations.

## Confidence Scoring

Every AI insight must carry one of:

- `high`: sufficient records, recent data, reconciled source totals, no unresolved outliers.
- `medium`: enough records but partial categories, limited history, or minor outliers.
- `low`: minimum threshold barely met or records are incomplete.
- `insufficient_data`: threshold not met; answer may summarize facts but must not forecast.

Confidence inputs:

- Record count and time coverage.
- Reconciliation status.
- Missing categories, customer links, supplier links, tax settings, or location fields.
- Age of last transaction or import.
- Outlier count and unresolved anomalies.
- Whether a metric is recorded, estimated, or forecast.

## AI Audit Records

Each AI request must record, at minimum:

- Business ID and actor ID.
- Feature and tool names.
- User question after PII minimization.
- Model and prompt version.
- Source metric IDs or source table list.
- Period, location scope, and generated timestamp.
- Confidence and data-quality warnings.
- Whether a recommendation was accepted, dismissed, or marked incorrect.
- Token/cost estimate and latency.
- Any pending action ID for writes that need confirmation.

Audit records must not store raw secrets, passwords, tokens, payment-card data, full statement files, or unnecessary personal content.

## Tenant And Authorization Boundaries

- The model must never receive unrestricted database access.
- All data access must happen through server-side tools that call existing business access helpers.
- Every tool input must include the active business context resolved from the authenticated user.
- Location-scoped tools must verify location membership or owner/admin permission.
- Admin AI operations may show aggregate operational metrics, not sensitive business content, unless an explicit support workflow grants access.
- Cross-business comparisons may use anonymized, aggregate benchmarks only after a separate privacy review and consent/legal basis.

## PII And Redaction

Before model input:

- Remove passwords, tokens, API keys, session IDs, raw database URLs, and payment secrets.
- Prefer names only when needed to answer the user; otherwise use roles or labels.
- Truncate free-text notes to the minimum needed context.
- Redact phone numbers and emails unless the task explicitly needs a draft message or contact workflow.
- Do not send full bank-statement descriptions to the model until reconciliation redaction rules exist.
- Do not use customer data for model training outside applicable terms, consent, and privacy controls.

## Model Output Rules

AI output must:

- State the period, scope, and freshness.
- Label values as recorded, estimated, forecast, or recommendation.
- Mention confidence when making a prediction, alert, or score.
- Include disclaimers for tax, loan readiness, forecasts, and high-impact decisions.
- Ask clarification questions when the period, business, location, or metric is ambiguous.
- Refuse cross-tenant requests and secret requests.
- Convert writes into pending actions that require explicit user confirmation.

AI output must not:

- Invent missing figures.
- Present forecasts as guarantees.
- Accuse staff or users of fraud without sufficient evidence.
- File taxes, approve loans, send bulk messages, run payroll, purchase stock, or mutate financial records automatically.

## Security And Threat Model Baseline

| Surface | Primary risks | Required controls |
| --- | --- | --- |
| AI advisor | Prompt injection, cross-tenant leakage, fabricated figures | Tool allowlist, tenant authorization, source citations, grounding tests |
| Bank imports | Malicious files, duplicate imports, incorrect matches | File limits, parser sandboxing, checksum duplicate prevention, human approval |
| Payroll | Sensitive employee data, incorrect locked runs | Role gates, locked payroll runs, reversal workflow, audit logs |
| Cooperative module | Mixed funds, ledger drift, unauthorized loans | Separate ledgers, role approval, guarantor records, financial-integrity tests |
| WhatsApp automation | Spam, consent violations, template failures | Opt-in records, approved templates, quiet hours, opt-out handling |
| Partner sharing | Unconsented loan/tax data sharing | Consent records, sharing logs, partner review |
| Admin access | Excessive business-content exposure | Least privilege, aggregate defaults, audited support access |

## Monitoring And Kill Switches

Phase 3 must expose:

- Feature-level request volume.
- Tool failure rate.
- Latency.
- Token and cost estimate.
- Forecast accuracy and alert precision where applicable.
- Recommendation acceptance/dismissal/incorrect rate.
- Cross-tenant or authorization-denied attempts.
- WhatsApp delivery/read/failure and opt-out rates.
- Reconciliation backlog and import failures.

All Phase 3 capabilities must honor `PHASE3_AI_GLOBAL_KILL_SWITCH` and individual `NEXT_PUBLIC_PHASE3_*` flags. Cost and request controls start with:

- `PHASE3_AI_MONTHLY_COST_BUDGET_KOBO`
- `PHASE3_AI_DAILY_REQUEST_LIMIT_PER_BUSINESS`

## Rollback Plan

1. Turn on `PHASE3_AI_GLOBAL_KILL_SWITCH`.
2. Disable individual `NEXT_PUBLIC_PHASE3_*` flags for affected modules.
3. Stop scheduled recalculation jobs if introduced.
4. Preserve audit records and generated snapshots.
5. Revert the latest Phase 3 deployment only if flags cannot contain the incident.
6. Do not delete ledgers, reconciliation decisions, payroll runs, or cooperative records during rollback.

## Phase 3A Readiness Status

| Deliverable | Status |
| --- | --- |
| Data-readiness audit | Baseline complete in this document |
| Governance document | Baseline complete in this document |
| Metric definitions | See `docs/phase-3-metric-definitions.md` |
| Feature flags | Added default-off in `src/lib/phase3/feature-flags.ts` |
| Security threat model | Baseline complete in this document |
| Rollout and rollback plan | Baseline complete in this document |
| Implemented AI services/UI | Phase 3B AI Business Advisor, Phase 3C Business Health Score, Phase 3D Predictive Cashflow, Phase 3E Smart Inventory Forecasting, Phase 3F Bank Reconciliation, Phase 3G Loan Readiness, Phase 3H Tax Assistant, Phase 3I Cooperative, Phase 3J Payroll, Phase 3K Staff Performance, Phase 3L WhatsApp Automation, Phase 3M AI Marketing, Phase 3N Executive Dashboard, Phase 3O Predictive Alerts, Phase 3P AI Evaluation, and Phase 3Q Admin AI Operations foundations implemented behind disabled flags |
| Schema and migrations | Phase 3C-O additive migrations added for snapshots, reconciliation review, consent logs, tax assistant summaries, separate cooperative ledgers, payroll run snapshots, staff-performance goals/snapshots, WhatsApp automation consent/template/job records, marketing drafts/feedback, executive dashboard snapshots, predictive alert state, and AI evaluation foundations; no existing financial records mutated |
| Tests and evaluations | Flag, advisor, feedback, health-score, cashflow-forecast, inventory-forecast, bank-reconciliation, loan-readiness, tax-assistant, cooperative ledger/API, payroll formula/API, staff-performance formula/API, WhatsApp automation policy/API, AI marketing draft/API, executive-dashboard formula/API, predictive-alert formula/API, AI-evaluation summary/API, and admin-AI-operations summary tests added; curated redacted regression dataset remains next |
| Monitoring dashboards | Admin AI operations aggregate dashboard implemented behind disabled flag |
| Admin runbooks | Baseline support and incident runbooks added in Phase 3R and Phase 3T |
| Final production-readiness report | Pending full gate output after Phase 3R/S/T documentation |

Phase 3 is not production-ready after Phase 3A. The next safe build step is Wave 1 read-only metrics and tool authorization, behind disabled flags.
