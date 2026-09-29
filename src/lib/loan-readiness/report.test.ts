import { describe, expect, it } from "vitest";
import { buildLoanReadinessReport, type LoanReadinessFacts } from "@/lib/loan-readiness/report";

describe("Loan Readiness deterministic report", () => {
  it("calculates the published weighted categories from business-scoped evidence", () => {
    const report = buildLoanReadinessReport(completeFacts());

    expect(report.formulaVersion).toBe("LR_COMPOSITE_V1");
    expect(report.categories).toHaveLength(13);
    expect(report.categories.reduce((total, category) => total + category.weight, 0)).toBe(100);
    expect(report.percentage).toBeGreaterThanOrEqual(75);
    expect(report.overallStatus).toBe("Ready");
    expect(report.evidence.period.days).toBe(180);
    expect(report.disclaimer).toContain("not a credit score");
    expect(report.disclaimer).toContain("Every lender applies its own");
  });

  it("caps insufficient operating history and reports missing critical evidence", () => {
    const facts = completeFacts();
    facts.business.createdAt = new Date("2026-09-01T00:00:00.000Z");
    facts.profile.operatingStartDate = "2026-09-01T00:00:00.000Z";
    facts.tax.profileConfigured = false;
    facts.tax.snapshotDates = [];

    const report = buildLoanReadinessReport(facts);

    expect(report.percentage).toBeLessThanOrEqual(60);
    expect(report.overallStatus).toBe("Missing data");
    expect(report.categories.find((category) => category.id === "bookkeeping_history")?.status)
      .toBe("Insufficient history");
    expect(report.categories.find((category) => category.id === "tax_readiness")?.status)
      .toBe("Missing data");
  });

  it("marks inventory not applicable without penalizing a service business", () => {
    const facts = completeFacts();
    facts.inventory = { itemCount: 0, value: 0, movementDates: [] };

    const report = buildLoanReadinessReport(facts);
    const inventory = report.categories.find((category) => category.id === "inventory_evidence");

    expect(inventory).toMatchObject({ status: "Not applicable", percentage: null });
    expect(report.evidence.limitations).toContain(
      "Inventory evidence is marked not applicable because no active stock items are recorded.",
    );
    expect(report.percentage).toBeGreaterThanOrEqual(75);
  });
});

function completeFacts(): LoanReadinessFacts {
  const generatedAt = new Date("2026-10-01T00:00:00.000Z");
  const periodStart = new Date(generatedAt.getTime() - 180 * 86_400_000);
  const months = ["2026-05-10", "2026-06-10", "2026-07-10", "2026-08-10", "2026-09-10"];
  const transactions = months.flatMap((date, index) => [
    {
      id: `sale_${index}`,
      type: "SALE",
      amount: 10_000,
      profit: 4_000,
      occurredAt: new Date(`${date}T12:00:00.000Z`),
      category: "Sales",
      receiptId: `receipt_${index}`,
      customerId: `customer_${index}`,
      duplicateFingerprint: `sale_fingerprint_${index}`,
      reversed: false,
    },
    {
      id: `expense_${index}`,
      type: "EXPENSE",
      amount: 1_000,
      profit: 0,
      occurredAt: new Date(`${date}T13:00:00.000Z`),
      category: "Operations",
      supplierId: `supplier_${index}`,
      duplicateFingerprint: `expense_fingerprint_${index}`,
      reversed: false,
    },
  ]);

  return {
    business: {
      id: "biz_1",
      name: "Preview Shop",
      currency: "NGN",
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      businessCategory: "Retail",
      businessType: "Retail",
      hasReceiptConfig: true,
      hasDocumentBranding: true,
    },
    generatedAt,
    periodStart,
    periodEnd: generatedAt,
    profile: {
      industry: "Retail",
      operatingStartDate: "2024-01-01T00:00:00.000Z",
      fundingPurpose: "Working capital",
      requestedAmount: 500_000,
      preferredCurrency: "NGN",
      consentToShare: false,
      documents: [
        "business_registration",
        "bank_statements",
        "financial_statements",
        "tax_records",
        "sales_records",
        "supplier_records",
      ].map((documentType) => ({
        documentType,
        label: documentType,
        status: "AVAILABLE" as const,
        reference: `${documentType}-ref`,
      })),
    },
    transactions,
    payments: months.map((date) => ({ createdAt: new Date(`${date}T14:00:00.000Z`) })),
    debts: [],
    bankRows: months.flatMap((date, index) => [
      { postedAt: new Date(`${date}T15:00:00.000Z`), amount: 10_000 + index, status: "MATCHED", duplicateStatus: "UNIQUE" },
      { postedAt: new Date(`${date}T16:00:00.000Z`), amount: -1_000, status: "IGNORED", duplicateStatus: "UNIQUE" },
    ]),
    tax: {
      profileConfigured: true,
      snapshotDates: months.map((date) => new Date(`${date}T17:00:00.000Z`)),
      openReviewItems: [],
    },
    inventory: {
      itemCount: 3,
      value: 75_000,
      movementDates: months.map((date) => new Date(`${date}T18:00:00.000Z`)),
    },
    issuedDocumentDates: months.map((date) => new Date(`${date}T19:00:00.000Z`)),
  };
}
