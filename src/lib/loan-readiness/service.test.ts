import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  snapshotFindMany: vi.fn(),
  snapshotFindFirst: vi.fn(),
  snapshotCreate: vi.fn(),
  profileUpsert: vi.fn(),
  profileFindUnique: vi.fn(),
  documentUpsert: vi.fn(),
  documentFindMany: vi.fn(),
  businessFindUnique: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    loanReadinessSnapshot: {
      findMany: mocks.snapshotFindMany,
      findFirst: mocks.snapshotFindFirst,
      create: mocks.snapshotCreate,
    },
    loanReadinessProfile: {
      findUnique: mocks.profileFindUnique,
    },
    loanReadinessDocument: {
      findMany: mocks.documentFindMany,
    },
    business: { findUnique: mocks.businessFindUnique },
    $transaction: mocks.transaction,
  }),
}));

describe("Loan Readiness persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.snapshotFindMany.mockResolvedValue([]);
    mocks.snapshotFindFirst.mockResolvedValue(null);
    mocks.snapshotCreate.mockResolvedValue({ id: "snapshot_1" });
    mocks.businessFindUnique.mockResolvedValue({ currency: "NGN" });
    mocks.profileFindUnique.mockResolvedValue(null);
    mocks.documentFindMany.mockResolvedValue([]);
    mocks.transaction.mockImplementation(async (callback) => callback({
      loanReadinessProfile: { upsert: mocks.profileUpsert },
      loanReadinessDocument: { upsert: mocks.documentUpsert },
    }));
  });

  it("scopes history queries to the authorized business and location", async () => {
    const { listLoanReadinessHistory } = await import("@/lib/loan-readiness/service");
    await listLoanReadinessHistory({ businessId: "biz_1", locationId: "loc_1", limit: 10 });

    expect(mocks.snapshotFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { businessId: "biz_1", locationId: "loc_1" },
      take: 10,
    }));
  });

  it("rejects a recalculation reference owned by another business", async () => {
    const { saveLoanReadinessReport } = await import("@/lib/loan-readiness/service");
    await expect(saveLoanReadinessReport({
      report: reportFixture(),
      generatedByUserId: "user_1",
      recalculatedFromId: "foreign_snapshot",
    })).rejects.toMatchObject({ status: 404, code: "snapshot_not_found" });

    expect(mocks.snapshotFindFirst).toHaveBeenCalledWith({
      where: { id: "foreign_snapshot", businessId: "biz_1" },
      select: { id: true },
    });
    expect(mocks.snapshotCreate).not.toHaveBeenCalled();
  });

  it("updates only readiness profile and checklist tables", async () => {
    const { updateLoanReadinessProfile } = await import("@/lib/loan-readiness/service");
    await updateLoanReadinessProfile({
      businessId: "biz_1",
      input: {
        industry: "Retail",
        operatingStartDate: "2024-01-01T00:00:00.000Z",
        fundingPurpose: "Working capital",
        requestedAmount: 250_000,
        preferredCurrency: "NGN",
        consentToShare: false,
        documents: [{
          documentType: "business_registration",
          label: "Business registration",
          status: "AVAILABLE",
          reference: "CAC file reference",
        }],
      },
    });

    expect(mocks.profileUpsert).toHaveBeenCalledWith(expect.objectContaining({ where: { businessId: "biz_1" } }));
    expect(mocks.documentUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { businessId_documentType: { businessId: "biz_1", documentType: "business_registration" } },
    }));
  });
});

function reportFixture() {
  return {
    business: { id: "biz_1", name: "Preview Shop", currency: "NGN" },
    location: { id: null, name: "All locations" },
    formulaVersion: "LR_COMPOSITE_V1" as const,
    generatedAt: "2026-09-29T10:00:00.000Z",
    expiresAt: "2026-10-29T10:00:00.000Z",
    percentage: 65,
    overallStatus: "Needs attention" as const,
    categories: [],
    evidence: {
      period: { start: "2026-04-02T10:00:00.000Z", end: "2026-09-29T10:00:00.000Z", days: 180 },
      sourceCounts: { transactions: 0, payments: 0, openDebts: 0, bankRows: 0, taxSnapshots: 0, inventoryItems: 0, inventoryMovements: 0, issuedDocuments: 0, checklistDocuments: 0 },
      activityMonths: [], salesMonths: [], expenseMonths: [], cashMovementMonths: [],
      bank: { totalRows: 0, coveredRows: 0, unresolvedRows: 0, unresolvedAmount: 0 },
      debt: { openCustomerReceivables: 0, overdueCustomerReceivables: 0, topDebtorConcentrationPercent: 0, openSupplierObligations: 0 },
      tax: { profileConfigured: false, snapshotCount: 0, openCriticalReviewItems: 0, openReviewItems: 0 },
      dataQuality: { missingCategories: 0, missingPartyLinks: 0, duplicateFingerprints: 0, reversalCount: 0, unresolvedBankRows: 0, openTaxReviewItems: 0 },
      limitations: [],
    },
    recommendations: [],
    profile: { preferredCurrency: "NGN", consentToShare: false, documents: [] },
    disclaimer: "This assessment measures the completeness and consistency of records available in SME MoneyBook. It is not a credit score, loan approval or lending decision. Every lender applies its own eligibility and risk criteria." as const,
  };
}
