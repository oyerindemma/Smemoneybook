import { describe, expect, it } from "vitest";
import {
  approvedReleaseScope,
  assessReleaseGateSkips,
  expectedIntentionalSkipKeys,
  validateReleaseScope,
  type ReleaseScope,
} from "../e2e/support/release-gate-policy";

describe("Playwright release-gate policy", () => {
  it("accepts the approved release scope", () => {
    expect(() => validateReleaseScope(approvedReleaseScope)).not.toThrow();
    expect(expectedIntentionalSkipKeys).toHaveLength(21);
    expect(new Set(expectedIntentionalSkipKeys).size).toBe(21);
  });

  it("fails fast and names a missing required eligible flag", () => {
    const incompleteScope: ReleaseScope = { ...approvedReleaseScope };
    delete incompleteScope.PHASE3_LOAN_READINESS_ENABLED;

    expect(() => validateReleaseScope(incompleteScope)).toThrow(
      "Missing release-scope variables: PHASE3_LOAN_READINESS_ENABLED",
    );
  });

  it("accepts exactly the approved intentional skips", () => {
    expect(
      assessReleaseGateSkips({
        selectedTestKeys: expectedIntentionalSkipKeys,
        skippedTestKeys: expectedIntentionalSkipKeys,
        strict: true,
      }),
    ).toMatchObject({ valid: true, expectedSkipCount: 21, actualSkipCount: 21 });
  });

  it("rejects an unexpected skip", () => {
    expect(
      assessReleaseGateSkips({
        selectedTestKeys: ["chromium | staff-performance.spec.ts | eligible scenario"],
        skippedTestKeys: ["chromium | staff-performance.spec.ts | eligible scenario"],
        strict: false,
      }),
    ).toMatchObject({
      valid: false,
      unexpectedSkips: ["chromium | staff-performance.spec.ts | eligible scenario"],
    });
  });
});
