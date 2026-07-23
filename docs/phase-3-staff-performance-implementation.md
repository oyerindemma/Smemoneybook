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

- Public flag remains default-off:
  - `NEXT_PUBLIC_PHASE3_STAFF_PERFORMANCE_ENABLED=false`
- Added documented server-side equivalent:
  - `PHASE3_STAFF_PERFORMANCE_ENABLED=false`
- API/page access requires both flags and respects the Phase 3 global kill switch.

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

Completed locally:

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npx prisma validate`
- `git diff --check`
- `npx playwright test tests/e2e/staff-performance.spec.ts` ran and skipped because Staff Performance flags are off locally.

Not run:

- `npx prisma migrate status` was not run because the local `DATABASE_URL` was not clearly labeled as the dedicated `phase-3-staging` Neon database. This avoids accidentally touching Production.

## Preview QA

Preview deployment and end-to-end Preview QA are not completed from this workspace.

- Preview deployment URL: not available.
- Preview branch confirmation: not available.
- Preview Ready status: not available.
- End-to-end Preview evidence: not available.

The implementation should not be marked complete until `phase-3-staging` is deployed to Vercel Preview with both Staff Performance flags enabled only for that branch/environment and the Playwright/manual QA path passes against the Preview URL.

## Known Limitations

- Historical manual transaction amounts cannot be attributed per staff without transaction actor fields or richer audit metadata.
- No PDF export was added; CSV only.
- No individual staff self-view was added.
- No employment-decision labels, rankings, or composite scoring were added.

## Commit And Production Status

- Implementation commit hash: `eb73db9652ea3aff3a1a8c7bc9f810937bf62d7a`.
- Production deployment: unchanged by this local implementation.
- Production database: unchanged by this local implementation.
