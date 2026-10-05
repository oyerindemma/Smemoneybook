import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { taxAssistantDisclaimer, taxAssistantRuleSetVersion } from "@/lib/tax-assistant/definitions";

const requireUser = vi.fn();
const enforceRateLimit = vi.fn();
const requireAccess = vi.fn();
const calculateSummary = vi.fn();
const listReviewItems = vi.fn();
const getReviewItem = vi.fn();
const getRules = vi.fn();
const listConversations = vi.fn();
const getConversation = vi.fn();
const answerQuestion = vi.fn();
const exportWorkingPaper = vi.fn();
const createAuditLog = vi.fn();
const originalEnv = { ...process.env };

class MockTaxAssistantAccessError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

vi.mock("@/lib/auth/session", () => ({
  requireUser,
}));

vi.mock("@/lib/auth/rate-limit", () => ({
  enforceRateLimit,
}));

vi.mock("@/lib/tax-assistant/authorization", () => ({
  TaxAssistantAccessError: MockTaxAssistantAccessError,
  requireTaxAssistantAccess: requireAccess,
}));

vi.mock("@/lib/tax-assistant/service", () => ({
  calculateTaxAssistantForBusiness: calculateSummary,
  listTaxAssistantReviewItems: listReviewItems,
  getTaxAssistantReviewItem: getReviewItem,
  getTaxAssistantRulesForBusiness: getRules,
  listTaxAssistantConversations: listConversations,
  getTaxAssistantConversation: getConversation,
}));

vi.mock("@/lib/tax-assistant/assistant", () => ({
  answerTaxAssistantQuestion: answerQuestion,
}));

vi.mock("@/lib/tax-assistant/export", () => ({
  exportTaxWorkingPaper: exportWorkingPaper,
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    auditLog: { create: createAuditLog },
  }),
}));

describe("Tax Assistant API routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.PHASE3_AI_ENABLED = "true";
    process.env.NEXT_PUBLIC_PHASE3_TAX_ASSISTANT_ENABLED = "true";
    process.env.PHASE3_TAX_ASSISTANT_ENABLED = "true";
    requireUser.mockResolvedValue({ id: "user_1" });
    enforceRateLimit.mockResolvedValue(null);
    requireAccess.mockResolvedValue({
      businessId: "biz_1",
      businessName: "Preview Shop",
      currency: "NGN",
      userId: "user_1",
      role: "OWNER",
      locationId: "loc_1",
    });
    calculateSummary.mockResolvedValue(summaryFixture);
    listReviewItems.mockResolvedValue({
      items: summaryFixture.reviewItems,
      total: summaryFixture.reviewItems.length,
      counts: summaryFixture.counts,
      source: summaryFixture.source,
      disclaimer: taxAssistantDisclaimer,
    });
    getReviewItem.mockResolvedValue({
      item: summaryFixture.reviewItems[0],
      source: summaryFixture.source,
      disclaimer: taxAssistantDisclaimer,
    });
    getRules.mockResolvedValue({
      ruleSet: {
        version: taxAssistantRuleSetVersion,
        status: "verified",
        sourceAuthority: "Nigeria Revenue Service",
        sourceReference: "https://www.nrs.gov.ng/uploads/NIGERIA_TAX_ACT_2025_ef6bb812a5.pdf",
      },
      rules: [{ id: "rule_1", taxType: "VAT", transactionType: "SALE", rate: 7.5, status: "verified" }],
      warnings: [],
    });
    listConversations.mockResolvedValue([{ id: "conv_1", title: "VAT question", messages: [] }]);
    getConversation.mockResolvedValue({ id: "conv_1", title: "VAT question", messages: [] });
    answerQuestion.mockResolvedValue({
      conversationId: "conv_1",
      messageId: "msg_1",
      answer: "Estimated output VAT is grounded in recorded sales.",
      toolCalls: [{ name: "get_tax_summary", ok: true }],
      source: summaryFixture.source,
      provider: "setup_required",
      promptVersion: "tax-assistant-preview-v1",
      disclaimer: taxAssistantDisclaimer,
    });
    exportWorkingPaper.mockReturnValue({
      csv: "section,metric,value\nsummary,output_vat_estimate,7500\n",
      filename: "tax-assistant-working-paper.csv",
      rowCount: 1,
    });
    createAuditLog.mockResolvedValue({ id: "audit_1" });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("loads a summary for an authorized owner and uses the resolved business/location", async () => {
    const { GET } = await import("@/app/api/tax-assistant/summary/route");
    const response = await GET(
      new Request("http://localhost/api/tax-assistant/summary?businessId=biz_injected&locationId=loc_1&month=7&year=2026"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.summary.figures.outputVatEstimate).toBe(7_500);
    expect(requireAccess).toHaveBeenCalledWith({
      userId: "user_1",
      businessId: "biz_injected",
      locationId: "loc_1",
      permission: "tax_assistant:read",
    });
    expect(calculateSummary).toHaveBeenCalledWith({
      businessId: "biz_1",
      locationId: "loc_1",
      periodStart: new Date("2026-07-01T00:00:00.000Z"),
      periodEnd: new Date("2026-08-01T00:00:00.000Z"),
    });
  });

  it("returns feature-disabled errors from the exact server-side gate", async () => {
    requireAccess.mockRejectedValueOnce(
      new MockTaxAssistantAccessError("Tax Assistant is unavailable in this environment.", 503, "feature_disabled"),
    );

    const { GET } = await import("@/app/api/tax-assistant/summary/route");
    const response = await GET(new Request("http://localhost/api/tax-assistant/summary?businessId=biz_1"));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error).toBe("Tax Assistant is unavailable in this environment.");
    expect(calculateSummary).not.toHaveBeenCalled();
  });

  it("rejects unauthorized business access before service execution", async () => {
    requireAccess.mockRejectedValueOnce(
      new MockTaxAssistantAccessError("You do not have access to this business.", 403, "business_access_denied"),
    );

    const { GET } = await import("@/app/api/tax-assistant/review-items/route");
    const response = await GET(new Request("http://localhost/api/tax-assistant/review-items?businessId=other_biz"));

    expect(response.status).toBe(403);
    expect(listReviewItems).not.toHaveBeenCalled();
  });

  it("loads review items, review details, and rule sources with dedicated permissions", async () => {
    const listRoute = await import("@/app/api/tax-assistant/review-items/route");
    const detailRoute = await import("@/app/api/tax-assistant/review-items/[id]/route");
    const rulesRoute = await import("@/app/api/tax-assistant/rules/route");

    const listResponse = await listRoute.GET(
      new Request("http://localhost/api/tax-assistant/review-items?businessId=biz_1&severity=warning&month=7&year=2026"),
    );
    const detailResponse = await detailRoute.GET(
      new Request("http://localhost/api/tax-assistant/review-items/tax-review:txn_1:missing_receipt?businessId=biz_1&month=7&year=2026"),
      { params: Promise.resolve({ id: "tax-review:txn_1:missing_receipt" }) },
    );
    const rulesResponse = await rulesRoute.GET(
      new Request("http://localhost/api/tax-assistant/rules?businessId=biz_1"),
    );
    const rulesPayload = await rulesResponse.json();

    expect(listResponse.status).toBe(200);
    expect(detailResponse.status).toBe(200);
    expect(rulesPayload.ruleSet.version).toBe(taxAssistantRuleSetVersion);
    expect(requireAccess).toHaveBeenCalledWith(
      expect.objectContaining({ permission: "tax_assistant:review" }),
    );
    expect(requireAccess).toHaveBeenCalledWith(
      expect.objectContaining({ permission: "tax_assistant:read" }),
    );
  });

  it("answers chat through read-only tools and persists no tax write route", async () => {
    const { POST } = await import("@/app/api/tax-assistant/chat/route");
    const response = await POST(
      new Request("http://localhost/api/tax-assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: "biz_1", question: "Explain VAT and WHT", month: 7, year: 2026 }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.result.answer).toContain("output VAT");
    expect(answerQuestion).toHaveBeenCalledWith(
      expect.objectContaining({
        question: "Explain VAT and WHT",
        periodStart: new Date("2026-07-01T00:00:00.000Z"),
        periodEnd: new Date("2026-08-01T00:00:00.000Z"),
      }),
    );
    expect(requireAccess).toHaveBeenCalledWith(expect.objectContaining({ permission: "tax_assistant:ask" }));
  });

  it("exports a working-paper CSV only with export permission", async () => {
    const { GET } = await import("@/app/api/tax-assistant/export/route");
    const response = await GET(new Request("http://localhost/api/tax-assistant/export?businessId=biz_1&month=7&year=2026"));
    const csv = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/csv");
    expect(csv).toContain("output_vat_estimate");
    expect(requireAccess).toHaveBeenCalledWith(expect.objectContaining({ permission: "tax_assistant:export" }));
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "tax_assistant.report_exported" }),
      }),
    );
  });

  it("lists and opens scoped conversations", async () => {
    const listRoute = await import("@/app/api/tax-assistant/conversations/route");
    const detailRoute = await import("@/app/api/tax-assistant/conversations/[id]/route");

    const listResponse = await listRoute.GET(new Request("http://localhost/api/tax-assistant/conversations?businessId=biz_1"));
    const detailResponse = await detailRoute.GET(
      new Request("http://localhost/api/tax-assistant/conversations/conv_1?businessId=biz_1"),
      { params: Promise.resolve({ id: "conv_1" }) },
    );

    expect(listResponse.status).toBe(200);
    expect(detailResponse.status).toBe(200);
    expect(listConversations).toHaveBeenCalledWith({ businessId: "biz_1", userId: "user_1" });
    expect(getConversation).toHaveBeenCalledWith({ businessId: "biz_1", userId: "user_1", conversationId: "conv_1" });
  });

  it("returns 405 for write verbs on read-only Tax Assistant endpoints", async () => {
    const rootRoute = await import("@/app/api/tax-assistant/route");
    const summaryRoute = await import("@/app/api/tax-assistant/summary/route");
    const reviewRoute = await import("@/app/api/tax-assistant/review-items/route");
    const exportRoute = await import("@/app/api/tax-assistant/export/route");

    expect(rootRoute.POST().status).toBe(405);
    expect(rootRoute.PUT().status).toBe(405);
    expect(rootRoute.PATCH().status).toBe(405);
    expect(rootRoute.DELETE().status).toBe(405);
    expect(summaryRoute.POST().headers.get("Allow")).toBe("GET");
    expect(reviewRoute.PATCH().status).toBe(405);
    expect(exportRoute.DELETE().status).toBe(405);
  });
});

const summaryFixture = {
  businessId: "biz_1",
  businessName: "Preview Shop",
  country: "NG",
  currency: "NGN",
  jurisdiction: "NG-FED",
  periodStart: "2026-07-01T00:00:00.000Z",
  periodEnd: "2026-08-01T00:00:00.000Z",
  filingFrequency: "MONTHLY",
  ruleSetVersion: taxAssistantRuleSetVersion,
  ruleSetStatus: "verified",
  taxRuleRequiresVerification: false,
  generatedAt: "2026-07-23T12:00:00.000Z",
  profile: {
    vatRegistered: true,
    vatRegistrationDate: "2026-01-01T00:00:00.000Z",
    filingFrequency: "MONTHLY",
    fiscalYearStartMonth: 1,
    pricingMode: "tax_exclusive",
    whtApplicable: true,
    businessType: "Retail",
    industryCategory: "General trade",
    maskedTaxIdentificationNumber: "*****3456",
    setupRequired: [],
  },
  figures: {
    taxableSales: 100_000,
    exemptSales: 0,
    zeroRatedSales: 0,
    outputVatEstimate: 7_500,
    eligibleInputVatEstimate: 0,
    netVatEstimate: 7_500,
    whtDeductedByCustomers: 0,
    whtDeductedFromSuppliers: 0,
    potentialWhtCredit: 0,
    taxableExpenses: 0,
    expensesMissingReceipts: 0,
    expensesMissingSupplierDetails: 0,
    salesMissingCustomerOrInvoiceData: 0,
    reconciledTaxImpactingAmount: 100_000,
    unreconciledTaxImpactingAmount: 0,
    unclassifiedTransactions: 0,
    estimatedTaxDue: 7_500,
    unresolvedTaxImpactingAmount: 0,
    dataCompletenessRate: 100,
    taxReadinessScore: 100,
  },
  counts: {
    transactionCount: 1,
    includedTransactionCount: 1,
    excludedReversedCount: 0,
    probableDuplicateCount: 0,
    reviewItemCount: 1,
    criticalReviewItemCount: 0,
    unreconciledBankEntryCount: 0,
  },
  formulas: [
    {
      label: "Output VAT",
      formula: "taxable sale base x verified VAT rate",
      sourceTables: ["Transaction", "TaxRule"],
    },
  ],
  assumptions: ["Only recorded transactions are included."],
  missingInformation: [],
  reviewItems: [
    {
      id: "tax-review:txn_1:missing_receipt",
      businessId: "biz_1",
      transactionId: "txn_1",
      taxType: "VAT_INPUT",
      issueType: "missing_receipt",
      severity: "warning",
      explanation: "This expense has no receipt.",
      recommendedAction: "Attach receipt evidence.",
      status: "open",
      amount: 20_000,
      recordLabel: "Supplier purchase",
    },
  ],
  reminders: ["Review estimates with a qualified tax professional before filing."],
  source: {
    ruleSetVersion: taxAssistantRuleSetVersion,
    ruleSetStatus: "verified",
    jurisdiction: "NG-FED",
    sourceTitle: "Nigeria Tax Act 2025",
    sourceAuthority: "Nigeria Revenue Service",
    sourceReference: "https://www.nrs.gov.ng/uploads/NIGERIA_TAX_ACT_2025_ef6bb812a5.pdf",
    lastVerifiedAt: "2026-07-23T00:00:00.000Z",
    verificationOwner: "SME MoneyBook engineering",
  },
  disclaimer: taxAssistantDisclaimer,
};
