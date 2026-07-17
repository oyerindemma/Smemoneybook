import type { MonthlyReport } from "@/lib/bookkeeping/transaction-engine";
import { formatNaira } from "@/lib/bookkeeping/transaction-engine";

export function reportToPdf(report: MonthlyReport) {
  const lines = [
    "SME Moneybook Report",
    report.businessName,
    report.periodLabel,
    "",
    `Sales: ${formatNaira(report.salesTotal)}`,
    `Cash received: ${formatNaira(report.cashReceivedTotal)}`,
    `Credit sales: ${formatNaira(report.creditSalesTotal)}`,
    `Expenses: ${formatNaira(report.expensesTotal)}`,
    `Profit: ${formatNaira(report.profitTotal)}`,
    `Taxable sales: ${formatNaira(report.taxableSalesTotal)}`,
    `VAT estimate: ${formatNaira(report.vatTotal)}`,
    `Customers owing: ${formatNaira(report.customerDebtTotal)}`,
    `Supplier bills: ${formatNaira(report.supplierDebtTotal)}`,
    "",
    "Category sales",
    ...formatBreakdownLines(report.categoryBreakdown),
    "",
    "Brand sales",
    ...formatBreakdownLines(report.brandBreakdown),
    "",
    "Insights",
    ...report.insights.map((insight) => `- ${insight}`),
    "",
    "Disclaimer",
    "Automatically generated from recorded business data. Please verify before official submission or filing.",
  ];

  const content = [
    "BT",
    "/F1 16 Tf",
    "50 780 Td",
    ...lines.flatMap((line, index) => [
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

function formatBreakdownLines(rows: MonthlyReport["categoryBreakdown"]) {
  if (rows.length === 0) {
    return ["No product sales yet."];
  }

  return rows.slice(0, 5).map((row) => (
    `- ${row.name}: ${formatNaira(row.salesTotal)} sales, ${formatNaira(row.profitTotal)} profit`
  ));
}

function escapePdfText(text: string) {
  return text.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}
