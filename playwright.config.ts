import { defineConfig, devices } from "@playwright/test";
import { authStatePath } from "./tests/e2e/support/auth-setup";
import {
  approvedReleaseScopeName,
  installApprovedReleaseScope,
  releaseScopeModeEnv,
} from "./tests/e2e/support/release-gate-policy";

if (process.env[releaseScopeModeEnv] === approvedReleaseScopeName) {
  installApprovedReleaseScope();
}

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const shouldStartWebServer = !process.env.PLAYWRIGHT_BASE_URL;
const chromiumAuthState = authStatePath("chromium");
const mobileChromeAuthState = authStatePath("mobile-chrome");
const mobileSafariAuthState = authStatePath("mobile-safari");
const authenticatedSetup = /auth\.setup\.ts/;
const mobileReadiness = /mobile-readiness\.spec\.ts/;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["./tests/e2e/support/release-gate-reporter.ts"]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "setup-chromium",
      testMatch: authenticatedSetup,
      metadata: { storageStatePath: chromiumAuthState },
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "setup-mobile-chrome",
      testMatch: authenticatedSetup,
      metadata: { storageStatePath: mobileChromeAuthState },
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "setup-mobile-safari",
      testMatch: authenticatedSetup,
      metadata: { storageStatePath: mobileSafariAuthState },
      use: { ...devices["iPhone 13"] },
    },
    {
      name: "chromium",
      testIgnore: [authenticatedSetup, mobileReadiness],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chrome",
      testIgnore: [authenticatedSetup, mobileReadiness],
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "mobile-safari",
      testIgnore: [authenticatedSetup, mobileReadiness],
      use: { ...devices["iPhone 13"] },
    },
    {
      name: "mobile-readiness-chromium",
      testMatch: mobileReadiness,
      dependencies: ["setup-chromium"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: chromiumAuthState,
      },
    },
    {
      name: "mobile-readiness-mobile-chrome",
      testMatch: mobileReadiness,
      dependencies: ["setup-mobile-chrome"],
      use: {
        ...devices["Pixel 5"],
        storageState: mobileChromeAuthState,
      },
    },
    {
      name: "mobile-readiness-mobile-safari",
      testMatch: mobileReadiness,
      dependencies: ["setup-mobile-safari"],
      use: {
        ...devices["iPhone 13"],
        storageState: mobileSafariAuthState,
      },
    },
  ],
  webServer: shouldStartWebServer
    ? {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      }
    : undefined,
});
