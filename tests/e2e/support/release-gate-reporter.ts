import path from "node:path";
import type {
  FullConfig,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";
import {
  approvedReleaseScopeName,
  assessReleaseGateSkips,
  releaseGateTestKey,
  releaseScopeModeEnv,
  strictReleaseGateEnv,
} from "./release-gate-policy";

class ReleaseGateReporter implements Reporter {
  private selectedTestKeys: string[] = [];
  private skippedTestKeys: string[] = [];

  onBegin(_config: FullConfig, suite: Suite) {
    if (!this.isReleaseScopeRun()) {
      return;
    }

    this.selectedTestKeys = suite.allTests().map((test) => this.testKey(test));
  }

  onTestEnd(test: TestCase, result: TestResult) {
    if (this.isReleaseScopeRun() && result.status === "skipped") {
      this.skippedTestKeys.push(this.testKey(test));
    }
  }

  async onEnd() {
    if (!this.isReleaseScopeRun()) {
      return;
    }

    const strict = process.env[strictReleaseGateEnv] === "true";
    const assessment = assessReleaseGateSkips({
      selectedTestKeys: this.selectedTestKeys,
      skippedTestKeys: this.skippedTestKeys,
      strict,
    });

    if (!assessment.valid) {
      const details = [
        ...assessment.unexpectedSkips.map((key) => `Unexpected skip: ${key}`),
        ...assessment.missingExpectedTests.map((key) => `Expected release-gate test was not selected: ${key}`),
        ...assessment.expectedTestsNotSkipped.map((key) => `Intentionally gated test did not skip: ${key}`),
        ...assessment.duplicateSkips.map((key) => `Intentional skip occurred more than once: ${key}`),
      ];

      if (assessment.actualSkipCount !== assessment.expectedSkipCount && strict) {
        details.push(
          `Intentional skip total was ${assessment.actualSkipCount}; expected ${assessment.expectedSkipCount}.`,
        );
      }

      console.error(`\n[release-gate] Skip accounting failed.\n${details.join("\n")}`);
      return { status: "failed" as const };
    }

    if (strict) {
      console.log(
        `\n[release-gate] Skip accounting passed: ${assessment.actualSkipCount} intentional, 0 unexpected.`,
      );
    }
  }

  printsToStdio() {
    return true;
  }

  private isReleaseScopeRun() {
    return process.env[releaseScopeModeEnv] === approvedReleaseScopeName;
  }

  private testKey(test: TestCase) {
    const project = test.parent.project()?.name ?? "unknown-project";
    return releaseGateTestKey(project, path.basename(test.location.file), test.title);
  }
}

export default ReleaseGateReporter;
