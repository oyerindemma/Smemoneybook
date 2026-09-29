import { describe, expect, it } from "vitest";
import { buildLoanReadinessCsv } from "@/lib/loan-readiness/export";
import type { LoanReadinessReport } from "@/lib/loan-readiness/definitions";

describe("Loan Readiness CSV export", () => {
  it("neutralizes spreadsheet formulas in user-controlled fields", () => {
    const csv = buildLoanReadinessCsv({
      business: { id: "biz_1", name: "=HYPERLINK(\"https://example.com\")", currency: "NGN" },
      location: { id: null, name: "+Main office" },
      formulaVersion: "LR_COMPOSITE_V1",
      generatedAt: "2026-09-29T10:00:00.000Z",
      expiresAt: "2026-10-29T10:00:00.000Z",
      percentage: 60,
      overallStatus: "Needs attention",
      categories: [],
      evidence: {
        period: {
          start: "2026-04-02T10:00:00.000Z",
          end: "2026-09-29T10:00:00.000Z",
          days: 180,
        },
        sourceCounts: {
          transactions: 0,
          payments: 0,
          openDebts: 0,
          bankRows: 0,
          taxSnapshots: 0,
          inventoryItems: 0,
          inventoryMovements: 0,
          issuedDocuments: 0,
          checklistDocuments: 0,
        },
        activityMonths: [],
        salesMonths: [],
        expenseMonths: [],
        cashMovementMonths: [],
        bank: { totalRows: 0, coveredRows: 0, unresolvedRows: 0, unresolvedAmount: 0 },
        debt: {
          openCustomerReceivables: 0,
          overdueCustomerReceivables: 0,
          topDebtorConcentrationPercent: 0,
          openSupplierObligations: 0,
        },
        tax: {
          profileConfigured: false,
          snapshotCount: 0,
          openCriticalReviewItems: 0,
          openReviewItems: 0,
        },
        dataQuality: {
          missingCategories: 0,
          missingPartyLinks: 0,
          duplicateFingerprints: 0,
          reversalCount: 0,
          unresolvedBankRows: 0,
          openTaxReviewItems: 0,
        },
        limitations: ["@external formula"],
      },
      recommendations: [],
      profile: { preferredCurrency: "NGN", consentToShare: false, documents: [] },
      disclaimer: "This assessment measures the completeness and consistency of records available in SME MoneyBook. It is not a credit score, loan approval or lending decision. Every lender applies its own eligibility and risk criteria.",
    } satisfies LoanReadinessReport);

    expect(csv).toContain("\"'=HYPERLINK(\"\"https://example.com\"\")\"");
    expect(csv).toContain("\"'+Main office\"");
    expect(csv).toContain("\"'@external formula\"");
  });
});
