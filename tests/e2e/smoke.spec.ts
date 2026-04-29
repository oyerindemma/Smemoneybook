import { expect, test } from "@playwright/test";

test("home screen loads a usable shell", async ({ page }) => {
  await page.route("**/api/dashboard/summary", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "Sign in to continue." }),
    });
  });

  await page.goto("/");

  await expect(page.getByText("SME Moneybook").first()).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: /Track your money daily|Database setup needed/i,
    }),
  ).toBeVisible();
});
