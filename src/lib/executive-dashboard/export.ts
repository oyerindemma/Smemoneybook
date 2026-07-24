import type { ExecutiveDashboardSummary } from "@/lib/executive-dashboard/definitions";

export function executiveDashboardCsvFilename(summary: ExecutiveDashboardSummary) {
  const start = summary.period.start.slice(0, 10);
  const end = summary.period.end.slice(0, 10);
  return `executive-dashboard-${start}-${end}.csv`;
}

export function executiveDashboardToCsv({
  summary,
  generatedBy,
}: {
  summary: ExecutiveDashboardSummary;
  generatedBy: string;
}) {
  const rows: string[][] = [
    ["section", "metric", "value", "comparison", "formula", "source", "data_quality", "notes"],
    ["business", "name", summary.business.name, "", "", "", "", ""],
    ["business", "period", `${summary.period.start} to ${summary.period.end}`, "", "", "", "", ""],
    ["business", "comparison_period", `${summary.comparisonPeriod.start} to ${summary.comparisonPeriod.end}`, "", "", "", "", ""],
    ["business", "generated_by", generatedBy, "", "", "", "", ""],
    ["business", "generated_at", summary.generatedAt, "", "", "", "", ""],
  ];

  const addMetric = (section: string, name: string, metric: { value: unknown; comparisonValue?: unknown; formulaId: string; sourceService: string; dataQualityStatus: string; notes?: string[] }) => {
    rows.push([
      section,
      name,
      stringify(metric.value),
      stringify(metric.comparisonValue ?? ""),
      metric.formulaId,
      metric.sourceService,
      metric.dataQualityStatus,
      metric.notes?.join("; ") ?? "",
    ]);
  };

  addMetric("headline", "sales", summary.headline.sales);
  addMetric("headline", "expenses", summary.headline.expenses);
  addMetric("headline", "profit", summary.headline.profit);
  addMetric("headline", "customers_owing", summary.headline.customersOwing);
  addMetric("headline", "supplier_bills", summary.headline.supplierBills);
  addMetric("headline", "stock_value", summary.headline.stockValue);
  addMetric("headline", "bank_entries_to_review", summary.headline.bankEntriesToReview);
  addMetric("headline", "tax_items_to_review", summary.headline.taxItemsToReview);
  addMetric("revenue", "paid_sales", summary.revenue.paidSales);
  addMetric("revenue", "credit_sales", summary.revenue.creditSales);
  addMetric("revenue", "average_sale_value", summary.revenue.averageSaleValue);
  addMetric("profit", "gross_profit", summary.profit.recordedGrossProfit);
  addMetric("profit", "margin_percentage", summary.profit.marginPercentage);
  addMetric("cash", "recorded_inflows", summary.cash.recordedInflows);
  addMetric("cash", "recorded_outflows", summary.cash.recordedOutflows);
  addMetric("cash", "net_movement", summary.cash.netMovement);
  addMetric("cash", "bank_reconciled_amount", summary.cash.bankReconciledAmount);
  addMetric("cash", "bank_unreconciled_amount", summary.cash.bankUnreconciledAmount);
  addMetric("receivables", "overdue_customer_debt", summary.receivables.overdueCustomerDebt);
  addMetric("payables", "overdue_supplier_obligations", summary.payables.overdueObligations);
  addMetric("stock", "low_stock_items", summary.stock.lowStockItems);
  addMetric("stock", "pending_transfers", summary.stock.pendingTransfers);
  addMetric("reconciliation", "reconciliation_rate", summary.reconciliation.reconciliationRate);
  addMetric("tax", "estimated_vat_position", summary.taxReadiness.estimatedVatPosition);
  addMetric("tax", "wht_recorded", summary.taxReadiness.whtRecorded);
  addMetric("tax", "data_completeness", summary.taxReadiness.dataCompleteness);
  addMetric("tax", "verified_rule_set_version", summary.taxReadiness.verifiedRuleSetVersion);
  addMetric("staff", "active_staff", summary.staff.activeStaff);
  addMetric("staff", "sales_attributed_to_staff", summary.staff.salesAttributedToStaff);
  addMetric("staff", "unattributed_activity", summary.staff.unattributedActivity);

  for (const item of summary.attentionQueue) {
    rows.push([
      "attention",
      item.title,
      stringify(item.amount ?? item.count ?? ""),
      "",
      "",
      item.sourceService,
      item.severity,
      `${item.detail} ${item.actionLabel}`.trim(),
    ]);
  }

  for (const note of summary.dataQuality.notes) {
    rows.push(["data_quality", "note", note, "", "", "ExecutiveDashboard", summary.dataQuality.status, ""]);
  }

  for (const assumption of summary.assumptions) {
    rows.push(["assumption", "note", assumption, "", "", "ExecutiveDashboard", "", ""]);
  }

  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

function stringify(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }

  return String(value ?? "");
}

function csvEscape(value: string) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
