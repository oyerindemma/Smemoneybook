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

## Deployment Notes

For Vercel + Neon:

1. Create the Neon database and set `DATABASE_URL`.
2. Run `npm run db:generate`.
3. Apply migrations from a trusted environment.
4. Deploy after `npm run ci` passes.
5. Confirm the app can register, sign in, record a paid sale, record a credit sale, collect debt and export a monthly CSV.

Current npm audit status: `npm install` reports two moderate advisories. Do not run forced upgrades blindly; review the dependency tree and test the app after any remediation.
