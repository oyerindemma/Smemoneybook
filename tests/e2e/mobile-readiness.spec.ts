import { expect, type Page, test } from "@playwright/test";

const password = "password123";

test.setTimeout(90_000);

function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
}

async function signUpAndOnboard(page: Page, prefix = "mobile-qa") {
  const email = uniqueEmail(prefix);
  const businessName = `QA Shop ${Date.now()}`;
  const ipSeed = Date.now() % 200;

  await page.setExtraHTTPHeaders({
    "x-forwarded-for": `10.${ipSeed}.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 200) + 1}`,
  });
  await page.goto("/");
  await expect(page.getByText("SME Moneybook").first()).toBeVisible();
  await page.getByRole("button", { name: "Start Free" }).click();
  await page.getByLabel("Your name").fill("Mobile QA Owner");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("body")).toContainText(/What business do you run\?|Available balance/, {
    timeout: 25_000,
  });

  if ((await page.locator("body").innerText()).includes("What business do you run?")) {
    await page.getByLabel("Business name optional").fill(businessName);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Record my first transaction" }).click();
    await page.getByLabel("Amount").fill("1000");
    await page.getByRole("button", { name: "Save first record" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Not now" }).click();
  }

  await expect(page.getByText("Available balance")).toBeVisible({ timeout: 25_000 });

  return { email, password, businessName };
}

async function signOut(page: Page) {
  await page.goto("/more");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "I already have an account" })).toBeVisible({ timeout: 15_000 });
}

async function signIn(page: Page, email: string) {
  await page.goto("/");
  const existingAccountButton = page.getByRole("button", { name: "I already have an account" });
  if (await existingAccountButton.count()) {
    await existingAccountButton.click();
  } else {
    await page.getByRole("button", { name: "Sign in" }).click();
  }
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Available balance")).toBeVisible({ timeout: 25_000 });
}

async function openRecordSheet(page: Page) {
  const firstSaleCta = page.getByRole("button", { name: "Record first sale" });

  if (await firstSaleCta.count()) {
    await firstSaleCta.first().click();
  } else {
    await page.getByRole("button", { name: "+ Record money" }).first().click();
  }

  await expect(page.getByRole("dialog", { name: "Record money" })).toBeVisible();
}

async function saveSale(page: Page, amount: string, note = "Mobile sale") {
  await openRecordSheet(page);
  await page.getByLabel("Amount").fill(amount);
  await page.getByLabel("Short note optional").fill(note);
  await page.getByRole("button", { name: "Save money" }).click();
  await expect(page.getByRole("dialog", { name: "Record money" })).toBeHidden({ timeout: 45_000 });
  await expect(page.locator("body")).toContainText(new RegExp(amount.replace(/\B(?=(\d{3})+(?!\d))/g, ",")), {
    timeout: 10_000,
  });
}

async function saveCreditSale(page: Page, amount: string, customerName: string) {
  await openRecordSheet(page);
  await page.getByLabel("Amount").fill(amount);
  await page.getByLabel("Short note optional").fill(customerName);
  await page.getByLabel("Paid now").uncheck();
  await page.getByRole("button", { name: "Save money" }).click();
  await expect(page.getByRole("dialog", { name: "Record money" })).toBeHidden({ timeout: 45_000 });
}

test.describe("mobile readiness flows", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const style = document.createElement("style");
      style.textContent = "nextjs-portal { pointer-events: none !important; }";
      document.documentElement.appendChild(style);
    });
  });

  test("signs up, signs out, and signs in on a mobile viewport", async ({ page }) => {
    const account = await signUpAndOnboard(page, "mobile-auth");

    await signOut(page);
    await signIn(page, account.email);

    await expect(page.getByText("Available balance")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Something went wrong");
  });

  test("records money, opens the bottom sheet from nav, and switches tabs", async ({ page }) => {
    await signUpAndOnboard(page, "mobile-money");

    await saveSale(page, "1500", "First mobile sale");
    await expect(page.getByText(/₦1,500|₦1500/).first()).toBeVisible();

    await page.getByRole("button", { name: "Record money", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Record money" })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("link", { name: "People" }).click();
    await expect(page.getByRole("heading", { name: "People", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Stock" }).click();
    await expect(page.getByRole("heading", { name: "Stock", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "More" }).click();
    await expect(page.getByRole("heading", { name: "More", exact: true })).toBeVisible();
  });

  test("adds a product and updates stock on mobile", async ({ page }) => {
    await signUpAndOnboard(page, "mobile-stock");
    await page.goto("/stock");

    await page.getByLabel("Product name").fill("Mobile Rice Bag");
    await page.getByLabel("Cost price").fill("1000");
    await page.getByLabel("Selling price").fill("1500");
    await page.getByLabel("Quantity").first().fill("3");
    await page.getByLabel("Low alert").fill("2");
    await page.getByRole("button", { name: "Save product" }).click();
    await expect(page.getByRole("heading", { name: "Mobile Rice Bag" })).toBeVisible({ timeout: 45_000 });

    await page.locator("#adjust-stock").getByLabel("Quantity").fill("2");
    await page.getByRole("button", { name: "Update stock" }).click();
    await expect(page.getByText("Stock updated")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Mobile Rice Bag" })).toBeVisible();
  });

  test("collects customer debt from People", async ({ page }) => {
    await signUpAndOnboard(page, "mobile-debt");
    await saveCreditSale(page, "2000", "Amina Customer");

    await page.goto("/people");
    await expect(page.getByText("Amina Customer").first()).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Collect" }).first().click();
    await expect(page.getByText("Collect payment")).toBeVisible();
    await page.getByRole("button", { name: "Confirm collection" }).click();
    await expect(page.getByText("Collected money saved.")).toBeVisible({ timeout: 20_000 });
  });

  test("shows reports summary after money activity", async ({ page }) => {
    await signUpAndOnboard(page, "mobile-reports");
    await saveSale(page, "1200", "Report sale");

    await page.goto("/reports");
    await expect(page.getByText("This month", { exact: true })).toBeVisible();
    await expect(page.getByText("You made")).toBeVisible();
    await expect(page.getByText("You spent")).toBeVisible();
    await expect(page.getByText("Profit")).toBeVisible();
  });

  test("queues money changes visibly while offline", async ({ page, context }) => {
    await signUpAndOnboard(page, "mobile-offline");
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
