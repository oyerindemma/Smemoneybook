export const releaseScopeModeEnv = "SME_MONEYBOOK_E2E_RELEASE_SCOPE";
export const strictReleaseGateEnv = "SME_MONEYBOOK_E2E_RELEASE_GATE_STRICT";
export const approvedReleaseScopeName = "approved-production-candidate";

export const requiredEligibleReleaseScopeFlags = [
  "NEXT_PUBLIC_PHASE2_LOCATIONS_ENABLED",
  "NEXT_PUBLIC_PHASE2_TRANSFERS_ENABLED",
  "NEXT_PUBLIC_PHASE2_REPORTING_CENTRE_ENABLED",
  "NEXT_PUBLIC_PHASE2_TAX_ENABLED",
  "NEXT_PUBLIC_PHASE3_STAFF_PERFORMANCE_ENABLED",
  "PHASE3_STAFF_PERFORMANCE_ENABLED",
  "NEXT_PUBLIC_PHASE3_EXECUTIVE_DASHBOARD_ENABLED",
  "PHASE3_EXECUTIVE_DASHBOARD_ENABLED",
  "NEXT_PUBLIC_PHASE3_BANK_RECONCILIATION_ENABLED",
  "PHASE3_BANK_RECONCILIATION_ENABLED",
  "NEXT_PUBLIC_PHASE3_PREDICTIVE_ALERTS_ENABLED",
  "PHASE3_PREDICTIVE_ALERTS_ENABLED",
  "NEXT_PUBLIC_PHASE3_COOPERATIVES_ENABLED",
  "PHASE3_COOPERATIVES_ENABLED",
  "NEXT_PUBLIC_PHASE3_LOAN_READINESS_ENABLED",
  "PHASE3_LOAN_READINESS_ENABLED",
] as const;

export const intentionallyDisabledReleaseScopeFlags = [
  "NEXT_PUBLIC_PHASE3_PAYROLL_ENABLED",
  "PHASE3_PAYROLL_ENABLED",
  "NEXT_PUBLIC_PHASE3_TAX_ASSISTANT_ENABLED",
  "PHASE3_TAX_ASSISTANT_ENABLED",
  "PHASE3_AI_ENABLED",
  "NEXT_PUBLIC_PHASE3_AI_EVALUATION_ENABLED",
  "PHASE3_AI_EVALUATION_ENABLED",
  "NEXT_PUBLIC_PHASE3_AI_MARKETING_ENABLED",
  "PHASE3_AI_MARKETING_ENABLED",
  "PHASE3_AI_MARKETING_SENDING_ENABLED",
  "PHASE3_PREDICTIVE_ALERTS_AI_EXPLANATION_ENABLED",
  "NEXT_PUBLIC_PHASE3_WHATSAPP_AUTOMATION_ENABLED",
] as const;

type RequiredReleaseScopeFlag = (typeof requiredEligibleReleaseScopeFlags)[number];
type DisabledReleaseScopeFlag = (typeof intentionallyDisabledReleaseScopeFlags)[number];
export type ReleaseScopeFlag = RequiredReleaseScopeFlag | DisabledReleaseScopeFlag;
export type ReleaseScope = Partial<Record<ReleaseScopeFlag, boolean>>;

export const approvedReleaseScope: Readonly<Record<ReleaseScopeFlag, boolean>> = {
  NEXT_PUBLIC_PHASE2_LOCATIONS_ENABLED: true,
  NEXT_PUBLIC_PHASE2_TRANSFERS_ENABLED: true,
  NEXT_PUBLIC_PHASE2_REPORTING_CENTRE_ENABLED: true,
  NEXT_PUBLIC_PHASE2_TAX_ENABLED: true,
  NEXT_PUBLIC_PHASE3_STAFF_PERFORMANCE_ENABLED: true,
  PHASE3_STAFF_PERFORMANCE_ENABLED: true,
  NEXT_PUBLIC_PHASE3_EXECUTIVE_DASHBOARD_ENABLED: true,
  PHASE3_EXECUTIVE_DASHBOARD_ENABLED: true,
  NEXT_PUBLIC_PHASE3_BANK_RECONCILIATION_ENABLED: true,
  PHASE3_BANK_RECONCILIATION_ENABLED: true,
  NEXT_PUBLIC_PHASE3_PREDICTIVE_ALERTS_ENABLED: true,
  PHASE3_PREDICTIVE_ALERTS_ENABLED: true,
  NEXT_PUBLIC_PHASE3_COOPERATIVES_ENABLED: true,
  PHASE3_COOPERATIVES_ENABLED: true,
  NEXT_PUBLIC_PHASE3_LOAN_READINESS_ENABLED: true,
  PHASE3_LOAN_READINESS_ENABLED: true,
  NEXT_PUBLIC_PHASE3_PAYROLL_ENABLED: false,
  PHASE3_PAYROLL_ENABLED: false,
  NEXT_PUBLIC_PHASE3_TAX_ASSISTANT_ENABLED: false,
  PHASE3_TAX_ASSISTANT_ENABLED: false,
  PHASE3_AI_ENABLED: false,
  NEXT_PUBLIC_PHASE3_AI_EVALUATION_ENABLED: false,
  PHASE3_AI_EVALUATION_ENABLED: false,
  NEXT_PUBLIC_PHASE3_AI_MARKETING_ENABLED: false,
  PHASE3_AI_MARKETING_ENABLED: false,
  PHASE3_AI_MARKETING_SENDING_ENABLED: false,
  PHASE3_PREDICTIVE_ALERTS_AI_EXPLANATION_ENABLED: false,
  NEXT_PUBLIC_PHASE3_WHATSAPP_AUTOMATION_ENABLED: false,
};

export function validateReleaseScope(scope: ReleaseScope) {
  const allFlags: readonly ReleaseScopeFlag[] = [
    ...requiredEligibleReleaseScopeFlags,
    ...intentionallyDisabledReleaseScopeFlags,
  ];
  const missing = allFlags.filter((flag) => scope[flag] === undefined);
  const requiredDisabled = requiredEligibleReleaseScopeFlags.filter(
    (flag) => scope[flag] !== undefined && scope[flag] !== true,
  );
  const gatedEnabled = intentionallyDisabledReleaseScopeFlags.filter(
    (flag) => scope[flag] !== undefined && scope[flag] !== false,
  );
  const problems: string[] = [];

  if (missing.length > 0) {
    problems.push(`Missing release-scope variables: ${missing.join(", ")}`);
  }
  if (requiredDisabled.length > 0) {
    problems.push(`Eligible release-scope variables must be enabled: ${requiredDisabled.join(", ")}`);
  }
  if (gatedEnabled.length > 0) {
    problems.push(`Intentionally gated release-scope variables must be disabled: ${gatedEnabled.join(", ")}`);
  }

  if (problems.length > 0) {
    throw new Error(`Invalid Playwright release scope.\n${problems.join("\n")}`);
  }
}

export function installApprovedReleaseScope(environment: NodeJS.ProcessEnv = process.env) {
  validateReleaseScope(approvedReleaseScope);

  for (const [flag, enabled] of Object.entries(approvedReleaseScope)) {
    environment[flag] = enabled ? "true" : "false";
  }

  const missingRequired = requiredEligibleReleaseScopeFlags.filter(
    (flag) => environment[flag] === undefined,
  );
  if (missingRequired.length > 0) {
    throw new Error(`Missing required Playwright release-scope variables: ${missingRequired.join(", ")}`);
  }
}

const releaseGateProjects = ["chromium", "mobile-chrome", "mobile-safari"] as const;
const intentionalSkipSpecs = [
  {
    file: "payroll.spec.ts",
    title: "creates employee, calculates payroll, approves, posts expense, exports, and blocks duplicates",
  },
  { file: "payroll.spec.ts", title: "handles empty and unauthorized states" },
  {
    file: "tax-assistant.spec.ts",
    title: "loads summary, filters periods, opens review items, asks, exports, and handles empty/denied states",
  },
  {
    file: "ai-evaluation.spec.ts",
    title: "runs suite, inspects results, compares, accepts baseline, and exports",
  },
  {
    file: "ai-evaluation.spec.ts",
    title: "handles empty state, unauthorized access, business isolation, cancellation, and method guards",
  },
  {
    file: "ai-marketing.spec.ts",
    title: "creates, drafts, approves, blocks sending, exports, and records opt-out",
  },
  { file: "ai-marketing.spec.ts", title: "handles empty and unauthorized states" },
] as const;

// Tax Assistant's current scenario combines deterministic and provider-backed AI behavior.
// Split that coverage before adding a deterministic-only Tax Assistant release gate.
export const expectedIntentionalSkipKeys = releaseGateProjects.flatMap((project) =>
  intentionalSkipSpecs.map(({ file, title }) => releaseGateTestKey(project, file, title)),
);

export function releaseGateTestKey(project: string, file: string, title: string) {
  return `${project} | ${file} | ${title}`;
}

export function assessReleaseGateSkips({
  selectedTestKeys,
  skippedTestKeys,
  strict,
}: {
  selectedTestKeys: readonly string[];
  skippedTestKeys: readonly string[];
  strict: boolean;
}) {
  const expected = new Set(expectedIntentionalSkipKeys);
  const selected = new Set(selectedTestKeys);
  const skipped = new Set(skippedTestKeys);
  const unexpectedSkips = [...skipped].filter((key) => !expected.has(key));
  const missingExpectedTests = strict
    ? expectedIntentionalSkipKeys.filter((key) => !selected.has(key))
    : [];
  const expectedTestsNotSkipped = strict
    ? expectedIntentionalSkipKeys.filter((key) => selected.has(key) && !skipped.has(key))
    : [];
  const duplicateSkips = strict
    ? [...skipped].filter((key) => skippedTestKeys.filter((candidate) => candidate === key).length !== 1)
    : [];
  const wrongSkipTotal = strict && skippedTestKeys.length !== expectedIntentionalSkipKeys.length;

  return {
    valid:
      unexpectedSkips.length === 0 &&
      missingExpectedTests.length === 0 &&
      expectedTestsNotSkipped.length === 0 &&
      duplicateSkips.length === 0 &&
      !wrongSkipTotal,
    unexpectedSkips,
    missingExpectedTests,
    expectedTestsNotSkipped,
    duplicateSkips,
    expectedSkipCount: expectedIntentionalSkipKeys.length,
    actualSkipCount: skippedTestKeys.length,
  };
}
