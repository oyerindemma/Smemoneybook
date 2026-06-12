# Subscription Payment Plan

SME Moneybook should sell plans around business outcomes, not around technical modules. The current payment processor is Paystack, with monthly NGN pricing stored in `src/lib/billing/plans.ts` and subscriptions activated only after server-side verification or signed webhook confirmation.

The commercial goal is a freemium ladder: free users should quickly understand the daily money workflow, but serious businesses should hit natural limits that make a paid plan the practical choice.

## Current Implementation

| Area | Current state | Revenue risk |
| --- | --- | --- |
| Paid checkout | Paystack checkout, verification, webhook activation, and active subscription lookup exist. | Good foundation. |
| Starter gate | `basic_exports` is enforced on `/api/accountant/export`. | Good first paid value point. |
| Growth gates | `ai_category_assist` and `receipt_extraction` are enforced on `/api/assist/categorize` and `/api/receipts`. | Good daily productivity value. |
| Pro gates | `team_management`, `audit_tools`, and `advanced_reports` are listed in plan metadata. | Not fully enforced yet, so free users can still access some Pro-positioned operations. |
| Free limits | No formal usage caps found for transaction count, inventory items, customers, suppliers, reports, or business age. | Free can become "good enough" for many users, reducing conversion. |

## Recommended Free Version

Free should be useful enough to prove value in the first week, but capped before a real business can run on it indefinitely.

| Capability | Free allowance | Upgrade trigger |
| --- | ---: | --- |
| Business workspace | 1 business | More businesses require Starter. |
| Transactions | 30 lifetime records or 14 active days, whichever comes first | Recording more money requires Starter. |
| Customers and suppliers | 10 total people | More contacts require Starter. |
| Inventory items | 10 items | More stock tracking requires Starter. |
| Reports | Dashboard view plus current month preview | Saved reports, past-period reports, CSV/PDF/export require Starter or Pro depending on depth. |
| AI assist and receipts | 3 combined demo actions | Continued use requires Growth. |
| Staff/accountant access | Owner only | Any staff or accountant invite requires Pro. |
| Audit trail | Last 3 events only | Full audit history requires Pro. |
| Messaging automation | Manual note/reminder only | WhatsApp/SMS reminders, invoices, and stock alerts require Growth or Pro. |

Do not make free feel broken. Let users record enough activity to see cash balance, debt, stock, and profit. Then put the paywall exactly where business dependence begins: continued records, exports, team access, automation, and compliance-style reporting.

## Plan Ladder

| Plan | Current price | Recommended price test | Best for | Main paid reason |
| --- | ---: | ---: | --- | --- |
| Starter | ₦3,500/month | ₦3,500/month | Solo traders and micro shops leaving notebooks or spreadsheets | Keep recording after free limits, accountant export, basic backup, current and past reports. |
| Growth | ₦7,000/month | ₦7,000/month | SMEs recording daily sales, expenses, stock, and customer credit | Save daily time with AI category assist, receipt extraction, and customer/supplier reminder automation. |
| Pro | ₦12,000/month | ₦12,000/month | Multi-staff businesses and accountant-managed books | Control the business with staff/accountant roles, audit trail, advanced reports, and stronger backups. |

Keep Starter affordable and make Growth the recommended plan. Growth should feel like the obvious value plan for active SMEs because it removes daily admin work, not just because it has more features.

## Package Functionality

| Feature | Free | Starter | Growth | Pro |
| --- | --- | --- | --- | --- |
| Money in/out records | Limited | Unlimited | Unlimited | Unlimited |
| Customers, suppliers, debts | Limited | Unlimited | Unlimited | Unlimited |
| Inventory tracking | Limited | Unlimited basics | Unlimited plus stock alerts | Unlimited plus staff controls |
| Dashboard summaries | Current overview | Current and historical summaries | Current and historical summaries | Current and historical summaries |
| Accountant CSV export | No | Yes | Yes | Yes |
| Backup export | No | Basic owner backup | Basic owner backup | Full backup with audit context |
| AI category assist | Demo only | No | Yes | Yes |
| Receipt extraction | Demo only | No | Yes | Yes |
| WhatsApp/SMS reminders | Manual note only | Manual note only | Customer and supplier reminders | Customer and supplier reminders with team oversight |
| Saved report snapshots | No | Basic snapshots | Basic snapshots | Advanced snapshots and comparisons |
| Advanced reports | No | No | No | Cash flow, debt aging, tax review, stock decisions |
| Team/accountant access | No | No | No | Yes |
| Audit tools | Last 3 events | Export activity only | Export and automation activity | Full audit trail |

## Feature Gates

- `basic_exports`: included from Starter. Currently enforced on `/api/accountant/export`.
- `ai_category_assist`: included from Growth. Currently enforced on `/api/assist/categorize`.
- `receipt_extraction`: included from Growth. Currently enforced on `/api/receipts`.
- `team_management`: included from Pro. Should be enforced on `/api/staff/invitations` and any future member-management routes.
- `audit_tools`: included from Pro. Should be enforced before returning full audit logs from `/api/operations`.
- `advanced_reports`: included from Pro. Should be enforced on advanced report exports, historical comparisons, debt aging detail, tax review, and stock decision reports.

## Upgrade Moments

- After 20 records, show "You are close to the free record limit" near the quick capture flow.
- At 30 records, block new money records until Starter checkout.
- When a user clicks CSV/PDF/accountant export, explain that this is the paid handoff feature.
- When receipt extraction or AI category assist returns a 402, show Growth as the recommended plan.
- When an owner opens staff invitations, audit trail, or full operations history, show Pro.
- When a customer debt reminder is sent through WhatsApp/SMS, show Growth unless the business needs team controls, then position Pro.

## Enforcement Backlog

1. Add a free usage-limit helper that counts active business records and returns `402` with the plan needed.
2. Enforce Starter limits on transaction creation, customers, suppliers, inventory items, report snapshots, and backup export.
3. Enforce Growth on automated WhatsApp/SMS debt reminders, invoices, payment confirmations, stock alerts, AI category assist, and receipt extraction.
4. Enforce Pro on staff invitations, full audit logs, member lists beyond owner, and advanced reports.
5. Update `UpgradePrompt` so it opens the billing page or starts the correct Paystack plan instead of showing "Upgrade checkout is not ready yet."
6. Add billing-aware UI state so paid users see "Current plan" and free users see contextual upgrade CTAs.
7. Add tests for every route that should return `402` without the required active subscription.

## Payment Rules

- Checkout starts only for authenticated admins with access to the selected business.
- Paystack initializes the transaction and returns a hosted checkout URL.
- SME Moneybook creates a pending subscription before redirecting.
- Activation requires Paystack verification or a signed `charge.success` webhook.
- Subscription periods currently run for 30 days from `paidAt`.
- Full card details are never stored by SME Moneybook.

## Release Checklist

- Confirm Paystack live public and secret keys are set.
- Confirm `/api/billing/status` reports billing as live only when required keys exist.
- Confirm each feature route returns `402` when the business has no active eligible subscription.
- Confirm free caps are enforced server-side, not only hidden in the UI.
- Confirm the billing page explains price, audience, and included features.
- Confirm failed or duplicate webhooks do not create duplicate active periods.
