# SME Moneybook

A Nigeria-focused daily money operating system for SMEs, based on the product blueprint in this workspace.

## Current MVP

- Business home screen with combined balance.
- Cash, Bank and POS accounts auto-created for each new business.
- Record sales and expenses without accounting jargon.
- Paid sales increase balances; paid expenses decrease balances.
- Credit sales create customer debt; unpaid expenses create supplier debt.
- Dashboard totals and smart notes update immediately.
- Prisma schema captures the production data model for Neon/PostgreSQL.
- Email/password sign-up and sign-in with hashed passwords.
- HTTP-only cookie sessions.
- API routes for dashboard, accounts, businesses and transactions.
- People-to-collect-from workflow with reminder notes and collected-money settlement.
- Lightweight inventory with product list, stock in/out, low-stock alerts and profit per item.
- Monthly reports with VAT estimate, saved VAT summaries and CSV export.

## Run Locally

```bash
npm install
npm run db:generate
npm run dev
```

Open `http://localhost:3000`.

## Database Setup

When a Neon database is ready:

```bash
cp .env.example .env
npm run db:generate
npm run db:migrate -- --name init
```

Then run `npm run dev`, create your account in the app, and the first business will be created with Cash, Bank and POS ready to use.

## Production Foundation

This repo now has the Phase 1 guardrails for safe beta work:

- Git initialized with generated files, dependencies and local secrets ignored.
- Shared Zod request validation for auth, business, transaction, inventory, debt collection and report period inputs.
- A backend money-domain service in `src/lib/bookkeeping/domain.ts` that owns balance movement, debt creation instructions and profit rules.
- Phase 2 money hardening: append-only reversals, transfer persistence, account opening balances, dated records, expense categories and duplicate fingerprints.
- Phase 3 people workflow: dedicated customer/supplier pages, phone and due dates, partial collections, supplier settlement, overdue states and reminder event history.
- Phase 4 inventory-sales workflow: product-linked sales, automatic stock reduction, profit from item cost price, stock movement reasons, search, low-stock states and movement history.
- Phase 5 reporting upgrade: daily/weekly/monthly filters, cash-vs-credit sales, aging, VAT taxability, PDF export, saved snapshots and plain-language owner insights.
- Unit tests for core money rules.
- API integration coverage for transaction validation and handoff to persistence.
- A Playwright smoke test for the home shell.
- GitHub Actions CI for install, typecheck, lint, unit/API tests and production build.
- Prisma seed data for local/staging demos.

## Quality Commands

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run ci
```

Run the browser smoke test locally with:

```bash
npm run test:e2e
```

## Seed Data

After migrations are applied, create a demo account:

```bash
npm run db:seed
```

Demo credentials:

- Email: `demo@smemoneybook.local`
- Password: `demo-password`

Use this only for local or staging databases.

## Migration Discipline

- Change `prisma/schema.prisma` first.
- Create a named migration with `npm run db:migrate -- --name <short_change_name>`.
- Review the generated SQL in `prisma/migrations/*/migration.sql`.
- Run `npm run ci` before deploying.
- Never point local seed/demo commands at production data.

## Money Record Rules

- Transactions are append-only from the product perspective.
- Wrong records are corrected by creating a reversal adjustment that links back to the original transaction.
- Transfers create one transaction with a source account and destination account; balances move in opposite directions.
- Account opening balances are stored separately from current balances.
- Duplicate protection uses both idempotency keys and a server-side fingerprint for same-minute matching entries.

## Debt Control Rules

- Credit sales create customer debts; unpaid expenses create supplier bills.
- Debts can be partially collected or partially settled.
- Remaining balances, not original debt amounts, drive dashboard debt totals.
- Reminder actions are stored as debt events with a channel field (`manual`, `whatsapp`, `sms`) so WhatsApp/SMS delivery can be attached later.
- Due dates produce overdue states while debts remain open.

## Inventory Rules

- Product sales attach an inventory item and quantity to the transaction.
- Selling from inventory reduces stock automatically and records a stock-out movement linked to the sale.
- Profit for product sales is calculated from item cost price multiplied by quantity.
- Manual stock in/out entries require a quantity and can store an adjustment reason.
- Reversing a product sale restores the sold quantity through an adjustment movement.

## Reporting Rules

- Reports support daily, weekly and monthly periods.
- Sales are split into cash received and customer credit.
- VAT estimates use taxable sales only; sales marked `Non-taxable sale` are excluded.
- Receivables and payables aging use remaining open balances.
- Report snapshots store the full generated summary as JSON for later review.

## Operations Rules

- Owners can invite staff and accountants from the dashboard operations panel.
- Staff can record money and stock activity; accountants can also save reports and export backups.
- Owner-only actions include staff invitations, account setup and restore validation.
- Sessions store device metadata and can be removed from the operations panel.
- Auth routes use an in-memory rate limit locally; use platform or edge rate limiting for production scale.
- Backups export business data as JSON. Restore uploads are validated and audit-logged before any live-data restore.
- API failures are written to `ApiErrorLog` when routes catch unexpected operational errors.

## Paid Tier Rules

- WhatsApp reminders generate a prefilled `wa.me` link and store the reminder event. Add provider credentials before automatic sending.
- Category assist uses deterministic SME rules locally and can be replaced with an AI provider behind `/api/assist/categorize`.
- Receipt extraction stores uploaded receipt text, suggested amount, vendor and category for review.
- Offline transaction captures are stored in the browser and synced through `/api/offline/transactions` when the network returns.
- Billing checkout records plan intent for ₦3,500, ₦7,000 and ₦12,000 tiers. Connect Paystack or Stripe before live charges.
- Users can belong to multiple businesses; the dashboard can load a selected business by `businessId`.
- Accountant exports provide a lightweight CSV pack while full backups remain available to owner/accountant roles.

## Deployment Notes

For Vercel + Neon:

1. Create the Neon database and set `DATABASE_URL`.
2. Set `NEXT_PUBLIC_APP_URL` to the production HTTPS origin.
3. Set `RESEND_API_KEY` and `EMAIL_FROM` for password reset emails. `EMAIL_FROM` must use a sender/domain verified in Resend. Existing Vercel projects may use `ADMIN_EMAIL` or `Admin_Email` as a fallback sender, but `EMAIL_FROM` is preferred.
4. Set `ADMIN_EMAILS` to a comma-separated allowlist for internal `/admin` access.
5. Run `npm run db:generate`.
6. Apply migrations from a trusted environment.
7. Deploy after `npm run ci` passes.
8. Confirm the app can register, sign in, request a password reset email, record a paid sale, record a credit sale, collect debt, export a monthly CSV and open `/admin` from an allowlisted admin email.

Production `/admin` access is denied unless the signed-in user email is listed in `ADMIN_EMAILS`. In local development only, an empty `ADMIN_EMAILS` allows signed-in users and shows a warning banner.

Current npm audit status: `npm install` reports two moderate advisories. Do not run forced upgrades blindly; review the dependency tree and test the app after any remediation.
