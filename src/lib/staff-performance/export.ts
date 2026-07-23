import {
  staffPerformanceDisclaimer,
  type StaffPerformanceSummary,
} from "@/lib/staff-performance/definitions";

export function staffPerformanceSummaryToCsv(summary: StaffPerformanceSummary) {
  const rows: string[][] = [
    ["SME MoneyBook Staff Performance"],
    ["Business", summary.business.name],
    ["Report period", `${summary.period.label} (${summary.period.start} to ${summary.period.end})`],
    ["Generated at", summary.generatedAt],
    ["Location filter", summary.location.name],
    ["Formula version", summary.formulaVersion],
    ["Disclaimer", staffPerformanceDisclaimer],
    [],
    ["Data quality notes"],
    ...(summary.dataQualityNotes.length > 0
      ? summary.dataQualityNotes.map((note) => [note])
      : [["No data-quality notes for this period."]]),
    [],
    ["Unattributed activity"],
    ...Object.entries(summary.unattributedRecords).map(([key, value]) => [humanizeKey(key), String(value)]),
    [],
    [
      "Staff",
      "Role",
      "Sales recorded",
      "Sales transactions",
      "Average sale",
      "Invoices created",
      "Expenses recorded",
      "Debt collections",
      "Debt collection amount",
      "Supplier settlements",
      "Supplier settlement amount",
      "Stock-in operations",
      "Stock-out operations",
      "Warehouse transfer actions",
      "Reversals/corrections",
      "Active days",
      "Last activity",
      "Sales contribution %",
      "Data-quality notes",
    ],
    ...summary.rows.map((row) => [
      row.staff.name,
      row.staff.role,
      String(row.metrics.salesAmountRecorded),
      String(row.metrics.salesTransactions),
      String(row.metrics.averageTransactionValue),
      String(row.metrics.invoicesCreated),
      String(row.metrics.expensesRecorded),
      String(row.metrics.debtCollectionsRecorded),
      String(row.metrics.debtCollectionsAmount),
      String(row.metrics.supplierSettlementsRecorded),
      String(row.metrics.supplierSettlementsAmount),
      String(row.metrics.stockInOperations),
      String(row.metrics.stockOutOperations),
      String(row.metrics.warehouseTransferActions),
      String(row.metrics.reversalsCorrections),
      String(row.metrics.activeDays),
      row.metrics.lastRecordedActivity ?? "",
      String(row.metrics.salesContributionPercent),
      row.dataQualityNotes.join(" | "),
    ]),
  ];

  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

export function staffPerformanceCsvFilename(summary: StaffPerformanceSummary) {
  const start = summary.period.start.slice(0, 10);
  const end = summary.period.end.slice(0, 10);
  const business = summary.business.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

  return `staff-performance-${business || "business"}-${start}-${end}.csv`;
}

function csvCell(value: string) {
  if (!/[",\n]/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '""')}"`;
}

function humanizeKey(key: string) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (value) => value.toUpperCase());
}
