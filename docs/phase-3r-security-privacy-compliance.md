# SME MoneyBook Phase 3R Security, Privacy, And Compliance

Status: documented baseline for gated Phase 3 QA on `phase-3-staging`.

Phase 3 features are decision-support, recordkeeping, and operational tools. SME MoneyBook must not present itself as a bank, lender, tax authority, accountant, auditor, or licensed financial adviser unless separately licensed and reviewed.

## Required Controls

- Tenant isolation: every service must resolve the active business and scope queries by `businessId`.
- Least privilege: routes use existing business permissions such as `reports:write`, `inventory:write`, `money:write`, or `admin`.
- Server-side authorization: AI tools never receive direct unrestricted database access.
- PII minimization: admin dashboards and evaluation records store metadata, counts, rates, and ids, not sensitive content.
- Encryption: HTTPS in transit; managed PostgreSQL encryption at rest through the database provider.
- Secrets: OpenAI, Paystack, Resend, WhatsApp, Neon, and Vercel secrets remain environment variables and must be rotated after suspected exposure.
- Rate limiting: all Phase 3 write/read APIs added in this phase use route-level rate limits.
- Abuse prevention: global kill switch plus per-feature flags remain default-off.
- Prompt injection defense: model access is mediated by server-side allowlisted tools and output guardrails.
- Tool boundaries: read-only AI tools are separated from pending write actions requiring confirmation.
- Audit logs: assistant calls, snapshots, payroll/cooperative actions, marketing approvals, alert scans, and feedback write audit records.
- Data export/deletion: account deletion and backup/export paths remain the source workflows; generated snapshots must be included in future exports.
- Consent records: WhatsApp opt-in, loan-readiness sharing logs, marketing review, and evaluation dataset consent metadata are explicit.
- Retention controls: evaluation datasets require retention policy metadata; operational snapshots require a future retention job before broad rollout.

## Disclaimers

- AI assistant: informational support only; figures come from recorded business data and can be incomplete.
- Forecasts: estimates with uncertainty, not guarantees.
- Tax assistant: preparation and recordkeeping support, not tax filing or legal tax advice.
- Loan readiness: not loan approval, not credit-bureau scoring, and not a lending decision.
- Payroll: payroll recordkeeping support; country-specific legal obligations require professional review.
- Cooperative module: separate ledger support; does not merge group funds with owner ledger without explicit linking.

## Threat Model

| Surface | Primary risks | Controls |
| --- | --- | --- |
| AI assistant | Prompt injection, cross-tenant data leakage, fabricated figures, unapproved writes | Server-side tools, tenant-scoped context, source citations, confirmation gate for writes, feedback and audit events |
| Bank imports | Malicious file content, duplicate imports, incorrect matches, leaking statement text | CSV parser constraints, file hash uniqueness, human match confirmation, locked reconciliation flow, no admin content exposure |
| Payroll | Sensitive employee data, incorrect locked runs, unauthorized payslip access | Admin permission gate, Pro plan gate, locked run and reversal workflow, no automatic recalculation |
| Cooperative data | Mixed funds, ledger drift, unauthorized loan approvals | Separate cooperative ledger tables, nonnegative ledger checks, loan/guarantor workflow, audit logs |
| WhatsApp automation | Spam, opt-out violations, template failures, quiet-hour breaches | Contact consent, template status, opt-out handling, quiet-hour policy, job audit and failure tracking |
| Partner sharing | Unconsented loan/tax/business data sharing | Sharing logs, consent text, revoked status, no automatic partner integration |
| Admin access | Sensitive business content exposure, excessive support access | Aggregate-only Phase 3Q metrics, existing `ADMIN_EMAILS` gate, audit-backed support interventions |

## Incident Response

1. Enable `PHASE3_AI_GLOBAL_KILL_SWITCH`.
2. Disable the affected `NEXT_PUBLIC_PHASE3_*` feature flag.
3. Preserve audit logs, evaluation events, generated snapshots, and imported files.
4. Identify affected businesses by `businessId`, not by exposing content in broad admin views.
5. Rotate any suspected exposed secrets.
6. Prepare customer notification only after confirming scope, impact, and remediation.
7. Add a regression test before re-enabling the feature.

## Compliance Checklist

- No AI feature writes financial records without explicit confirmation.
- No forecast or score is presented as guaranteed.
- No loan-readiness result is described as approval.
- No tax output is described as filing.
- No WhatsApp job is sent without template and consent controls.
- No evaluation event stores raw customer prompt or answer content.
- No admin AI operations card reveals sensitive business content.
- Cross-tenant denial tests must pass before any broader rollout.

Phase 3R is documentation and control alignment. It does not deploy or enable features.
