import type { MonthlyReport } from "@/lib/bookkeeping/transaction-engine";
import { formatNaira } from "@/lib/bookkeeping/transaction-engine";
import type { ReportDefinition } from "@/lib/reports/definitions";

type ReportRow = [label: string, value: string | number];

export function advancedReportToCsv(definition: ReportDefinition, report: MonthlyReport) {
  return buildReportRows(definition, report)
    .map((row) => row.map(csvCell).join(","))
    .join("\n");
}

export function advancedReportToPdf(definition: ReportDefinition, report: MonthlyReport) {
  const rows = buildReportRows(definition, report);
  const lines = rows.map(([label, value]) => `${label}: ${formatReportValue(value)}`);
  const content = [
    "BT",
    "/F1 14 Tf",
    "50 780 Td",
    ...lines.slice(0, 30).flatMap((line, index) => [
      index === 0 ? "" : "0 -22 Td",
      `(${escapePdfText(line)}) Tj`,
    ]),
    "ET",
  ]
    .filter(Boolean)
    .join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf);
}

function buildReportRows(definition: ReportDefinition, report: MonthlyReport): ReportRow[] {
  const baseRows: ReportRow[] = [
    ["Report", definition.name],
    ["Business", report.businessName],
    ["Location", report.locationName ?? "All accessible locations"],
    ["Period", report.periodLabel],
    ["Generated at", report.generatedAt],
  ];

  const rowsByReport: Record<string, ReportRow[]> = {
    sales_summary: [
      ["Sales", report.salesTotal],
      ["Cash received", report.cashReceivedTotal],
      ["Credit sales", report.creditSalesTotal],
      ["Transactions", report.transactionCount],
    ],
    sales_trend: [
      ["Selected period sales", report.salesTotal],
      ["Selected period transactions", report.transactionCount],
      ["Trend reconciliation", "Use daily/weekly buckets in the reporting centre for visual trend display."],
    ],
    expense_summary: [
      ["Expenses", report.expensesTotal],
      ["Profit after expenses", report.profitTotal],
    ],
    profit_overview: [
      ["Sales profit", report.salesTotal - report.expensesTotal],
      ["Expenses", report.expensesTotal],
      ["Net profit", report.profitTotal],
    ],
    product_profitability: [
      ["Top product", report.topProduct?.name ?? "No product sales"],
      ["Top product sales", report.topProduct?.salesTotal ?? 0],
      ["Top product profit", report.topProduct?.profitTotal ?? 0],
    ],
    category_performance: breakdownRows("Category", report.categoryBreakdown),
    brand_performance: breakdownRows("Brand", report.brandBreakdown),
    customer_ranking: [
      ["Customer balances", report.customerDebtTotal],
      ["Credit sales", report.creditSalesTotal],
    ],
    customer_debt_ageing: agingRows("Receivables", report.receivablesAging),
    supplier_ranking: [
      ["Supplier bills", report.supplierDebtTotal],
      ["Expenses", report.expensesTotal],
    ],
    supplier_bill_ageing: agingRows("Payables", report.payablesAging),
    inventory_valuation: [
      ["Top product", report.topProduct?.name ?? "No product sales"],
      ["Inventory source", "InventoryBalance and InventoryItem"],
    ],
    location_comparison: [
      ["Sales", report.salesTotal],
      ["Expenses", report.expensesTotal],
      ["Profit", report.profitTotal],
      ["Location scope", report.locationName ?? "All accessible locations"],
    ],
    stock_movement: [
      ["Top moving product", report.topProduct?.name ?? "No product movement"],
      ["Quantity sold", report.topProduct?.quantity ?? 0],
    ],
    inventory_turnover: [
      ["Cost source", "Transaction cost of goods sold"],
      ["Top product quantity", report.topProduct?.quantity ?? 0],
    ],
    low_stock: [
      ["Stock source", "InventoryBalance low stock thresholds"],
      ["Location scope", report.locationName ?? "All accessible locations"],
    ],
    returns_refunds: [
      ["Returns source", "CustomerReturn and SupplierReturn"],
      ["Reconciliation total", "Refund and settlement transactions"],
    ],
    payment_method_mix: [
      ["Cash received", report.cashReceivedTotal],
      ["Credit sales", report.creditSalesTotal],
    ],
    cashflow: [
      ["Cash received", report.cashReceivedTotal],
      ["Expenses", report.expensesTotal],
      ["Net cash movement", report.cashReceivedTotal - report.expensesTotal],
    ],
    staff_sales_performance: [
      ["Sales", report.salesTotal],
      ["Actor source", "Captured transaction/audit metadata where available"],
    ],
    tax_summary: [
      ["Taxable sales", report.taxableSalesTotal],
      ["Zero/exempt sales", report.nonTaxableSalesTotal],
      [`VAT estimate (${report.vatRate}%)`, report.vatTotal],
      ["Disclaimer", "Recordkeeping support only; not professional tax advice."],
    ],
    discounts: [
      ["Discount source", "Invoice item and order discount metadata"],
      ["Sales", report.salesTotal],
    ],
    gross_margin: [
      ["Sales", report.salesTotal],
      ["Gross profit", report.profitTotal + report.expensesTotal],
      ["Gross margin", report.salesTotal > 0 ? `${((report.profitTotal / report.salesTotal) * 100).toFixed(2)}%` : "0%"],
    ],
    daily_closing: [
      ["Cash received", report.cashReceivedTotal],
      ["Expenses", report.expensesTotal],
      ["Customer balances", report.customerDebtTotal],
      ["Supplier bills", report.supplierDebtTotal],
    ],
  };

  return [
    ...baseRows,
    ...(rowsByReport[definition.id] ?? rowsByReport.sales_summary),
    ["Reconciliation rule", definition.reconciliationRule],
  ];
}

function breakdownRows(label: string, rows: MonthlyReport["categoryBreakdown"]): ReportRow[] {
  if (rows.length === 0) {
    return [[label, "No rows in the selected period"]];
  }

  return rows.slice(0, 10).flatMap((row) => [
    [`${label}: ${row.name} sales`, row.salesTotal],
    [`${label}: ${row.name} quantity`, row.quantity],
    [`${label}: ${row.name} profit`, row.profitTotal],
  ]);
}

function agingRows(label: string, buckets: MonthlyReport["receivablesAging"]): ReportRow[] {
  return [
    [`${label} 0-30 days`, buckets.current],
    [`${label} 31-60 days`, buckets.days31To60],
    [`${label} 61-90 days`, buckets.days61To90],
    [`${label} 90+ days`, buckets.over90],
  ];
}

function formatReportValue(value: string | number) {
  return typeof value === "number" ? formatNaira(value) : value;
}

function csvCell(value: string | number) {
  const text = String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function escapePdfText(text: string) {
  return text.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}
