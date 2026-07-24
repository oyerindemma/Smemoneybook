# SME MoneyBook Phase 3 Canonical Metric Definitions

Status: Phase 3A baseline.

These definitions are the source contract for AI answers, health scores, forecasts, alerts, and executive dashboards. If a metric is not defined here or in a versioned successor document, AI must not present it as an official SME MoneyBook metric.

## Metric Versioning

- Current metric definition version: `phase3-metrics-v1`.
- Metric outputs must include `metricVersion`, `generatedAt`, `businessId`, optional `locationId`, period start/end, source tables, and confidence.
- A metric may be shown as recorded, estimated, forecast, or recommendation.
- If calculation inputs change materially, create a new metric version and preserve old snapshots for historical reports.

## Common Filters

| Filter | Definition |
| --- | --- |
| Business scope | Records where `businessId` equals the active authorized business |
| Location scope | Records for a selected active location, when the user is authorized for that location |
| Period | Inclusive start and exclusive end timestamps unless a report explicitly says otherwise |
| Reversed records | Exclude reversed transactions from normal totals unless the metric is about reversals |
| Currency | Use the business currency, default `NGN` |
| Tax | Separate tax estimates from sales/profit unless a tax-specific metric is requested |

## Source Citation Shape

Every AI-facing metric should be returned in this shape or a compatible superset:

```ts
type SourceMetric<T> = {
  id: string;
  metricVersion: "phase3-metrics-v1";
  kind: "recorded" | "estimated" | "forecast" | "recommendation";
  businessId: string;
  locationId?: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  sourceTables: string[];
  confidence: "high" | "medium" | "low" | "insufficient_data";
  dataWarnings: string[];
  value: T;
};
```

The model may see the metric values and safe labels, not raw unrestricted database rows.

## Financial Metrics

### Recorded Sales

Recorded sales are the sum of non-reversed sale transactions in the selected period and scope.

- Source: `Transaction`
- Include: `type = SALE`, business-scoped, optional location-scoped, not reversed
- Exclude: estimates, unpaid customer debt not recorded as a sale, reversed transactions
- Confidence: high when records exist and no reconciliation warnings are present

### Recorded Expenses

Recorded expenses are the sum of non-reversed expense transactions in the selected period and scope.

- Source: `Transaction`
- Include: `type = EXPENSE`, business-scoped, optional location-scoped, not reversed
- Exclude: supplier bills not recorded as an expense unless the bill is represented by a transaction
- Warning: classify uncategorized expenses separately

### Gross Profit From Recorded Transactions

Gross profit is recorded sales minus recorded cost of goods sold for product-linked sale transactions.

- Source: `Transaction`, `InventoryItem`
- Use only recorded cost fields available at transaction time or the item cost when no snapshot exists
- Warning: if cost snapshot is missing, label the result estimated

### Operating Profit Snapshot

Operating profit snapshot is recorded sales minus recorded expenses for the selected period.

- Source: `Transaction`
- This is not audited accounting profit.
- Always label as recorded from SME MoneyBook entries.

### Cash Movement

Cash movement is money received minus money paid through recorded payment allocations.

- Source: `TransactionPayment`, `Account`
- Include: paid allocations in the selected period
- Exclude: unpaid/credit portions until payment is recorded

### Cash Available

Cash available is the current sum of account balances in active cash/bank/mobile-money accounts.

- Source: `Account`
- Warning: confidence depends on how consistently the owner records transactions and reconciles bank imports.

## Debt Metrics

### Customer Debt Outstanding

Customer debt outstanding is the sum of open customer debt balances.

- Source: `Debt`, `Customer`
- Include: debts linked to customers and not fully settled
- Ageing buckets: current, 1-7 days overdue, 8-30, 31-60, 61-90, over 90
- Warning: if due date is missing, show as unaged debt

### Supplier Bills Outstanding

Supplier bills outstanding is the sum of open supplier debt balances.

- Source: `Debt`, `Supplier`
- Include: debts linked to suppliers and not fully settled
- Ageing buckets match customer debt.

## Inventory Metrics

### Quantity On Hand

Quantity on hand is the current stock count for the business or selected location.

- Source: `InventoryItem`, `InventoryBalance`
- If location is selected, prefer `InventoryBalance`.
- If no location balances exist, use business-level item quantity and label as business-wide.

### Inventory Value At Cost

Inventory value at cost is quantity on hand times cost price.

- Source: `InventoryItem`, `InventoryBalance`
- Warning: missing or zero cost price lowers confidence.

### Low Stock Items

Low stock items are products where quantity on hand is at or below the configured low-stock level.

- Source: `InventoryItem`, `InventoryBalance`
- Do not infer low-stock threshold if it is missing.

### Days Of Stock Remaining

Days of stock remaining is quantity on hand divided by average daily sales quantity.

- Source: `Transaction`, `InventoryItem`, `InventoryBalance`
- Minimum threshold: at least 14 days of sales history and 5 product sale events.
- If threshold is not met, show current stock only.

### Inventory Forecast

Inventory forecast estimates product-level demand, stockout timing, and suggested reorder quantity.

- Current formula: `inventory-forecast-v1`
- Source: `InventoryItem`, `InventoryBalance`, `InventoryMovement`
- Demand source: stock-out movements with stock-out adjustment type
- Exclude from demand: damaged, expired, lost, theft, personal use, promotional giveaway, transfer, and other non-demand reductions
- Minimum threshold: 14 days of history and 5 demand movements per product
- Location scope: prefer location balance and location movement records when `locationId` is supplied
- Output: classification, confidence, current quantity, low-stock level, average/recent/forecast demand, days remaining, predicted stockout date, restock-by date, suggested reorder quantity, assumptions, recommendation, warnings, source metrics, and backtest result
- Manual overrides: supplier lead time, safety-stock days, safety-stock quantity, and minimum reorder quantity
- Forecasts must not create purchase orders, stock entries, transfers, or supplier messages automatically

## Health Score Metrics

Health score is a transparent composite, not a black-box model.

Initial version: `health-score-v1`.

| Component | Weight | Inputs | Insufficient-data behavior |
| --- | ---: | --- | --- |
| Recording consistency | 15 | Days with records in the last 30 days | New users are not penalized in first 14 days |
| Sales trend | 15 | Current period sales vs prior comparable period | Mark neutral if fewer than 5 sale records |
| Profit trend | 15 | Operating profit snapshot trend | Mark low confidence if cost/expense data incomplete |
| Expense control | 10 | Expense-to-sales movement | Mark neutral if sales are insufficient |
| Cash coverage | 10 | Cash available vs recent average daily expenses | Mark low confidence without account balances |
| Customer debt ageing | 10 | Overdue customer debt total and count | Mark neutral if no customer debt records |
| Supplier bill ageing | 5 | Overdue supplier bills | Mark neutral if no supplier bills |
| Inventory health | 10 | Low-stock count and inventory value quality | Mark low confidence without stock tracking |
| Data completeness | 10 | Missing categories, customers, suppliers, locations, tax settings | Always available |

The UI must show each component, its reason, and at least one actionable next step when the score is below target.

## Forecast Metrics

### Cashflow Forecast

Cashflow forecast estimates future cash position for 7, 30, and 90 days.

- Current formula: `cashflow-forecast-v1`
- Source: paid sale transactions, paid expense transactions, current account balances, due-dated customer debts, due-dated supplier bills, repeated expense patterns
- Output: recorded cutoff, forecast horizon, opening cash, projected inflows, projected outflows, projected ending cash, lower/upper confidence range, assumptions, warnings, alerts, and backtest result
- Minimum threshold: 30 days and 8 paid cash transactions for 7-day forecast, 60 days and 15 paid cash transactions for 30-day forecast, 120 days and 30 paid cash transactions for 90-day forecast
- Location scope: transaction and source-debt locations are filtered when supplied; current cash remains business-wide until accounts support location balances
- If threshold is not met, show insufficient-data explanation and recorded facts only
- Forecasts must display recorded values separately from forecast values and must state that predictions are not guarantees

### Forecast Accuracy

Forecast accuracy compares prior forecasted value with actual recorded value for the same horizon.

- Source: stored forecast snapshots and later recorded metrics
- Store: absolute error, percent error, horizon, generatedAt, evaluatedAt
- Initial Phase 3D snapshots store in-line backtest results and nullable future evaluation fields

## Bank Reconciliation Metrics

### Statement Import Row

Statement import row is a normalized bank-statement line awaiting reconciliation.

- Current version: `bank-reconciliation-v2`
- Source: user-imported CSV
- Required fields: posted date, amount or debit/credit, description
- Normalized fields: postedAt, valueDate, amount, debitAmount, creditAmount, signedAmount, direction, description, normalizedDescription, reference, externalReference, balance, fingerprint, duplicateStatus, status
- Duplicate detection: date, amount, direction, normalized description, reference, and external reference fingerprint
- Status values: `UNMATCHED`, `SUGGESTED`, `MATCHED`, `DUPLICATE`, `IGNORED`
- Duplicate status values: `UNIQUE`, `PROBABLE_DUPLICATE`, `CONFIRMED_DUPLICATE`

### Reconciliation Match Confidence

Reconciliation match confidence is a deterministic score from 0 to 100.

- Source: `BankStatementImportRow`, `Transaction`, `Account`
- Signals: amount equality, date proximity, direction, account match, description/customer/supplier overlap, reference match, payment status, transfer direction
- Exclude: reversed transactions, reversal records, and adjustment-only transactions unless a dedicated review flow is introduced
- Match types: `exact`, `date_tolerant`, `reference_based`, `description_based`, `amount_only`, `manual`, `missing_record`, `duplicate`
- Human review is required before a suggested match becomes confirmed
- Split and grouped match types remain reserved for a later workflow and are not auto-produced in this release

### Reconciliation Lock

Reconciliation lock records that imported rows were reviewed for a statement version.

- Source: `BankStatementImport`, `BankStatementImportRow`, `BankReconciliationMatch`
- Lock condition: no unresolved `UNMATCHED`, `SUGGESTED`, or `DUPLICATE` rows
- Reopen behavior: preserve rows and matches, clear lockedAt, set reopenedAt, increment version
- Locked reconciliation must not be modified without explicit reopen

### Reconciliation Action Ledger

Reconciliation actions preserve reviewer intent separately from accounting data.

- Source: `BankReconciliationAction` plus `AuditLog`
- Actions: import preview, import created, match suggested, match confirmed, match rejected, manual match created, match unmatched, entry ignored, entry reopened, import locked, import reopened, exported
- Required audit facts: businessId, performedByUserId, optional statementEntryId, optional matchId, action, reason, timestamp, and safe metadata
- These records must not create transactions, alter account balances, delete statement rows, or connect to bank accounts

## Alert Metrics

Alerts must include trigger reason, source period, impact estimate, confidence, and feedback state.

Initial alert definitions:

- Revenue drop: current period recorded sales is at least 25 percent below prior comparable period, with minimum 5 sale records in each period.
- Expense spike: current period recorded expenses is at least 30 percent above trailing median comparable period.
- Duplicate transaction: same amount, type, date proximity, and similar description/customer/supplier.
- Low cash coverage: cash available is below 7 days of recent average daily expenses.
- Stockout risk: days of stock remaining is below supplier lead time plus safety stock.
- Customer payment slowdown: average overdue days increased by at least 20 percent vs prior period.

Never phrase an alert as an accusation. Use review-oriented language.

## Tax Metrics

Tax outputs are recordkeeping estimates, not filing advice.

- Sources: `Business`, `BusinessTaxProfile`, `TaxRuleSet`, `TaxRule`, `Transaction`, `DocumentTaxSnapshot`, `BankStatementImportRow`, `BankReconciliationMatch`
- Current rule-set version: `ng-federal-2026-preview-v1`
- Tool/prompt versions: `tax-assistant-tools-v1`, `tax-assistant-preview-v1`
- Flags: `PHASE3_AI_ENABLED`, `PHASE3_TAX_ASSISTANT_ENABLED`, `NEXT_PUBLIC_PHASE3_TAX_ASSISTANT_ENABLED`
- Use versioned, verified Nigeria federal rules only; if a rule set is missing or unverified, estimates must show `taxRuleRequiresVerification`.
- Output VAT: taxable sale base x verified VAT rate; tax-inclusive records use `gross - gross / (1 + rate)`.
- Eligible input VAT: eligible expense base x verified VAT rate; expenses missing receipt, invoice, or tax snapshot evidence are excluded from eligible input VAT and surfaced as review items.
- Net VAT estimate: output VAT estimate - eligible input VAT estimate.
- WHT position: total only explicit recorded WHT amount, WHT rate, or transaction metadata; never infer WHT category/rate from description.
- Estimated tax due: max(net VAT estimate - recorded WHT deducted by customers, 0).
- Data-quality outputs include missing category, missing supplier/customer, missing receipt/invoice, missing tax treatment, duplicate, reversed, unreconciled transaction, unreconciled bank entry, missing VAT status, and unverified rule-set review items.
- Readiness score: 20 rule verification + 20 profile completion + 25 data completeness + 15 reconciliation coverage + 20 critical-issue clearance.
- Exports: CSV working paper from `GET /api/tax-assistant/export`; no filing, payment, ledger mutation, tax-setting write, or automatic classification action.
- Disclaimer: "This report is an estimate based on records available in SME MoneyBook. It is not a filed tax return and does not replace advice from a qualified tax professional or confirmation from the relevant tax authority."

## Loan Readiness Metrics

Loan readiness is a preparation assessment, not a lending decision.

- Current formula: `loan-readiness-v1`
- Inputs: business age, revenue consistency, profit consistency, cashflow stability, customer concentration, debt burden, record completeness, collection history, inventory turnover where available
- Output: readiness score, rating, confidence, components, strengths, weaknesses, data completeness, source metrics, next steps, disclaimer
- Snapshot table: `LoanReadinessSnapshot`
- Sharing log table: `LoanReadinessSharingLog`
- Partner sharing requires explicit consent and does not occur automatically in the foundation implementation
- Disclaimer: "This is not loan approval and does not guarantee credit."

## Bank Reconciliation Metrics

Bank reconciliation outputs must be idempotent and auditable.

- Import identity: file checksum plus business ID plus account ID
- Match confidence: amount match, date proximity, normalized description similarity, customer/supplier/reference hints
- Human approval is required before locking a reconciliation.
- Locked reconciliations require a safe reopening workflow; do not mutate silently.

## Cooperative Ledger Metrics

Cooperative funds are separate from the normal business ledger.

- Current formula: `cooperative-ledger-v1`
- Source: `CooperativeGroup`, `CooperativeMember`, `CooperativeContributionPlan`, `CooperativeContribution`, `CooperativeLoan`, `CooperativeLoanRepayment`, `CooperativeExpense`, `CooperativeDistribution`, `CooperativeLedgerEntry`
- Member ledger balance: member ledger credits minus member ledger debits
- Group cash balance: contributions plus repayments minus loan disbursements, expenses, and distributions
- Loan outstanding: total due minus repayments, capped at zero
- Contribution arrears: expected scheduled contributions minus recorded contributions, plus configured penalties after grace period
- Integrity rule: each ledger entry must be nonnegative and must contain either a debit or credit, not both

## Payroll Metrics

Payroll outputs are recordkeeping snapshots, not legal, tax, or pension advice.

- Current rule version: `payroll-ng-foundation-v1`
- Source: `PayrollEmployee`, `PayrollRun`, `PayrollRunItem`, `PayrollJournalEntry`
- Gross pay: base pay plus allowances plus bonuses
- Total deductions: deductions plus loans/advances plus employee pension plus configured tax amount
- Net pay: gross pay minus total deductions, capped at zero with a warning when deductions exceed gross
- Employer pension: recorded separately from net pay
- Completed runs: approved and locked runs cannot be recalculated; reverse and recreate instead
- Journal behavior: payroll journal entries remain pending until an explicit future posting flow creates normal business transactions

## Staff Performance Metrics

Staff performance metrics must be business-performance metrics, not hidden surveillance.

- Current formula: `staff-performance-v1`
- Source: `AuditLog`, `BusinessMember`, `StaffPerformanceGoal`, `StaffPerformanceSnapshot`, optional explicit `metadata.locationId`
- Examples: sales recorded, revenue handled where explicit amount metadata exists, transactions processed, returns processed, debt actions, goal progress
- Requirements: role-based visibility, transparent definitions, coaching-oriented language
- Attendance requires separate consented attendance implementation.
- Revenue must not be parsed from audit-log free text. If source metadata lacks an amount, revenue handled stays unavailable.

## WhatsApp Automation Metrics

WhatsApp automation must respect consent, template approval, quiet hours, rate limits, and opt-out state.

- Current policy: `whatsapp-automation-policy-v1`
- Source: `AutomationPreference`, `WhatsAppAutomationContact`, `WhatsAppAutomationTemplate`, `WhatsAppAutomationJob`, `WhatsAppMessage`, `WhatsAppEvent`
- Queue health: queued, sent, failed, skipped, failure rate, total cost
- Consent metric: contacts by `PENDING`, `OPTED_IN`, and `OPTED_OUT`
- Template metric: templates by `PENDING`, `APPROVED`, `REJECTED`, and `PAUSED`
- Cost metric: sum of job `costKobo`, with message provider reconciliation still required before billing-grade reporting
- Safety metric: skipped jobs due to quiet hours, missing consent, opt-out, or unapproved template

## AI Marketing Metrics

AI Marketing outputs are drafts until a user reviews them.

- Current draft model: `marketing-draft-template-v1`
- Source: `MarketingDraft`, `MarketingDraftFeedback`, optional `InventoryItem` when product-data permission is granted
- Draft status: `DRAFT`, `APPROVED`, `REJECTED`, `ARCHIVED`
- Review metric: approved/rejected drafts and feedback ratings
- Safety metric: warnings by severity, including missing product permission and potentially misleading claims
- Product-data rule: never include price or stock unless the user explicitly permits product data for the draft
- Send rule: no send metric exists until a separate reviewed publishing/sending workflow is implemented

## Executive Dashboard Metrics

Executive Dashboard is a read-only owner decision view over recorded business data.

- Current formula: `executive-dashboard-v2`
- Source: `Transaction`, `Debt`, `InventoryItem`, `InventoryBalance`, `BusinessLocation`, `StockTransfer`, `BankStatementImportRow`, Staff Performance deterministic summary, Tax Assistant deterministic summary, `AuditLog`
- Total sales: sum of non-reversed `SALE` transactions in the selected period
- Paid sales: sum of non-reversed `SALE` transactions where `paymentStatus = PAID`
- Credit sales: selected-period sales minus paid sales
- Average sale value: total sales divided by selected-period sale count; insufficient data when sale count is zero
- Total expenses: sum of non-reversed `EXPENSE` transactions in the selected period
- Expense categories: selected-period expenses grouped by transaction category, using `Uncategorized` where missing
- Recorded gross profit: sum of recorded `Transaction.profit` for non-reversed selected-period sales
- Estimated net operating result: recorded gross profit minus selected-period expenses
- Margin percentage: recorded gross profit divided by total sales
- Recorded cash inflows: paid sales recorded in SME MoneyBook; this excludes unrecorded bank deposits
- Recorded cash outflows: recorded expenses in SME MoneyBook
- Recorded net cash movement: recorded cash inflows minus recorded cash outflows
- Bank-reconciled amount: absolute imported bank-row amount where row status is `MATCHED`
- Bank-unreconciled amount: absolute imported bank-row amount where row status is `UNMATCHED` or `SUGGESTED`
- Customer debt: current open customer debts minus paid amount
- Overdue customer debt: current open customer debts with `dueAt` before calculation time
- Supplier obligations: current open supplier debts minus paid amount
- Overdue supplier obligations: current open supplier debts with `dueAt` before calculation time
- Stock cost value: location-scoped quantity on hand, where available, times recorded cost price
- Potential stock revenue: location-scoped quantity on hand, where available, times recorded selling price
- Potential stock profit: potential stock revenue minus stock cost value
- Low-stock items: stock items with quantity on hand less than or equal to the low-stock level
- Slow-moving stock: in-stock items without selected-period sales, ordered by stock cost value
- Warehouse count: active business locations
- Pending transfers: transfers in `DRAFT`, `APPROVED`, `IN_TRANSIT`, or `PARTIALLY_RECEIVED`
- Staff active count, attributed sales and unattributed activity: reused from Staff Performance; not an employment ranking
- Reconciliation rate: matched imported bank-row amount divided by total imported bank-row amount
- Duplicate amount: imported bank-row amount where row status is `DUPLICATE` or duplicate status is not `UNIQUE`
- Tax VAT/WHT/readiness: reused from deterministic Tax Assistant summary; not a filed return
- Stock concentration: largest stock item cost value divided by total stock cost value
- Data-quality trend: `100 - (material disclosure note count * 10)`, capped at zero
- Comparison: each period compares against the immediately preceding equal-duration UTC window
- Freshness: latest selected-period transaction timestamp, latest imported bank timestamp and dashboard generation timestamp
- Disclosure rule: every metric output must include formula id, source service, period, comparison period, data-quality status, last-calculated timestamp and business scope

## Predictive Alert Metrics

Predictive Alerts are review signals, not accusations or guarantees.

- Current rule version: `predictive-alerts-v1`
- Source: `Transaction`, `CustomerReturn`, `Debt`, `InventoryItem`, `InventoryMovement`, `BankStatementImport`, `CashflowForecastSnapshot`, `PredictiveAlert`, `PredictiveAlertFeedback`
- Alert confidence: deterministic confidence derived from sample count plus signal strength, capped between 0 and 1
- Impact amount: estimated amount at risk where meaningful; zero when the signal is operational rather than monetary
- Source period: the current comparison period or forecast horizon that caused the alert
- Revenue drop: current recorded sales compared with previous period recorded sales
- Expense spike: current recorded expenses compared with previous period recorded expenses
- Duplicate transaction: similar type, amount, date, account, and normalized description in the current period
- Payment slowdown: overdue customer debt relative to recent recorded revenue
- Precision metric: confirmed alerts divided by confirmed plus incorrect alerts
- False-positive metric: alerts marked `incorrect`

## AI Evaluation Metrics

AI Evaluation observes AI quality and safety without storing sensitive answer content.

- Current version: `ai-evaluation-v1`
- Source: `AiEvaluationEvent`, `AiEvaluationDataset`, `AiEvaluationRun`, assistant message metadata, marketing draft feedback, predictive alert feedback
- Request volume: count of events where `eventType = request`
- Feedback count: count of events where `eventType = feedback`
- Helpful rate: helpful/correct ratings divided by helpful/not-helpful/correct/incorrect ratings
- Recommendation acceptance rate: accepted recommendations divided by accepted plus rejected recommendations
- Categorization accuracy: correct events divided by correct plus incorrect events
- Correction rate: feedback events with a user correction divided by all feedback events
- Tool failure rate: failed tool calls divided by all tool calls
- Latency: average and p95 `latencyMs`
- Cost: sum of `costKobo`, treated as an estimate until provider billing reconciliation exists
- Dataset controls: `piiRedacted`, `consentRequired`, retention policy, and sample count are required for dataset records

## Admin AI Operations Metrics

Admin AI Operations is aggregate-only and must not expose sensitive business content.

- Source: `AiEvaluationEvent`, `AiEvaluationDataset`, `AiEvaluationRun`, `PredictiveAlertFeedback`, `CashflowForecastSnapshot`, `WhatsAppAutomationJob`, `BankStatementImport`, `BankStatementImportRow`, `TaxAssistantSnapshot`, `PayrollRun`, `CooperativeLoan`, `BusinessHealthScoreSnapshot`, `AuditLog`
- AI request volume: evaluation request events in the last 30 days
- AI cost: sum of evaluation event cost estimates
- AI latency: average and p95 evaluation event latency
- Tool failure rate: failed tool calls divided by total tool calls
- Anomaly precision: confirmed predictive alerts divided by confirmed plus incorrect predictive alerts
- Forecast accuracy: average evaluated cashflow forecast `accuracyPercent`
- WhatsApp message health: sent, queued, failed, and failure rate from automation jobs
- Reconciliation backlog: unmatched bank statement rows
- At-risk businesses: businesses with health score below 45 in recent snapshots
- Customer-success interventions: audited `customer_success.*` actions

## Metric Release Checklist

Before a metric can power an AI answer:

- Definition exists in this document or a versioned successor.
- Server-side tool enforces auth and tenant boundaries.
- Tests cover happy path, missing data, outliers, and cross-tenant denial.
- Output includes period, source tables, freshness, confidence, and warnings.
- User-facing copy distinguishes recorded, estimated, forecast, and recommendation.
- Monitoring records latency, cost where applicable, failures, and feedback.
