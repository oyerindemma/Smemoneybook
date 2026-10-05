import { expect, test } from "@playwright/test";

const flagsEnabled = [
  "NEXT_PUBLIC_PHASE3_TAX_ASSISTANT_ENABLED",
  "PHASE3_TAX_ASSISTANT_ENABLED",
  "PHASE3_AI_ENABLED",
].every((key) => ["1", "true", "yes", "on"].includes(String(process.env[key] ?? "").toLowerCase()));

test.describe("Tax Assistant Preview workflow", () => {
  test.skip(!flagsEnabled, "Tax Assistant Preview flags are not enabled for this test run.");

  test.beforeEach(async ({ page }) => {
    await mockDashboard(page);
    await page.route("**/api/billing/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ billingLive: true, provider: "paystack" }),
      });
    });
  });

  test("loads summary, filters periods, opens review items, asks, exports, and handles empty/denied states", async ({ page }) => {
    const unexpectedFailures: string[] = [];
    const unexpectedWrites: string[] = [];
    let exportRequested = false;
    let chatRequested = false;

    page.on("response", (response) => {
      if (response.url().includes("/api/tax-assistant") && [404, 500].includes(response.status())) {
        unexpectedFailures.push(`${response.status()} ${response.url()}`);
      }
    });
    page.on("request", (request) => {
      const url = request.url();
      const method = request.method();

      if (url.includes("/api/tax-assistant") && !url.includes("/chat") && method !== "GET") {
        unexpectedWrites.push(`${method} ${url}`);
      }
    });

    await page.route("**/api/tax-assistant/summary?**", async (route) => {
      const url = new URL(route.request().url());
      const month = url.searchParams.get("month") ?? "7";

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ summary: summaryForMonth(month) }),
      });
    });
    await page.route("**/api/tax-assistant/review-items?**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: reviewItems,
          total: reviewItems.length,
          counts: summaryForMonth("7").counts,
          source: summaryForMonth("7").source,
          disclaimer,
        }),
      });
    });
    await page.route("**/api/tax-assistant/review-items/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          item: reviewItems[0],
          source: summaryForMonth("7").source,
          disclaimer,
        }),
      });
    });
    await page.route("**/api/tax-assistant/rules?**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ruleSet: {
            version: ruleSetVersion,
            status: "verified",
            sourceAuthority: "Nigeria Revenue Service",
            sourceReference: "https://www.nrs.gov.ng/uploads/NIGERIA_TAX_ACT_2025_ef6bb812a5.pdf",
            lastVerifiedAt: "2026-07-23T00:00:00.000Z",
          },
          rules: [{ id: "rule_1", taxType: "VAT", transactionType: "SALE", rate: 7.5, status: "verified" }],
          warnings: [],
        }),
      });
    });
    await page.route("**/api/tax-assistant/chat", async (route) => {
      chatRequested = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          result: {
            conversationId: "conv_1",
            messageId: "msg_1",
            answer: "This tool-grounded answer uses recorded sales, WHT metadata, and the verified rule source.",
            toolCalls: [{ name: "get_tax_summary", ok: true }],
            source: summaryForMonth("7").source,
            provider: "configured-grounded",
            promptVersion: "tax-assistant-preview-v1",
            disclaimer,
          },
        }),
      });
    });
    await page.route("**/api/tax-assistant/export?**", async (route) => {
      exportRequested = true;
      await route.fulfill({
        status: 200,
        contentType: "text/csv",
        headers: { "Content-Disposition": 'attachment; filename="tax-assistant-working-paper.csv"' },
        body: "section,metric,value\nsummary,output_vat_estimate,7500\n",
      });
    });

    const moreResponse = await page.goto("/more");
    expect(moreResponse?.status()).not.toBe(404);
    expect(moreResponse?.status()).toBeLessThan(500);
    await expect(page.locator('a[href="/more/tax-assistant"]')).toContainText("Preview");
    await page.locator('a[href="/more/tax-assistant"]').click();

    await expect(page.getByRole("heading", { name: "Review tax records" })).toBeVisible();
    await expect(page.getByText("Tax readiness summary")).toBeVisible();
    await expect(page.getByText("Output VAT").first()).toBeVisible();
    await expect(page.getByText("Net VAT estimate").first()).toBeVisible();
    await expect(page.getByText("WHT recorded").first()).toBeVisible();
    await expect(page.getByText("Rule source")).toBeVisible();

    await page.getByRole("spinbutton", { name: "Month" }).fill("6");
    await page.getByRole("button", { name: "Refresh Tax Assistant" }).click();
    await expect(page.getByText("Jun 1, 2026 - Jul 1, 2026")).toBeVisible();

    await page.getByText("missing receipt").first().click();
    await expect(page.getByText("Attach receipt evidence.")).toBeVisible();

    await page.getByRole("button", { name: "Explain the WHT position." }).click();
    await page.getByRole("button", { name: "Ask Tax Assistant" }).click();
    await expect.poll(() => chatRequested).toBe(true);
    await expect(page.getByText("tool-grounded answer")).toBeVisible();
    await expect(page.getByText("configured-grounded")).toBeVisible();

    await page.getByRole("button", { name: "Export working paper" }).click();
    await expect.poll(() => exportRequested).toBe(true);

    await page.getByRole("spinbutton", { name: "Month" }).fill("5");
    await page.getByRole("button", { name: "Refresh Tax Assistant" }).click();
    await expect(page.getByText("No tax-impacting records were found for this filing period.")).toBeVisible();

    await page.getByRole("spinbutton", { name: "Month" }).fill("4");
    await page.getByRole("button", { name: "Refresh Tax Assistant" }).click();
    await expect(page.getByText("Setup required")).toBeVisible();
    await expect(page.getByText("Tax identification number is missing.")).toBeVisible();

    await page.unroute("**/api/tax-assistant/summary?**");
    await page.route("**/api/tax-assistant/summary?**", async (route) => {
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ error: "You do not have permission to view Tax Assistant." }),
      });
    });
    await page.getByRole("button", { name: "Refresh Tax Assistant" }).click();
    await expect(page.getByRole("main").getByText("You do not have permission to view Tax Assistant.")).toBeVisible();

    await expect(page.getByRole("button", { name: /^Save$/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /file tax/i })).toHaveCount(0);
    expect(unexpectedFailures).toEqual([]);
    expect(unexpectedWrites).toEqual([]);
  });
});

async function mockDashboard(page: import("@playwright/test").Page) {
  await page.route("**/api/dashboard/summary**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        state: {
          businessId: "biz_1",
          businessName: "Preview Shop",
          currency: "NGN",
          businessRole: "owner",
          onboardingCompleted: true,
          businesses: [{ id: "biz_1", name: "Preview Shop", role: "owner" }],
          locations: [{ id: "loc_main", name: "Main shop", type: "main_shop", isDefault: true }],
          selectedLocationId: "loc_main",
          selectedLocationName: "Main shop",
          permissions: {
            canManageStaff: true,
            canManageAccounts: true,
            canSaveReports: true,
            canExportBackup: true,
            canViewLocations: true,
            canManageLocations: true,
            canViewTransfers: true,
            canManageTransfers: true,
            canApproveTransfers: true,
            canReceiveTransfers: true,
            canManageTax: true,
            canViewTaxAssistant: true,
            canAskTaxAssistant: true,
            canReviewTaxAssistant: true,
            canExportTaxAssistant: true,
            canManageTaxAssistantSettings: false,
          },
          billing: {
            planId: "growth",
            planName: "Growth",
            features: ["tax_management", "tax_assistant", "basic_exports"],
          },
          accounts: [],
          transactions: [],
          debts: [],
          items: [],
          auditLogs: [],
        },
      }),
    });
  });
}

function summaryForMonth(month: string) {
  if (month === "5") {
    return {
      ...baseSummary,
      periodStart: "2026-05-01T00:00:00.000Z",
      periodEnd: "2026-06-01T00:00:00.000Z",
      figures: {
        ...baseSummary.figures,
        taxableSales: 0,
        outputVatEstimate: 0,
        netVatEstimate: 0,
        estimatedTaxDue: 0,
      },
      counts: {
        ...baseSummary.counts,
        transactionCount: 0,
        includedTransactionCount: 0,
      },
      reviewItems: [],
    };
  }

  if (month === "4") {
    return {
      ...baseSummary,
      periodStart: "2026-04-01T00:00:00.000Z",
      periodEnd: "2026-05-01T00:00:00.000Z",
      missingInformation: ["Tax identification number is missing."],
      profile: {
        ...baseSummary.profile,
        setupRequired: ["Tax identification number is missing."],
        maskedTaxIdentificationNumber: undefined,
      },
      figures: {
        ...baseSummary.figures,
        taxReadinessScore: 62,
        dataCompletenessRate: 70,
      },
    };
  }

  if (month === "6") {
    return {
      ...baseSummary,
      periodStart: "2026-06-01T00:00:00.000Z",
      periodEnd: "2026-07-01T00:00:00.000Z",
      figures: {
        ...baseSummary.figures,
        taxableSales: 60_000,
        outputVatEstimate: 4_500,
        netVatEstimate: 4_500,
        estimatedTaxDue: 4_500,
      },
    };
  }

  return baseSummary;
}

const ruleSetVersion = "ng-federal-2026-preview-v1";
const disclaimer =
  "This report is an estimate based on records available in SME MoneyBook. It is not a filed tax return and does not replace advice from a qualified tax professional or confirmation from the relevant tax authority.";

const reviewItems = [
  {
    id: "tax-review:expense_1:missing_receipt",
    businessId: "biz_1",
    transactionId: "expense_1",
    taxType: "VAT_INPUT",
    issueType: "missing_receipt",
    severity: "warning",
    explanation: "This expense has no receipt, invoice or tax snapshot evidence.",
    recommendedAction: "Attach receipt evidence.",
    status: "open",
    amount: 25_000,
    recordLabel: "Supplier purchase",
  },
  {
    id: "tax-review:bank:unreconciled",
    businessId: "biz_1",
    taxType: "VAT",
    issueType: "unreconciled_bank_entry",
    severity: "warning",
    explanation: "One bank statement entry in the selected period is not matched.",
    recommendedAction: "Review unreconciled bank entries.",
    status: "open",
    amount: 1,
  },
] as const;

const baseSummary = {
  businessId: "biz_1",
  businessName: "Preview Shop",
  country: "NG",
  currency: "NGN",
  jurisdiction: "NG-FED",
  periodStart: "2026-07-01T00:00:00.000Z",
  periodEnd: "2026-08-01T00:00:00.000Z",
  filingFrequency: "MONTHLY",
  ruleSetVersion,
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
    eligibleInputVatEstimate: 1_500,
    netVatEstimate: 6_000,
    whtDeductedByCustomers: 2_500,
    whtDeductedFromSuppliers: 0,
    potentialWhtCredit: 2_500,
    taxableExpenses: 20_000,
    expensesMissingReceipts: 25_000,
    expensesMissingSupplierDetails: 0,
    salesMissingCustomerOrInvoiceData: 0,
    reconciledTaxImpactingAmount: 95_000,
    unreconciledTaxImpactingAmount: 25_000,
    unclassifiedTransactions: 0,
    estimatedTaxDue: 3_500,
    unresolvedTaxImpactingAmount: 25_000,
    dataCompletenessRate: 82,
    taxReadinessScore: 78,
  },
  counts: {
    transactionCount: 3,
    includedTransactionCount: 3,
    excludedReversedCount: 0,
    probableDuplicateCount: 0,
    reviewItemCount: 2,
    criticalReviewItemCount: 0,
    unreconciledBankEntryCount: 1,
  },
  formulas: [
    {
      label: "Output VAT",
      formula: "taxable sale base x verified VAT rate",
      sourceTables: ["Transaction", "TaxRule"],
    },
    {
      label: "Net VAT estimate",
      formula: "output VAT estimate - eligible input VAT estimate",
      sourceTables: ["Transaction", "TaxRule"],
    },
  ],
  assumptions: ["Only recorded SME MoneyBook transactions in the selected period are included."],
  missingInformation: [],
  reviewItems,
  reminders: ["Review estimates with a qualified tax professional before filing."],
  source: {
    ruleSetVersion,
    ruleSetStatus: "verified",
    jurisdiction: "NG-FED",
    sourceTitle: "Nigeria Tax Act 2025",
    sourceAuthority: "Nigeria Revenue Service",
    sourceReference: "https://www.nrs.gov.ng/uploads/NIGERIA_TAX_ACT_2025_ef6bb812a5.pdf",
    lastVerifiedAt: "2026-07-23T00:00:00.000Z",
    verificationOwner: "SME MoneyBook engineering",
  },
  disclaimer,
};
