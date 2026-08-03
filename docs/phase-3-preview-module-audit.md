# Phase 3 Preview Module Audit

Date: 2026-07-22  
Branch: `phase-3-staging`  
Starting HEAD: `e4c7bfa1fefc7f4715a1b45f840a8d34cfd4c5b2` (`Apply Phase 3 Preview database variables`)  
Environment audited: Vercel Preview, branch `phase-3-staging`

## Current State Verified

- `git branch --show-current`: `phase-3-staging`
- `git status --short --branch`: clean at audit start
- `git rev-parse HEAD`: `e4c7bfa1fefc7f4715a1b45f840a8d34cfd4c5b2`
- `git log -1 --oneline`: `e4c7bfa Apply Phase 3 Preview database variables`
- Vercel Preview env listing showed `DATABASE_URL` and `DIRECT_URL` scoped to `phase-3-staging`.
- Vercel Preview env listing initially showed all Phase 2 public flags and `NEXT_PUBLIC_APP_URL` scoped only to `phase-2-staging`, not `phase-3-staging`.
- `npx prisma migrate status` through `vercel env run --environment=preview --git-branch=phase-3-staging` initially found the Phase 3 migrations unapplied.

## Phase 2 Gate Chain

Phase 2 access remains layered and was not weakened:

- Feature flag: `src/lib/phase2/feature-flags.ts`
- Client navigation gate: `src/lib/phase2/client-access.ts`
- Server page gate: `src/lib/phase2/page-access.ts`
- Subscription plan and entitlement source: `src/lib/billing/plans.ts`, `src/lib/billing/subscriptions.ts`
- Role and permission source: `src/lib/operations/access.ts`
- Dashboard entitlement loader: `src/lib/bookkeeping/persistence.ts`

For the seeded active Pro business, the active subscription maps to Pro entitlements through `getBillingPlanByDbPlan`. Navigation and pages still require flag enabled, entitlement present, and permission/role access.

| Phase 2 Module | Route | Feature Flag | Plan | Entitlement | Permission | Database Dependency | API Dependency | Navigation Condition | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Business Settings | `/more/business-settings` | `NEXT_PUBLIC_PHASE2_LOCATIONS_ENABLED` or `NEXT_PUBLIC_PHASE2_TAX_ENABLED` | Pro on subroutes | `multi_location`, `tax_management` | owner/admin, `canManageLocations`, `canManageTax`; server `locations:create` or admin | `BusinessLocation`, `TaxConfig`, `TaxRate` | `/api/locations`, `/api/tax/settings`, `/api/tax/summary` | locations or tax access enabled | Restored by Preview env flags |
| Business Locations | `/more/business-settings/locations` | `NEXT_PUBLIC_PHASE2_LOCATIONS_ENABLED` | Pro | `multi_location` | server `locations:create`; owner/admin passes | `BusinessLocation`, `BusinessLocationMember`, `InventoryBalance` | `/api/locations`, `/api/locations/[id]` | location access enabled | Restored by Preview env flags |
| Warehouses | `/stock/warehouses` | `NEXT_PUBLIC_PHASE2_LOCATIONS_ENABLED` | Pro | `multi_location` | server `locations:create`; owner/admin passes | `BusinessLocation` with warehouse type | `/api/locations`, `/api/locations/[id]` | location access enabled | Restored by Preview env flags |
| Warehouse Transfers | `/stock/transfers` | `NEXT_PUBLIC_PHASE2_TRANSFERS_ENABLED` | Pro | `warehouse_transfers` | `transfers:create`, lifecycle permissions for actions | `StockTransfer`, `StockTransferItem`, `InventoryMovement`, `InventoryBalance` | `/api/stock-transfers/*` | transfer access enabled | Restored by Preview env flags |
| Advanced Reports | `/reports` | `NEXT_PUBLIC_PHASE2_REPORTING_CENTRE_ENABLED` | Pro | `advanced_reports` | `reports:write`, `canSaveReports` | report snapshots/export jobs and transaction tables | `/api/reports/definitions`, `/api/reports/exports` | report access enabled; falls back to Basic when flag off | Restored by Preview env flags |
| PDF Exports | report/export APIs | `NEXT_PUBLIC_PHASE2_PDF_EXPORTS_ENABLED` and reporting flag where used | Pro | `professional_pdf_exports` | report/export permission | `ReportExport`/export tables | `/api/reports/exports` | API-gated | Restored by Preview env flags |
| Tax Management | `/more/business-settings/tax` | `NEXT_PUBLIC_PHASE2_TAX_ENABLED` | Pro | `tax_management` | owner/admin | `TaxConfig`, `TaxRate`, `TaxRun` | `/api/tax/settings`, `/api/tax/summary` | tax access enabled | Restored by Preview env flags |
| Invoice Branding | More page Phase 2 panel | `NEXT_PUBLIC_PHASE2_INVOICE_BRANDING_ENABLED` | Pro | `invoice_branding` | business access plus feature access | `DocumentBrandingConfig` | `/api/document-branding` | flag enabled in settings panel | Restored by Preview env flags |
| Multi-language | More page Phase 2 panel | `NEXT_PUBLIC_PHASE2_I18N_ENABLED` | Pro via Phase 2 rollout | no separate entitlement enforced in current API | authenticated business access | preference storage | `/api/i18n/preferences` | flag enabled in settings panel | Restored by Preview env flags |
| Granular Staff Permissions | More page Phase 2 panel | `NEXT_PUBLIC_PHASE2_GRANULAR_PERMISSIONS_ENABLED` | Pro | `granular_permissions` | admin/business access | `PermissionPolicy` | `/api/permissions/policies` | flag enabled in settings panel | Restored by Preview env flags |
| Announcement Centre | More page Phase 2 panel | `NEXT_PUBLIC_PHASE2_ANNOUNCEMENTS_ENABLED` | Pro via rollout | admin sender; user reads | auth/admin email for create | `Announcement`, `AnnouncementRead` | `/api/announcements`, `/api/announcements/[id]/read` | flag enabled in settings panel | Restored by Preview env flags |
| Multiple-business Switching | dashboard state/nav | `NEXT_PUBLIC_PHASE2_BUSINESS_SWITCHER_ENABLED` | Pro | `business_switching` in Pro metadata | business memberships | `BusinessMember` | dashboard state loaders | flag plus entitlement when used | Restored by Preview env flags |
| Staff Management | `/more/staff` | no Phase 2 public flag | Pro | `team_management` | owner/admin, `canManageStaff` | `BusinessMember`, invitations | `/api/staff/invitations/*` | permission plus entitlement | Already available when entitlement present |
| Billing | `/more/billing` | none | owner/admin access | n/a | `canManageAccounts` | `Subscription`, `PaymentEvent` | `/api/billing/status`, Paystack APIs | owner/admin account access | Route available; Paystack keys remain phase-2-only |

## Preview Database Migration

The Phase 3 migrations were reviewed before applying. A destructive-operation scan over `prisma/migrations/20260719*phase_3*/migration.sql` found no `DROP`, `TRUNCATE`, `DELETE FROM`, `ALTER TABLE ... DROP`, or data `UPDATE` operations. The migrations add Phase 3 tables, indexes, foreign keys, and check constraints.

Applied to Vercel Preview branch `phase-3-staging` only with:

`npx vercel@latest env run --environment=preview --git-branch=phase-3-staging -- npx prisma migrate deploy`

Applied migrations:

- `20260719070000_phase_3_health_score`
- `20260719073000_phase_3_cashflow_forecasts`
- `20260719080000_phase_3_inventory_forecasts`
- `20260719083000_phase_3_bank_reconciliation`
- `20260719090000_phase_3_loan_readiness`
- `20260719093000_phase_3_tax_assistant`
- `20260719100000_phase_3_cooperatives`
- `20260719103000_phase_3_payroll`
- `20260719110000_phase_3_staff_performance`
- `20260719113000_phase_3_whatsapp_automation`
- `20260719120000_phase_3_ai_marketing`
- `20260719123000_phase_3_executive_dashboard`
- `20260719130000_phase_3_predictive_alerts_and_ai_evaluation`

Post-deploy `npx prisma migrate status` through the same Vercel Preview branch env reports: `Database schema is up to date!`

## Phase 3 Module Audit

| Module | Route | Classification | Feature Flag | Plan Requirement | Entitlement | Permission | Database Dependency | External Dependency | Tests | Current Limitation | Action Taken | Preview QA Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Bank Reconciliation | `/more/bank-reconciliation` | C. PARTIALLY IMPLEMENTED | `NEXT_PUBLIC_PHASE3_BANK_RECONCILIATION_ENABLED` | Growth | none | `money:write`; location access for scoped import | `BankStatementImport`, `BankStatementImportRow`, `BankReconciliationMatch`, `Account`, `Transaction`, `AuditLog` | none | `src/app/api/bank-reconciliation/route.test.ts`, `src/lib/phase3/bank-reconciliation.test.ts` | Backend supports import/match/lock, but UI imports/lists only and does not expose confirm/reject/lock workflow. | More label changed from generic Preview to `Coming soon` while disabled. | Pending post-deploy smoke |
| Loan Readiness | `/more/loan-readiness` | B. GATED BUT IMPLEMENTED | `NEXT_PUBLIC_PHASE3_LOAN_READINESS_ENABLED` | Growth | none | `reports:write`; location access when scoped | `LoanReadinessSnapshot`, `LoanReadinessSharingLog`, transactions/debts/inventory metrics | none; no external sharing performed | `src/app/api/loan-readiness/route.test.ts`, `src/lib/phase3/loan-readiness.test.ts` | Decision-support only; consent log records sharing intent but does not transmit to lenders. | More label changed to `Unavailable` while disabled. | Pending post-deploy smoke |
| Tax Assistant | `/more/tax-assistant` | B. GATED BUT IMPLEMENTED | `NEXT_PUBLIC_PHASE3_TAX_ASSISTANT_ENABLED` | Growth | `tax_management` | `reports:write`; location access when scoped | `TaxAssistantSnapshot`, `TaxConfig`, `TaxRate`, `TaxRun`, `DocumentTaxSnapshot`, transactions | none | `src/app/api/tax-assistant/route.test.ts`, `src/lib/phase3/tax-assistant.test.ts` | Estimates only; no filing, tax-record mutation, or tax advice. | More label changed to `Unavailable` while disabled. | Pending post-deploy smoke |
| Cooperatives | `/more/cooperatives` | B. GATED BUT IMPLEMENTED | `PHASE3_COOPERATIVES_ENABLED`; `NEXT_PUBLIC_PHASE3_COOPERATIVES_ENABLED` | Pro | `cooperatives` | `cooperatives:*` granular permissions; location access on scoped profile creation | `CooperativeGroup`, `CooperativeMember`, contribution plans, contributions, loans, guarantors, repayment schedules, approval actions, ledger accounts, balanced ledger batches, transfers, and ledger entries | none; no automatic money movement | `src/app/api/cooperatives/route.test.ts`, `src/lib/cooperatives/authorization.test.ts`, `src/lib/cooperatives/ledger.test.ts`, `src/lib/phase3/cooperative-ledger.test.ts`, `tests/e2e/cooperatives.spec.ts` | Reducing-balance loan interest remains disabled until formula validation; registration/legal compliance is not automated. | Implemented Phase 3J services, nested APIs, UI tabs/routes, exact dual flags, Pro entitlement, granular permissions, additive migration, and executed Playwright with flags on. | Pending post-deploy smoke |
| Payroll | `/more/payroll` | C. PARTIALLY IMPLEMENTED | `NEXT_PUBLIC_PHASE3_PAYROLL_ENABLED` | Pro | none | admin only | `PayrollEmployee`, `PayrollRun`, `PayrollRunItem`, `PayrollJournalEntry` | none | `src/app/api/payroll/route.test.ts`, `src/lib/phase3/payroll.test.ts` | API supports approve/lock/reverse, but UI exposes employee create and draft run only; no payments or ledger posting. | More label changed to `Coming soon` while disabled. | Pending post-deploy smoke |
| Staff Performance | `/more/staff-performance` | C. PARTIALLY IMPLEMENTED | `NEXT_PUBLIC_PHASE3_STAFF_PERFORMANCE_ENABLED` | Pro | none | GET `reports:write`; writes admin only | `StaffPerformanceGoal`, `StaffPerformanceSnapshot`, business members, transactions, audit logs | none | `src/app/api/staff-performance/route.test.ts`, `src/lib/phase3/staff-performance.test.ts` | UI summarizes/saves snapshots; goal creation exists in API but is not exposed in UI. | More label changed to `Coming soon` while disabled. | Pending post-deploy smoke |
| AI Marketing | `/more/ai-marketing` | C. PARTIALLY IMPLEMENTED | `NEXT_PUBLIC_PHASE3_AI_MARKETING_ENABLED` | Growth | none | `money:write`; location access when scoped | `MarketingDraft`, `MarketingDraftFeedback`, optional `InventoryItem` | none; deterministic draft generator | `src/app/api/ai-marketing/route.test.ts`, `src/lib/phase3/ai-marketing.test.ts` | Draft/approve/feedback API exists, but UI only creates and views latest draft; nothing is sent or published. | More label changed to `Coming soon` while disabled. | Pending post-deploy smoke |
| Executive Dashboard | `/more/executive-dashboard` | B. GATED BUT IMPLEMENTED | `NEXT_PUBLIC_PHASE3_EXECUTIVE_DASHBOARD_ENABLED` | Pro | none | `reports:write`; location access when scoped | `ExecutiveDashboardSnapshot`, transactions, debts, inventory, accounts | none | `src/app/api/executive-dashboard/route.test.ts`, `src/lib/phase3/executive-dashboard.test.ts` | Decision-support snapshot only; no automated financial action. | More label changed to `Unavailable` while disabled. | Pending post-deploy smoke |
| Predictive Alerts | `/more/predictive-alerts` | B. GATED BUT IMPLEMENTED | `NEXT_PUBLIC_PHASE3_PREDICTIVE_ALERTS_ENABLED` | Growth | none | `reports:write`; location access when scoped | `PredictiveAlert`, `PredictiveAlertFeedback`, transactions/debts/inventory | none | `src/app/api/predictive-alerts/route.test.ts`, `src/lib/phase3/predictive-alerts.test.ts` | Heuristic review signals only; no automatic payments, stock changes, or ledger posting. | More label changed to `Unavailable` while disabled. | Pending post-deploy smoke |
| AI Evaluation | `/more/ai-evaluation` | B. GATED BUT IMPLEMENTED | `NEXT_PUBLIC_PHASE3_AI_EVALUATION_ENABLED` | Pro | none | `reports:write` | `AiEvaluationEvent`, `AiEvaluationDataset`, `AiEvaluationRun` | none | `src/app/api/ai-evaluation/route.test.ts`, `src/lib/phase3/ai-evaluation.test.ts` | UI is read-only overview; dataset/run/event writes are API-only. | More label changed to `Unavailable` while disabled. | Pending post-deploy smoke |
| AI Assistant | `/assistant` | B. GATED BUT IMPLEMENTED | `NEXT_PUBLIC_PHASE3_AI_ADVISOR_ENABLED`; `PHASE3_AI_GLOBAL_KILL_SWITCH`; request/cost controls | Growth | none | authenticated business membership; server-side tool authorization | `AssistantThread`, `AssistantMessage`, `AuditLog`, optional AI evaluation events | OpenAI optional; local grounded fallback exists when `OPENAI_API_KEY` is absent | `src/app/api/assistant/chat/route.test.ts`, assistant guardrail/tool tests | Read-only and draft-only tools; mutations are disabled/pending-confirmation and no records are changed by chat. | More label changed to `Unavailable` while disabled. | Pending post-deploy smoke |

## Root Cause

1. Business Settings was unavailable because `NEXT_PUBLIC_PHASE2_LOCATIONS_ENABLED` and `NEXT_PUBLIC_PHASE2_TAX_ENABLED` existed in Vercel Preview only for `phase-2-staging`. On `phase-3-staging`, both defaulted to `false`, so the client and page gates rendered unavailable states even for an active Pro business.
2. Warehouses was unavailable because it uses the Phase 2 `locations` flag. `NEXT_PUBLIC_PHASE2_LOCATIONS_ENABLED` was missing for Preview `phase-3-staging`, so `/stock/warehouses` rendered the server unavailable panel: "Warehouses are not enabled for this Preview build yet."

## Vercel Preview Variables Changed

All changes were scoped to Vercel Preview branch `phase-3-staging`. No Production variables were changed, no phase-2-staging variables were changed, and no database variables were edited.

- `NEXT_PUBLIC_PHASE2_LOCATIONS_ENABLED=true`
- `NEXT_PUBLIC_PHASE2_TRANSFERS_ENABLED=true`
- `NEXT_PUBLIC_PHASE2_REPORTING_CENTRE_ENABLED=true`
- `NEXT_PUBLIC_PHASE2_PDF_EXPORTS_ENABLED=true`
- `NEXT_PUBLIC_PHASE2_TAX_ENABLED=true`
- `NEXT_PUBLIC_PHASE2_INVOICE_BRANDING_ENABLED=true`
- `NEXT_PUBLIC_PHASE2_I18N_ENABLED=true`
- `NEXT_PUBLIC_PHASE2_GRANULAR_PERMISSIONS_ENABLED=true`
- `NEXT_PUBLIC_PHASE2_ANNOUNCEMENTS_ENABLED=true`
- `NEXT_PUBLIC_PHASE2_BUSINESS_SWITCHER_ENABLED=true`
- `NEXT_PUBLIC_APP_URL=https://smemoneybook-git-phase-3-staging-emmanuel-oyerindes-projects.vercel.app`

Confirmed present after write by `npx vercel@latest env ls preview`:

- all variables above for Preview `phase-3-staging`
- `DATABASE_URL` for Preview `phase-3-staging`
- `DIRECT_URL` for Preview `phase-3-staging`

## Code Files Changed

- `src/app/(dashboard)/more/page.tsx`
- `src/lib/phase3/navigation-status.ts`
- `src/lib/phase3/navigation-status.test.ts`
- `tests/e2e/phase2-visibility.spec.ts`
- `docs/phase-3-preview-module-audit.md`

## Phase 2 Regression Test Routes

These routes must be smoke-tested after redeploy:

- `/more`
- `/more/business-settings`
- `/more/business-settings/locations`
- `/more/business-settings/tax`
- `/stock`
- `/stock/warehouses`
- `/stock/transfers`
- `/reports`
- `/more/staff`
- `/more/billing`

Expected result for the seeded active Pro staging business: no native 404, no unexpected 500, Business Settings and Warehouses available, Transfers and other approved Phase 2 modules still gated by flag plus entitlement plus permission.

Automated result:

- `npm run test -- src/lib/phase3/navigation-status.test.ts src/lib/phase2/client-access.test.ts`: passed, 10 tests.
- `npm run test`: passed, 76 files and 258 tests.
- `NEXT_PUBLIC_PHASE2_LOCATIONS_ENABLED=true NEXT_PUBLIC_PHASE2_TRANSFERS_ENABLED=true NEXT_PUBLIC_PHASE2_REPORTING_CENTRE_ENABLED=true NEXT_PUBLIC_PHASE2_TAX_ENABLED=true npx playwright test tests/e2e/phase2-visibility.spec.ts`: passed in desktop Chrome, mobile Chrome, and mobile Safari.

## Intentionally Disabled Modules

All Phase 3 modules remain disabled unless their individual `NEXT_PUBLIC_PHASE3_*` flag is explicitly enabled for Preview. The audit did not enable any Phase 3 module.

## Modules Requiring External Setup

- WhatsApp Automation is not in the requested eleven-module audit, but the More page now labels it `Setup required` while disabled because it depends on WhatsApp provider setup before safe operation.
- AI Assistant can use OpenAI when configured but has a local grounded fallback; no OpenAI key is required for a non-secret Preview availability check.

## Security And Data Integrity Notes

- Production and the Production database were not queried or modified.
- Phase 2 entitlement and permission checks were preserved.
- Phase 3 financial modules remain gated and do not initiate payments, post ledger entries automatically, alter tax records, alter payroll records, modify bank balances, or create loan decisions.
- AI Assistant server tools enforce business-scoped access and keep mutation tools disabled/pending-confirmation.
- Phase 3 modules with partial UI remain labeled as `Coming soon` rather than generic Preview.

## Validation And Deployment

- `npm run lint`: passed
- `npm run typecheck`: passed
- `npm run test`: passed
- `npm run build`: passed; route table includes all audited routes and APIs.
- `npx prisma validate`: passed
- `npx prisma migrate status`: passed after Preview-only additive migration deploy
- `git diff --check`: passed
- Phase 2 Playwright visibility: passed across desktop and mobile projects
- Commit hash: `081441a9f66477719517efa2450f90bd0514f35e`
- Preview deployment URL: `https://smemoneybook-8aow11ibb-emmanuel-oyerindes-projects.vercel.app`
- Preview deployment commit: `081441a9f66477719517efa2450f90bd0514f35e`
- Preview smoke: exact deployment returned 200 for all Phase 2 and audited Phase 3 routes; mocked Pro navigation smoke confirmed Business Settings, Warehouses, Transfers, Reports, Staff, and honest Phase 3 labels.
- Production unchanged confirmation: Vercel Production env was listed by name only; no Production env writes or Production DB migration commands were run.
