import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

async function loadFlags() {
  vi.resetModules();
  return import("@/lib/phase3/feature-flags");
}

describe("Phase 3 feature flags", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("keeps every Phase 3 module disabled by default", async () => {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("NEXT_PUBLIC_PHASE3_") || key.startsWith("PHASE3_AI_")) {
        delete process.env[key];
      }
    }

    const { phase3FeatureFlags, phase3OperationalControls } = await loadFlags();

    expect(Object.values(phase3FeatureFlags).every((enabled) => enabled === false)).toBe(true);
    expect(phase3OperationalControls.aiEnabled).toBe(false);
    expect(phase3OperationalControls.globalKillSwitch).toBe(false);
    expect(phase3OperationalControls.monthlyCostBudgetKobo).toBe(0);
    expect(phase3OperationalControls.dailyRequestLimitPerBusiness).toBe(0);
  });

  it("enables only explicitly configured Phase 3 modules", async () => {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("NEXT_PUBLIC_PHASE3_") || key.startsWith("PHASE3_")) {
        delete process.env[key];
      }
    }

    process.env.NEXT_PUBLIC_PHASE3_AI_ADVISOR_ENABLED = "true";
    process.env.NEXT_PUBLIC_PHASE3_HEALTH_SCORE_ENABLED = "1";

    const { phase3FeatureFlags, isPhase3FeatureEnabled } = await loadFlags();

    expect(phase3FeatureFlags.aiAdvisor).toBe(true);
    expect(phase3FeatureFlags.healthScore).toBe(true);
    expect(isPhase3FeatureEnabled("executiveDashboard")).toBe(false);
  });

  it("lets the global kill switch override public flags", async () => {
    process.env.NEXT_PUBLIC_PHASE3_AI_ADVISOR_ENABLED = "true";
    process.env.NEXT_PUBLIC_PHASE3_HEALTH_SCORE_ENABLED = "true";
    process.env.PHASE3_AI_GLOBAL_KILL_SWITCH = "true";

    const { phase3FeatureFlags, requirePhase3Feature } = await loadFlags();
    const gate = requirePhase3Feature("aiAdvisor", "AI advisor");

    expect(Object.values(phase3FeatureFlags).every((enabled) => enabled === false)).toBe(true);
    expect(gate).toBeInstanceOf(Response);
    expect(gate?.status).toBe(503);
  });

  it("parses optional cost and request controls", async () => {
    process.env.PHASE3_AI_ENABLED = "true";
    process.env.PHASE3_AI_MONTHLY_COST_BUDGET_KOBO = "250000";
    process.env.PHASE3_AI_DAILY_REQUEST_LIMIT_PER_BUSINESS = "75";

    const { phase3OperationalControls } = await loadFlags();

    expect(phase3OperationalControls.aiEnabled).toBe(true);
    expect(phase3OperationalControls.monthlyCostBudgetKobo).toBe(250000);
    expect(phase3OperationalControls.dailyRequestLimitPerBusiness).toBe(75);
  });

  it("requires the private server flag before Loan Readiness can run server-side", async () => {
    process.env.NEXT_PUBLIC_PHASE3_LOAN_READINESS_ENABLED = "true";
    process.env.PHASE3_LOAN_READINESS_ENABLED = "false";

    const {
      isLoanReadinessFeatureEnabledForServer,
      requireLoanReadinessFeatureForServer,
    } = await loadFlags();

    expect(isLoanReadinessFeatureEnabledForServer()).toBe(false);
    expect(requireLoanReadinessFeatureForServer()?.status).toBe(404);
  });
});
