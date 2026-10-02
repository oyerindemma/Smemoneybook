import { expect, type Page, test } from "@playwright/test";

test.setTimeout(180_000);

async function openRecordSheet(page: Page) {
  const firstSaleCta = page.getByRole("button", { name: "Record first sale" });

  if (await firstSaleCta.count()) {
    await firstSaleCta.first().click();
  } else {
    await page.getByRole("button", { name: "Record money", exact: true }).click();
  }

  await expect(page.getByRole("dialog", { name: /Add sale|Record money/i })).toBeVisible();
}

async function saveSale(page: Page, amount: string, note = "Mobile sale") {
  await openRecordSheet(page);
  await page.getByLabel("Amount").fill(amount);
  await page.getByLabel(/Customer or note optional|Short note optional/i).fill(note);
  await page.getByRole("button", { name: /Save sale|Save money/i }).click();
  await expect(page.getByRole("dialog", { name: /Add sale|Record money/i })).toBeHidden({ timeout: 45_000 });
  await expect(page.locator("body")).toContainText(new RegExp(amount.replace(/\B(?=(\d{3})+(?!\d))/g, ",")), {
    timeout: 10_000,
  });
}

async function saveCreditSale(page: Page, amount: string, customerName: string) {
  await openRecordSheet(page);
  await page.getByLabel("Amount").fill(amount);
  await page.getByLabel(/Customer paid now|Paid now/i).uncheck();
  await page.getByLabel("Customer name").fill(customerName);
  await page.getByRole("button", { name: /Save sale|Save money/i }).click();
  await expect(page.getByRole("dialog", { name: /Add sale|Record money/i })).toBeHidden({ timeout: 45_000 });
}

test.describe("mobile readiness flows", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const style = document.createElement("style");
      style.textContent = "nextjs-portal { pointer-events: none !important; }";
      document.documentElement.appendChild(style);
    });
    await page.goto("/money");
    await expect(page.getByText(/Available (?:balance|Money)/i).first()).toBeVisible({
      timeout: 60_000,
    });
  });

  test("records money, opens the bottom sheet from nav, and switches tabs", async ({ page }) => {
    await saveSale(page, "1500", "First mobile sale");
    await expect(page.getByText(/₦1,500|₦1500/).first()).toBeVisible();

    await page.getByRole("button", { name: "Record money", exact: true }).click();
    await expect(page.getByRole("dialog", { name: /Add sale|Record money/i })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("link", { name: "People" }).click();
    await expect(page.getByRole("heading", { name: "People", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Stock" }).click();
    await expect(page.getByRole("heading", { name: "Stock", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "More" }).click();
    await expect(page.getByRole("heading", { name: "More", exact: true })).toBeVisible();
  });

  test("adds a product and updates stock on mobile", async ({ page }) => {
    const productName = `Mobile Rice Bag ${Date.now()}`;
    await page.goto("/stock");

    await page.getByLabel("Product name").fill(productName);
    await page.getByLabel("Cost price").fill("1000");
    await page.getByLabel("Selling price").fill("1500");
    await page.getByLabel("Quantity").first().fill("3");
    await page.getByLabel("Low alert").fill("2");
    await page.getByRole("button", { name: "Save product" }).click();
    await expect(page.getByRole("heading", { name: productName })).toBeVisible({ timeout: 45_000 });

    await page.locator("#adjust-stock").getByLabel("Quantity").fill("2");
    await page.getByRole("button", { name: "Update stock" }).click();
    await expect(page.getByText("Stock updated")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: productName })).toBeVisible();
  });

  test("collects customer debt from People", async ({ page }) => {
    const customerName = `Amina Customer ${Date.now()}`;
    await saveCreditSale(page, "2000", customerName);

    await page.goto("/people");
    await expect(page.getByText(customerName).first()).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Collect", exact: true }).click();
    await expect(page.getByText("Collect payment")).toBeVisible();
    await page.getByRole("button", { name: "Confirm collection" }).click();
    await expect(page.getByText("Collected money saved.")).toBeVisible({ timeout: 20_000 });
  });

  test("shows reports summary after money activity", async ({ page }) => {
    await saveSale(page, "1200", "Report sale");

    await page.goto("/reports");
    await expect(page.getByText("This month", { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("You made", { exact: true })).toBeVisible();
    await expect(page.getByText("You spent")).toBeVisible();
    const summaryCard = page.locator("section").filter({
      has: page.getByRole("button", { name: "View details", exact: true }),
    });
    await expect(summaryCard.getByText("Profit", { exact: true })).toBeVisible();
  });

  test("queues money changes visibly while offline", async ({ page, context }) => {
    await openRecordSheet(page);
    await page.getByLabel("Amount").fill("900");

    await context.setOffline(true);
    try {
      await page.getByRole("button", { name: /Save sale|Save money/i }).click();
      await expect(page.getByText(/Saved offline|saved offline|will sync/i).first()).toBeVisible({ timeout: 10_000 });
    } finally {
      await context.setOffline(false);
    }
  });
});
