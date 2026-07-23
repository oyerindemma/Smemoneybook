import type { TaxAssistantSummary } from "@/lib/tax-assistant/definitions";

export function exportTaxWorkingPaper(summary: TaxAssistantSummary) {
  const rows: string[][] = [
    ["section", "metric", "value", "source"],
    ["business", "business_name", summary.businessName, "Business"],
    ["business", "jurisdiction", summary.jurisdiction, "BusinessTaxProfile"],
    ["business", "rule_set_version", summary.ruleSetVersion, "TaxRuleSet"],
    ["business", "rule_set_status", summary.ruleSetStatus, "TaxRuleSet"],
    ["period", "period_start", summary.periodStart, "request"],
    ["period", "period_end", summary.periodEnd, "request"],
    ["summary", "taxable_sales", String(summary.figures.taxableSales), "Transaction"],
    ["summary", "exempt_sales", String(summary.figures.exemptSales), "Transaction"],
    ["summary", "zero_rated_sales", String(summary.figures.zeroRatedSales), "Transaction"],
    ["summary", "output_vat_estimate", String(summary.figures.outputVatEstimate), "Transaction,TaxRule"],
    ["summary", "eligible_input_vat_estimate", String(summary.figures.eligibleInputVatEstimate), "Transaction,TaxRule"],
    ["summary", "net_vat_estimate", String(summary.figures.netVatEstimate), "calculation"],
    ["summary", "wht_deducted_by_customers", String(summary.figures.whtDeductedByCustomers), "Transaction.taxMetadata"],
    ["summary", "wht_deducted_from_suppliers", String(summary.figures.whtDeductedFromSuppliers), "Transaction.taxMetadata"],
    ["summary", "estimated_tax_due", String(summary.figures.estimatedTaxDue), "calculation"],
    ["data_quality", "data_completeness_rate", String(summary.figures.dataCompletenessRate), "Tax Assistant"],
    ["data_quality", "tax_readiness_score", String(summary.figures.taxReadinessScore), "Tax Assistant"],
    ["data_quality", "unresolved_tax_impacting_amount", String(summary.figures.unresolvedTaxImpactingAmount), "Transaction,BankStatementImportRow"],
    ["counts", "included_transaction_count", String(summary.counts.includedTransactionCount), "Transaction"],
    ["counts", "unreconciled_bank_entry_count", String(summary.counts.unreconciledBankEntryCount), "BankStatementImportRow"],
  ];

  for (const formula of summary.formulas) {
    rows.push(["formula", formula.label, formula.formula, formula.sourceTables.join("|")]);
  }

  for (const item of summary.reviewItems) {
    rows.push([
      "review_item",
      item.issueType,
      `${item.severity}: ${item.explanation} Recommended action: ${item.recommendedAction}`,
      item.transactionId ? `Transaction:${item.transactionId}` : "BusinessTaxProfile",
    ]);
  }

  for (const missing of summary.missingInformation) {
    rows.push(["missing_information", "setup_required", missing, "BusinessTaxProfile"]);
  }

  rows.push(["disclaimer", "professional_boundary", summary.disclaimer, "Tax Assistant"]);

  return {
    csv: rows.map(toCsvRow).join("\n"),
    filename: `tax-assistant-working-paper-${summary.businessId}-${summary.periodStart.slice(0, 10)}.csv`,
    rowCount: rows.length - 1,
  };
}

function toCsvRow(row: string[]) {
  return row.map(escapeCsvCell).join(",");
}

function escapeCsvCell(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}
