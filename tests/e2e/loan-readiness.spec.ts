import { expect, test } from "@playwright/test";

const flagsEnabled = [
  "NEXT_PUBLIC_PHASE3_LOAN_READINESS_ENABLED",
  "PHASE3_LOAN_READINESS_ENABLED",
].every((key) => ["1", "true", "yes", "on"].includes(String(process.env[key] ?? "").toLowerCase()));

test.describe("Loan Readiness Preview workflow", () => {
  test.skip(!flagsEnabled, "Loan Readiness Preview flags are not enabled for this test run.");

  test.beforeEach(async ({ page }) => {
    await mockDashboard(page);
  });

  test("reviews evidence, updates profile, generates history, and exports", async ({ page }) => {
    let profileSaved = false;
    let generated = false;
    let exportRequested = false;

    await page.route("**/api/loan-readiness/summary**", (route) => json(route, { report, capabilities }));
    await page.route("**/api/loan-readiness/categories**", (route) => json(route, {
      categories: report.categories,
      percentage: report.percentage,
      overallStatus: report.overallStatus,
      formulaVersion: report.formulaVersion,
    }));
    await page.route("**/api/loan-readiness/evidence**", (route) => json(route, { evidence: report.evidence, disclaimer: report.disclaimer }));
    await page.route("**/api/loan-readiness/profile**", async (route) => {
      if (route.request().method() === "PUT") profileSaved = true;
      await json(route, { profile, capabilities, message: "Loan Readiness profile saved." });
    });
    await page.route("**/api/loan-readiness/history**", (route) => json(route, {
      history: generated ? [historyItem, { ...historyItem, id: "snapshot_older", generatedAt: "2026-09-01T10:00:00.000Z" }] : [historyItem],
    }));
    await page.route("**/api/loan-readiness/generate", async (route) => {
      generated = true;
      await json(route, { report, snapshotId: "snapshot_2", message: "Loan Readiness assessment saved." }, 201);
    });
    await page.route("**/api/loan-readiness/export**", async (route) => {
      exportRequested = true;
      await route.fulfill({
        status: 200,
        contentType: "text/csv",
        headers: { "Content-Disposition": 'attachment; filename="loan-readiness.csv"' },
        body: "Category,Status\nBusiness profile,Ready\n",
      });
    });

    await page.goto("/more");
    const link = page.locator('a[href="/more/loan-readiness"]');
    await expect(link).toContainText("Preview");
    await link.click();

    await expect(page.getByRole("heading", { name: "Prepare your business records" })).toBeVisible();
    await expect(page.getByText("78%")).toBeVisible();
    await expect(page.getByText("not a credit score")).toBeVisible();

    await page.getByRole("tab", { name: "Categories" }).click();
    await expect(page.getByText("Business profile completeness")).toBeVisible();
    await expect(page.getByText("LR_PROFILE_COMPLETENESS_V1")).toBeVisible();

    await page.getByRole("tab", { name: "Evidence" }).click();
    await expect(page.getByText("Bank and debt evidence")).toBeVisible();
    await expect(page.getByText("Known limitations")).toBeVisible();

    await page.getByRole("tab", { name: "Profile" }).click();
    await page.getByLabel("Industry").fill("Retail and distribution");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect.poll(() => profileSaved).toBe(true);

    await page.getByRole("button", { name: "Generate" }).click();
    await expect.poll(() => generated).toBe(true);
    await page.getByRole("tab", { name: "History" }).click();
    await expect(page.getByRole("cell", { name: "Preview Owner" }).first()).toBeVisible();

    await page.getByRole("button", { name: "Export" }).click();
    await expect.poll(() => exportRequested).toBe(true);
  });

  test("shows insufficient-data and permission-denied states", async ({ page }) => {
    const missingReport = {
      ...report,
      percentage: 38,
      overallStatus: "Missing data",
      categories: report.categories.map((category) => ({
        ...category,
        percentage: 0,
        status: category.id === "bookkeeping_history" ? "Insufficient history" : "Missing data",
      })),
      recommendations: ["Keep complete monthly records until more operating history is available."],
      evidence: {
        ...report.evidence,
        sourceCounts: { ...report.evidence.sourceCounts, transactions: 0 },
        activityMonths: [],
      },
    };
    await page.route("**/api/loan-readiness/summary**", (route) => json(route, { report: missingReport, capabilities }));
    await page.route("**/api/loan-readiness/categories**", (route) => json(route, { categories: missingReport.categories }));
    await page.route("**/api/loan-readiness/evidence**", (route) => json(route, { evidence: missingReport.evidence }));
    await page.route("**/api/loan-readiness/profile**", (route) => json(route, { profile, capabilities }));
    await page.route("**/api/loan-readiness/history**", (route) => json(route, { history: [] }));

    await page.goto("/more/loan-readiness");
    await expect(page.getByText("Missing data").first()).toBeVisible();
    await page.getByRole("tab", { name: "Categories" }).click();
    await expect(page.getByText("Insufficient history")).toBeVisible();
    await page.getByRole("tab", { name: "History" }).click();
    await expect(page.getByText("No saved Loan Readiness assessments yet.")).toBeVisible();

    await page.unroute("**/api/loan-readiness/summary**");
    await page.route("**/api/loan-readiness/summary**", (route) => json(route, {
      error: "You do not have permission to view Loan Readiness.",
    }, 403));
    await page.reload();
    await expect(page.getByRole("main").getByText("You do not have permission to view Loan Readiness.")).toBeVisible();
  });
});

async function mockDashboard(page: import("@playwright/test").Page) {
  await page.route("**/api/dashboard/summary**", (route) => json(route, {
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
        canViewLoanReadiness: true,
        canGenerateLoanReadiness: true,
        canExportLoanReadiness: true,
        canManageLoanReadinessProfile: true,
      },
      billing: { planId: "growth", planName: "Growth", features: ["loan_readiness"] },
      accounts: [], transactions: [], debts: [], items: [], auditLogs: [],
    },
  }));
  await page.route("**/api/billing/status", (route) => json(route, { billingLive: true, provider: "paystack" }));
}

async function json(route: import("@playwright/test").Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

const capabilities = { canRead: true, canGenerate: true, canExport: true, canManageProfile: true };
const profile = {
  industry: "Retail",
  operatingStartDate: "2024-01-01T00:00:00.000Z",
  fundingPurpose: "Working capital",
  requestedAmount: 500000,
  preferredCurrency: "NGN",
  consentToShare: false,
  documents: [
    { documentType: "business_registration", label: "Business registration", status: "AVAILABLE", reference: "Registration file" },
    { documentType: "bank_statements", label: "Bank statements", status: "NEEDS_UPDATE" },
  ],
};
const sourceCounts = {
  transactions: 48, payments: 30, openDebts: 4, bankRows: 35, taxSnapshots: 2,
  inventoryItems: 12, inventoryMovements: 20, issuedDocuments: 8, checklistDocuments: 2,
};
const evidence = {
  period: { start: "2026-04-02T10:00:00.000Z", end: "2026-09-29T10:00:00.000Z", days: 180 },
  sourceCounts,
  activityMonths: ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09"],
  salesMonths: ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09"],
  expenseMonths: ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09"],
  cashMovementMonths: ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09"],
  bank: { totalRows: 35, coveredRows: 30, unresolvedRows: 5, unresolvedAmount: 25000 },
  debt: { openCustomerReceivables: 100000, overdueCustomerReceivables: 10000, topDebtorConcentrationPercent: 25, openSupplierObligations: 50000 },
  tax: { profileConfigured: true, snapshotCount: 2, openCriticalReviewItems: 0, openReviewItems: 1 },
  dataQuality: { missingCategories: 1, missingPartyLinks: 2, duplicateFingerprints: 0, reversalCount: 1, unresolvedBankRows: 5, openTaxReviewItems: 1 },
  limitations: ["Account balances are app records and are not independently verified bank balances."],
};
const categories = [
  {
    id: "business_profile", label: "Business profile completeness", formula: "LR_PROFILE_COMPLETENESS_V1",
    weight: 8, percentage: 100, weightedPoints: 8, status: "Ready", explanation: "Core profile fields are available.",
    evidence: ["Industry: Retail."], actions: [], metrics: { completedFields: 5 },
  },
  {
    id: "bookkeeping_history", label: "Bookkeeping history", formula: "LR_OPERATING_HISTORY_MONTHS_V1",
    weight: 10, percentage: 80, weightedPoints: 8, status: "Ready", explanation: "Five months of activity are available.",
    evidence: ["Trailing 180 days."], actions: [], metrics: { activityMonths: 5 },
  },
];
const report = {
  business: { id: "biz_1", name: "Preview Shop", currency: "NGN" },
  location: { id: "loc_main", name: "Main shop" },
  formulaVersion: "LR_COMPOSITE_V1",
  generatedAt: "2026-09-29T10:00:00.000Z",
  expiresAt: "2026-10-29T10:00:00.000Z",
  percentage: 78,
  overallStatus: "Needs attention",
  categories,
  evidence,
  recommendations: ["Update the latest bank statement checklist reference."],
  profile,
  disclaimer: "This assessment measures the completeness and consistency of records available in SME MoneyBook. It is not a credit score, loan approval or lending decision. Every lender applies its own eligibility and risk criteria.",
};
const historyItem = {
  id: "snapshot_1",
  formulaVersion: "LR_COMPOSITE_V1",
  percentage: 78,
  overallStatus: "Needs attention",
  generatedAt: "2026-09-29T10:00:00.000Z",
  locationId: "loc_main",
  locationName: "Main shop",
  generatedByName: "Preview Owner",
};
