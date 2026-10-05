import type { MonthlyReport } from "@/lib/bookkeeping/transaction-engine";

export function monthlyReportToCsv(report: MonthlyReport) {
  const rows = [
    ["Business", report.businessName],
    ["Month", `${report.year}-${String(report.month).padStart(2, "0")}`],
    ["Period", report.periodLabel],
    ["Sales", report.salesTotal],
    ["Cash received", report.cashReceivedTotal],
    ["Credit sales", report.creditSalesTotal],
    ["Expenses", report.expensesTotal],
    ["Profit", report.profitTotal],
    ["Taxable sales", report.taxableSalesTotal],
    ["Non-taxable sales", report.nonTaxableSalesTotal],
    [`VAT estimate (${report.vatRate}%)`, report.vatTotal],
    ["Customers owing", report.customerDebtTotal],
    ["Supplier bills", report.supplierDebtTotal],
    ["Receivables 0-30", report.receivablesAging.current],
    ["Receivables 31-60", report.receivablesAging.days31To60],
    ["Receivables 61-90", report.receivablesAging.days61To90],
    ["Receivables 90+", report.receivablesAging.over90],
    ["Payables 0-30", report.payablesAging.current],
    ["Payables 31-60", report.payablesAging.days31To60],
    ["Payables 61-90", report.payablesAging.days61To90],
    ["Payables 90+", report.payablesAging.over90],
    ["Top product", report.topProduct?.name ?? ""],
    ...report.categoryBreakdown.flatMap((row) => [
      [`Category: ${row.name} sales`, row.salesTotal],
      [`Category: ${row.name} quantity`, row.quantity],
      [`Category: ${row.name} profit`, row.profitTotal],
    ]),
    ...report.brandBreakdown.flatMap((row) => [
      [`Brand: ${row.name} sales`, row.salesTotal],
      [`Brand: ${row.name} quantity`, row.quantity],
      [`Brand: ${row.name} profit`, row.profitTotal],
    ]),
    ["Insights", report.insights.join(" | ")],
    ["Transactions", report.transactionCount],
    ["Generated at", report.generatedAt],
    [
      "Disclaimer",
      "Automatically generated from recorded business data. Please verify before official submission or filing.",
    ],
  ];

  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function csvCell(value: string | number) {
  const text = String(value);
  return `"${text.replaceAll('"', '""')}"`;
}
