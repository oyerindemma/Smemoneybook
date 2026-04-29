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

## Deployment Notes

For Vercel + Neon:

1. Create the Neon database and set `DATABASE_URL`.
2. Run `npm run db:generate`.
3. Apply migrations from a trusted environment.
4. Deploy after `npm run ci` passes.
5. Confirm the app can register, sign in, record a paid sale, record a credit sale, collect debt and export a monthly CSV.

Current npm audit status: `npm install` reports two moderate advisories. Do not run forced upgrades blindly; review the dependency tree and test the app after any remediation.
