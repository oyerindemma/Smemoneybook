import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import {
  assertSafeAuthSetupTarget,
  verifiedPreviewOriginEnv,
} from "./support/auth-setup";

const password = "password123";
const pin = "123456";

test.setTimeout(180_000);

function uniqueEmail(projectName: string) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `mobile-auth-${projectName}-${suffix}@example.com`;
}

async function signUpAndOnboard(page: Page, projectName: string) {
  const email = uniqueEmail(projectName);

  await page.goto("/auth");
  await page.waitForLoadState("networkidle");
  const startFreeButton = page.getByRole("button", { name: "Start Free" });
  const nameInput = page.getByRole("textbox", { name: "Your name", exact: true });
  if (await startFreeButton.isVisible()) {
    await startFreeButton.click();
    await expect(nameInput).toBeVisible();
  }
  await nameInput.fill("Mobile QA Owner");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(password);
  await page.getByLabel("6-digit access PIN").fill(pin);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("body")).toContainText(/Start using the app|Available (?:balance|Money)/i, {
    timeout: 60_000,
  });

  const startUsingAppButton = page.getByRole("button", { name: "Start using the app" });
  if (await startUsingAppButton.isVisible()) {
    await startUsingAppButton.click();
  }

  await expect(page.getByText(/Available (?:balance|Money)/i).first()).toBeVisible({
    timeout: 60_000,
  });

  return email;
}

async function signOut(page: Page) {
  await page.goto("/more");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  await expect(page.getByRole("link", { name: "Start Free" }).first()).toBeVisible();
}

async function signIn(page: Page, email: string) {
  await page.goto("/auth");
  const existingAccountButton = page.getByRole("button", { name: "I already have an account" });
  await expect(existingAccountButton).toBeVisible();
  await existingAccountButton.click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password or 6-digit PIN").fill(password);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText(/Available (?:balance|Money)/i).first()).toBeVisible({
    timeout: 60_000,
  });
}

test("signs up, signs out, and signs in on a mobile viewport", async ({ page }, testInfo) => {
  assertSafeAuthSetupTarget(
    testInfo.project.use.baseURL,
    process.env[verifiedPreviewOriginEnv],
  );

  const storageStatePath = testInfo.project.metadata.storageStatePath;
  if (typeof storageStatePath !== "string" || !storageStatePath) {
    throw new Error(`Missing storage-state path for ${testInfo.project.name}.`);
  }

  await page.addInitScript(() => {
    const style = document.createElement("style");
    style.textContent = "nextjs-portal { pointer-events: none !important; }";
    document.documentElement.appendChild(style);
  });

  const email = await signUpAndOnboard(page, testInfo.project.name);
  await signOut(page);
  await signIn(page, email);

  await expect(page.locator("body")).not.toContainText("Something went wrong");
  await mkdir(path.dirname(storageStatePath), { recursive: true });
  await page.context().storageState({ path: storageStatePath });
});
