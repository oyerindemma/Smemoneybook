# Phase 3 Staff Performance Implementation

Branch: `phase-3-staging`

## Data Sources Used

- Staff identity and role: `BusinessMember`, `User`.
- Location context: `BusinessLocation`, `BusinessLocationMember`.
- Sales and expense activity: `AuditLog` actions `transaction.sale`, `transaction.expense`, `pos.sale`, plus active `Transaction` records for reliable business totals and POS transaction amounts.
- Invoice activity: `IssuedDocument` where `type = INVOICE`.
- Debt activity: `DebtEvent` for `CUSTOMER_COLLECTION` and `SUPPLIER_SETTLEMENT`.
- Stock activity: `InventoryMovement` for `STOCK_IN` and `STOCK_OUT`.
- Warehouse actions: `StockTransfer` lifecycle actors for created, approved, sent, and received actions; audit logs for cancellation/rejection actions.
- Reversals/corrections: `AuditLog` action `transaction.reversed`, plus `CustomerReturn` and `SupplierReturn`.
- Audit logging: `AuditLog` for report viewed/exported events with filters only.

## Metric Formulas

- Sales amount recorded: sum of attributed sales with reliable amount evidence.
- Number of sales transactions: count of sale-recording actions attributed to the staff member.
- Average transaction value: attributed sales amount divided by attributed sales transactions with reliable amounts.
- Invoices created: count of attributed issued invoice records.
- Expenses recorded: count of attributed expense-recording actions.
- Debt collections recorded: count of attributed customer collection events.
- Supplier settlements recorded: count of attributed supplier settlement events.
- Stock-in operations: count of attributed stock-in inventory movements.
- Stock-out operations: count of attributed stock-out inventory movements.
- Warehouse transfer actions: count of attributed transfer lifecycle actions.
- Reversals/corrections: count of attributed transaction reversals, customer returns, and supplier returns.
- Active days: count of UTC calendar days with at least one attributed operational event.
- Last recorded activity: latest timestamp from attributed operational events.
- Percentage contribution to recorded business sales: attributed staff sales amount divided by total active business sales amount for the same filtered period.

No composite score was added.

## Attribution Limitations

- Manual `Transaction` rows do not have `actorId`; staff-level amounts are reliable only when an audit event carries a transaction id or amount.
- POS sale audit logs currently carry transaction ids, so those amounts can be linked to active sale transactions.
- Manual sales and expenses can be counted from audit actors but may lack staff-level amounts.
- Location filtering excludes records where the source has no reliable location; those are reported under data-quality notes.
- Reversed original sales/expenses are excluded from current active business sales totals; reversal activity is counted separately as correction activity.

## Permissions

- Added permission strings:
  - `staff_performance:read`
  - `staff_performance:export`
- `OWNER` has read/export by default.
- `STAFF` and `ACCOUNTANT` require explicit permission policy or override.
- Export checks `staff_performance:export` separately from read.
- Staff detail validates that the requested staff user belongs to the active business.

## Feature Flags

- Exact Staff Performance flags:
  - `NEXT_PUBLIC_PHASE3_STAFF_PERFORMANCE_ENABLED`
  - `PHASE3_STAFF_PERFORMANCE_ENABLED`
- No additional Staff Performance-specific flags are used.
- Source consumption:
  - Server-side API/route authorization: `src/lib/staff-performance/authorization.ts` requires both Staff Performance flags and keeps respecting `PHASE3_AI_GLOBAL_KILL_SWITCH`; Staff Performance summary, detail, and export API routes call `requireStaffPerformanceAccess`.
  - Client-side navigation/UI visibility: `src/lib/phase3/feature-flags.ts` reads `NEXT_PUBLIC_PHASE3_STAFF_PERFORMANCE_ENABLED`; `/more` uses that public flag for the Staff Performance navigation status; `/more/staff-performance` renders the panel only when the public flag and server helper are enabled.
  - Tests: `src/lib/staff-performance/authorization.test.ts`, `src/lib/phase3/navigation-status.test.ts`, `src/app/api/staff-performance/route.test.ts`, and `tests/e2e/staff-performance.spec.ts`.
- Vercel Preview configuration completed on 2026-07-23:
  - `PHASE3_STAFF_PERFORMANCE_ENABLED=true` for Environment `Preview`, Git branch `phase-3-staging`.
  - `NEXT_PUBLIC_PHASE3_STAFF_PERFORMANCE_ENABLED=true` for Environment `Preview`, Git branch `phase-3-staging`.
  - `DATABASE_URL`, `DIRECT_URL`, and `NEXT_PUBLIC_APP_URL` confirmed present for Environment `Preview`, Git branch `phase-3-staging`.
  - `DATABASE_URL` and `DIRECT_URL` were kept sensitive; values were not printed. The branch Preview database variables were aligned to the locally validated non-production Neon Preview target before redeploy.
  - Production variables were not modified. `phase-2-staging` variables were not modified.

## Schema Changes

No schema migration was added. Step 1 uses existing additive Phase 3 permission tables and operational attribution fields.

Recommended future additive schema work remains:

- Add nullable transaction actor attribution.
- Add payment actor attribution.
- Include transaction id, amount, and location metadata consistently in sale/expense audit logs.

## APIs

- `GET /api/staff-performance/summary`
- `GET /api/staff-performance/[staffId]`
- `GET /api/staff-performance/export`
- `GET /api/staff-performance` remains as read-only compatibility for summary.
- `POST`, `PUT`, `PATCH`, and `DELETE` on `/api/staff-performance` return `405` with `Staff Performance is read-only.`

## UI Route

- `/more/staff-performance`
- Includes summary cards, date range selector, custom date range inputs, location filter, staff table, individual staff detail panel, trend comparison, unattributed activity notice, data-quality notice, export button, loading, empty, and error states.
- The More page now shows `Unavailable` while the module is implemented but disabled by default.

## Tests

- Unit/formula tests: `src/lib/staff-performance/definitions.test.ts`.
- Authorization tests: `src/lib/staff-performance/authorization.test.ts`.
- API route tests: `src/app/api/staff-performance/route.test.ts`.
- Navigation label coverage: `src/lib/phase3/navigation-status.test.ts`.
- Playwright Preview workflow spec: `tests/e2e/staff-performance.spec.ts`.

## Validation

Completed locally on 2026-07-23:

- `NEXT_PUBLIC_PHASE3_STAFF_PERFORMANCE_ENABLED=true PHASE3_STAFF_PERFORMANCE_ENABLED=true npm run test -- src/app/api/staff-performance/route.test.ts src/lib/staff-performance/definitions.test.ts src/lib/staff-performance/authorization.test.ts src/lib/phase3/navigation-status.test.ts`: passed, 4 files and 21 tests.
- `NEXT_PUBLIC_PHASE3_STAFF_PERFORMANCE_ENABLED=true PHASE3_STAFF_PERFORMANCE_ENABLED=true npx playwright test tests/e2e/staff-performance.spec.ts`: passed, 6 tests across desktop Chrome, mobile Chrome, and mobile Safari. The spec executed and did not skip.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run test`: passed, 77 files and 267 tests.
- `npm run build`: passed.
- `npx prisma validate`: passed.
- `npx prisma migrate status`: passed against the checked Preview Neon PostgreSQL target; 34 migrations found; database schema is up to date.
- `git diff --check`: passed.

The focused test evidence covers:

- Owner access.
- Unauthorized-user rejection.
- Business isolation.
- Date filtering.
- Staff detail.
- Empty/no-activity handling.
- CSV export.
- Feature flag off state.
- Feature flag on state.
- Read-only write-method rejection.

Preview QA found and fixed one issue before final classification:

- During UI custom-date edits, an over-366-day intermediate range could return `500`. `src/lib/staff-performance/api.ts` now maps Staff Performance date-parse failures to a controlled `400`, covered by `src/app/api/staff-performance/route.test.ts`.

## Preview QA

Completed on 2026-07-23 against the newest code-fix deployment:

- Vercel environment: `Preview`.
- Vercel branch: `phase-3-staging`.
- Deployment commit: `996085109020d642613565ae14bf5326cd5cce68`.
- Deployment URL: `https://smemoneybook-61hd83qup-emmanuel-oyerindes-projects.vercel.app`.
- Branch alias: `https://smemoneybook-git-phase-3-staging-emmanuel-oyerindes-projects.vercel.app`.
- Vercel status: Ready.

Preview QA result:

- `/more` shows Staff Performance with `Preview`.
- `/more/staff-performance` loads.
- Summary metrics load.
- Date and location filters work.
- Staff detail works.
- CSV export starts from the UI and API CSV content contains expected Staff Performance content.
- Empty/no-activity period is handled without a native 404 or unexpected 500.
- Unauthenticated API access is rejected with `401`.
- Authenticated staff without Staff Performance grant is rejected with `403`.
- Cross-business `businessId` access is rejected with `403`.
- Invalid overlong custom date range returns `400`, not `500`.
- No native 404 was observed on the Staff Performance path.
- No unexpected 500 was observed on the Staff Performance path.
- No write operation is exposed in the UI.
- `POST`, `PUT`, `PATCH`, and `DELETE` on `/api/staff-performance` return `405`.

Preview QA used dedicated seeded Preview QA data in the phase-3-staging database only.

## Known Limitations

- Historical manual transaction amounts cannot be attributed per staff without transaction actor fields or richer audit metadata.
- No PDF export was added; CSV only.
- No individual staff self-view was added.
- No employment-decision labels, rankings, or composite scoring were added.
- Empty UI state means no staff rows returned; a business with members and no activity displays zero metrics and `No activity` in the staff row.
- Preview QA data is synthetic and should not be treated as customer/business production evidence.

## Commit And Production Status

- Implementation commit hash: `eb73db9652ea3aff3a1a8c7bc9f810937bf62d7a`.
- Initial report commit hash: `1921b29d863142efa52de37a4180d5f605e72a79`.
- Preview trigger commit hash: `912e2ca00177642ae1756d3ab4752f18c8e9688a`.
- Preview env-alignment trigger commit hash: `903dc93741a487bd9badd9030b3e5032fa15984a`.
- Preview QA fix commit hash: `996085109020d642613565ae14bf5326cd5cce68`.
- Production deployment: unchanged by this Preview-only validation.
- Production database: unchanged by this Preview-only validation.
- Production Staff Performance flags: not enabled by this validation.
