import type { MonthlyReport } from "@/lib/bookkeeping/transaction-engine";

export function monthlyReportToCsv(report: MonthlyReport) {
  const rows = [
    ["Business", report.businessName],
    ["Month", `${report.year}-${String(report.month).padStart(2, "0")}`],
    ["Sales", report.salesTotal],
    ["Expenses", report.expensesTotal],
    ["Profit", report.profitTotal],
    [`VAT estimate (${report.vatRate}%)`, report.vatTotal],
    ["Customers owing", report.customerDebtTotal],
    ["Supplier bills", report.supplierDebtTotal],
    ["Transactions", report.transactionCount],
    ["Generated at", report.generatedAt],
  ];

  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function csvCell(value: string | number) {
  const text = String(value);
  return `"${text.replaceAll('"', '""')}"`;
}
