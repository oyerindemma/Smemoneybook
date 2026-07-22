import { expect, test } from "@playwright/test";

const requiredFlags = [
  "NEXT_PUBLIC_PHASE2_LOCATIONS_ENABLED",
  "NEXT_PUBLIC_PHASE2_TRANSFERS_ENABLED",
  "NEXT_PUBLIC_PHASE2_REPORTING_CENTRE_ENABLED",
  "NEXT_PUBLIC_PHASE2_TAX_ENABLED",
] as const;

const flagsEnabled = requiredFlags.every((key) =>
  ["1", "true", "yes", "on"].includes(String(process.env[key] ?? "").toLowerCase()),
);

test.describe("Phase 2 Preview visibility", () => {
  test.skip(!flagsEnabled, "Phase 2 Preview flags are not enabled for this test run.");

  test.beforeEach(async ({ page }) => {
    await page.route("**/api/dashboard/summary**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          state: {
            businessId: "biz_1",
            businessName: "Preview Shop",
            businessRole: "owner",
            onboardingCompleted: true,
            businesses: [{ id: "biz_1", name: "Preview Shop", role: "owner" }],
            locations: [
              { id: "loc_main", name: "Main shop", type: "main_shop", isDefault: true },
              { id: "loc_wh", name: "Central warehouse", type: "warehouse", isDefault: false },
            ],
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
            },
            billing: {
              planId: "pro",
              planName: "Pro",
              features: [
                "team_management",
                "audit_tools",
                "advanced_reports",
                "multi_location",
                "warehouse_transfers",
                "professional_pdf_exports",
                "tax_management",
              ],
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
    await page.route("**/api/billing/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ billingLive: true, provider: "paystack" }),
      });
    });
    await page.route("**/api/staff/invitations?**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          business: { canManageStaff: true },
          emailConfigured: true,
          members: [],
          invitations: [],
        }),
      });
    });
  });

  test("exposes the requested Phase 2 navigation paths", async ({ page }) => {
    await page.goto("/more");

    await expect(page.getByRole("link", { name: /Business Settings/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Reports/i })).toBeVisible();
    await expect(page.locator('a[href="/more/staff"]')).toBeVisible();
    await expect(page.getByRole("link", { name: /Billing/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Warehouses/i })).toBeVisible();

    await page.getByRole("link", { name: /Business Settings/i }).click();
    await expect(page.getByRole("heading", { name: "Business settings" })).toBeVisible();

    await page.goto("/stock");
    await expect(page.getByRole("link", { name: /Warehouses/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Transfers/i })).toBeVisible();
  });
});
