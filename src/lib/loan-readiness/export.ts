import type { LoanReadinessReport } from "@/lib/loan-readiness/definitions";

export function buildLoanReadinessCsv(report: LoanReadinessReport) {
  const rows: Array<Array<string | number>> = [
    ["SME MoneyBook Loan Readiness report"],
    ["Business", report.business.name],
    ["Location", report.location.name],
    ["Generated at", report.generatedAt],
    ["Evidence window", `${report.evidence.period.start} to ${report.evidence.period.end}`],
    ["Record readiness", `${report.percentage}%`],
    ["Overall status", report.overallStatus],
    ["Formula version", report.formulaVersion],
    ["Disclaimer", report.disclaimer],
    [],
    ["Category", "Status", "Percentage", "Weight", "Explanation", "Evidence", "Recommended action"],
    ...report.categories.map((category) => [
      category.label,
      category.status,
      category.percentage === null ? "N/A" : category.percentage,
      category.weight,
      category.explanation,
      category.evidence.join(" | "),
      category.actions.join(" | "),
    ]),
    [],
    ["Evidence source", "Count"],
    ...Object.entries(report.evidence.sourceCounts).map(([key, value]) => [key, value]),
    [],
    ["Limitation"],
    ...report.evidence.limitations.map((limitation) => [limitation]),
  ];

  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function csvCell(value: string | number) {
  const text = String(value);
  const safe = /^[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
