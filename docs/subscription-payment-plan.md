# Subscription Payment Plan

SME Moneybook should sell plans around business outcomes, not around technical modules. The current payment processor is Paystack, with monthly NGN pricing stored in `src/lib/billing/plans.ts` and subscriptions activated only after server-side verification or signed webhook confirmation.

## Plan Ladder

| Plan | Price | Best for | App features infused into the tier |
| --- | ---: | --- | --- |
| Starter | ₦3,000/month | Solo traders and micro shops leaving notebooks or spreadsheets | Core bookkeeping, money in/out records, customers and suppliers, inventory basics, reports view, and accountant CSV export |
| Growth | ₦6,000/month | SMEs recording daily sales, expenses, stock, and customer credit | Everything in Starter, plus AI category assist and receipt extraction to reduce manual capture work |
| Pro | ₦10,000/month | Multi-staff businesses and accountant-managed books | Everything in Growth, plus team/accountant access, audit tools, and advanced reports for oversight |

## Feature Gates

- `basic_exports`: included from Starter. Used by accountant export routes.
- `ai_category_assist`: included from Growth. Used by `/api/assist/categorize`.
- `receipt_extraction`: included from Growth. Used by `/api/receipts`.
- `team_management`: included from Pro. Intended for staff and accountant invite controls.
- `audit_tools`: included from Pro. Intended for operational logs, billing logs, and sensitive-change review.
- `advanced_reports`: included from Pro. Intended for richer cash flow, debt aging, tax, and stock decision reports.

## Product Positioning

Free or trial users can understand the daily money workflow before paying: balances, sales, expenses, credit sales, supplier bills, stock, people, and basic dashboard views.

Starter is the first paid value point: it should make the owner confident that records can be handed to an accountant.

Growth should feel like time saved every day: category suggestions and receipt extraction belong close to money capture, not hidden only inside billing.

Pro should feel like control: staff access, accountant access, audit visibility, and advanced reports should be shown where owners manage operations and reports.

## Payment Rules

- Checkout starts only for authenticated admins with access to the selected business.
- Paystack initializes the transaction and returns a hosted checkout URL.
- SME Moneybook creates a pending subscription before redirecting.
- Activation requires Paystack verification or a signed `charge.success` webhook.
- Subscription periods currently run for 30 days from `paidAt`.
- Full card details are never stored by SME Moneybook.

## Release Checklist

- Confirm Paystack live keys and webhook secret are set.
- Confirm `/api/billing/status` reports billing as live only when required keys exist.
- Confirm each feature route returns `402` when the business has no active eligible subscription.
- Confirm the billing page explains price, audience, and included features.
- Confirm failed or duplicate webhooks do not create duplicate active periods.
