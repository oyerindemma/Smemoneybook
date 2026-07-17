import { describe, expect, it } from "vitest";
import type { MonthlyReport } from "@/lib/bookkeeping/transaction-engine";
import { advancedReportToCsv } from "@/lib/reports/advanced-renderer";
import { monthlyReportToCsv } from "@/lib/reports/csv";
import { findReportDefinition, reportDefinitions } from "@/lib/reports/definitions";
import { reportToPdf } from "@/lib/reports/pdf";

const report: MonthlyReport = {
  businessName: "Ada Store",
  period: "month",
  periodLabel: "2026-07",
  periodStart: "2026-07-01T00:00:00.000Z",
  periodEnd: "2026-08-01T00:00:00.000Z",
  month: 7,
  year: 2026,
  vatRate: 7.5,
  salesTotal: 150000,
  cashReceivedTotal: 120000,
  creditSalesTotal: 30000,
  expensesTotal: 40000,
  profitTotal: 65000,
  taxableSalesTotal: 150000,
  nonTaxableSalesTotal: 0,
  vatTotal: 11250,
  customerDebtTotal: 30000,
  supplierDebtTotal: 10000,
  receivablesAging: {
    current: 30000,
    days31To60: 0,
    days61To90: 0,
    over90: 0,
  },
  payablesAging: {
    current: 10000,
    days31To60: 0,
    days61To90: 0,
    over90: 0,
  },
  topProduct: {
    name: "Rice 50kg",
    quantity: 8,
    salesTotal: 120000,
    profitTotal: 50000,
  },
  categoryBreakdown: [
    {
      name: "Foodstuff",
      quantity: 8,
      salesTotal: 120000,
      profitTotal: 50000,
    },
  ],
  brandBreakdown: [
    {
      name: "Mama Gold",
      quantity: 8,
      salesTotal: 120000,
      profitTotal: 50000,
    },
  ],
  insights: ["Foodstuff is your top category by sales."],
  transactionCount: 12,
  generatedAt: "2026-07-17T00:00:00.000Z",
};

describe("report exports", () => {
  it("includes category and brand breakdowns in CSV exports", () => {
    const csv = monthlyReportToCsv(report);

    expect(csv).toContain("Category: Foodstuff sales");
    expect(csv).toContain("Brand: Mama Gold profit");
  });

  it("includes category and brand sections in PDF exports", () => {
    const pdfText = reportToPdf(report).toString("utf8");

    expect(pdfText).toContain("Category sales");
    expect(pdfText).toContain("Brand sales");
    expect(pdfText).toContain("Foodstuff");
    expect(pdfText).toContain("Mama Gold");
  });

  it("exposes the full Phase 2 report catalogue", () => {
    expect(reportDefinitions).toHaveLength(24);
    expect(reportDefinitions.map((definition) => definition.id)).toContain("daily_closing");
    expect(findReportDefinition("monthly_summary")?.id).toBe("sales_summary");
  });

  it("renders advanced report exports with the selected definition", () => {
    const definition = findReportDefinition("tax_summary");

    expect(definition).not.toBeNull();

    const csv = advancedReportToCsv(definition!, report);

    expect(csv).toContain("Tax summary");
    expect(csv).toContain("Recordkeeping support only");
  });
});
