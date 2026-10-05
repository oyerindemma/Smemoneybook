import { describe, expect, it } from "vitest";
import {
  assertSafeAuthSetupTarget,
  phase3PreviewHostname,
} from "../e2e/support/auth-setup";

const immutablePreview =
  "https://smemoneybook-rc9qyurg8-emmanuel-oyerindes-projects.vercel.app";

describe("Playwright auth setup target guard", () => {
  it.each([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://[::1]:3000",
  ])("allows local test target %s", (target) => {
    expect(() => assertSafeAuthSetupTarget(target, undefined)).not.toThrow();
  });

  it("allows the approved phase-3-staging alias", () => {
    expect(() =>
      assertSafeAuthSetupTarget(`https://${phase3PreviewHostname}`, undefined),
    ).not.toThrow();
  });

  it("allows the exact immutable Preview with matching verified context", () => {
    expect(() =>
      assertSafeAuthSetupTarget(immutablePreview, immutablePreview),
    ).not.toThrow();
  });

  it.each([
    "https://smemoneybook.com",
    "https://smemoneybook.vercel.app",
    "https://unrelated-preview-abc123.vercel.app",
  ])("rejects Production and arbitrary external target %s", (target) => {
    expect(() => assertSafeAuthSetupTarget(target, target)).toThrow(
      "Auth setup is restricted",
    );
  });

  it("rejects an immutable Preview without verified context", () => {
    expect(() => assertSafeAuthSetupTarget(immutablePreview, undefined)).toThrow(
      "requires verified release-gate context",
    );
  });

  it("rejects mismatched and unsafe immutable Preview origins", () => {
    expect(() =>
      assertSafeAuthSetupTarget(
        immutablePreview,
        "https://smemoneybook-aaaaaaaaa-emmanuel-oyerindes-projects.vercel.app",
      ),
    ).toThrow("requires verified release-gate context");
    expect(() =>
      assertSafeAuthSetupTarget(immutablePreview.replace("https:", "http:"), immutablePreview),
    ).toThrow("Auth setup is restricted");
    expect(() =>
      assertSafeAuthSetupTarget(`${immutablePreview}/auth`, immutablePreview),
    ).toThrow("requires a root Preview or local test URL");
  });

  it("rejects malformed URLs and malformed verification context", () => {
    expect(() => assertSafeAuthSetupTarget("not a URL", undefined)).toThrow(
      "requires a valid Preview or local test base URL",
    );
    expect(() => assertSafeAuthSetupTarget(undefined, undefined)).toThrow(
      "requires an explicit Preview or local test base URL",
    );
    expect(() => assertSafeAuthSetupTarget(immutablePreview, "not a URL")).toThrow(
      "requires verified release-gate context",
    );
  });

  it("cannot target Production merely by setting PLAYWRIGHT_BASE_URL", () => {
    expect(() => assertSafeAuthSetupTarget("https://smemoneybook.com", undefined)).toThrow(
      "Auth setup is restricted",
    );
  });
});
