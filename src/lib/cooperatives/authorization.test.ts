import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

describe("cooperatives authorization flags", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("requires both exact Cooperatives flags on the server", async () => {
    process.env.PHASE3_AI_GLOBAL_KILL_SWITCH = "false";
    process.env.PHASE3_COOPERATIVES_ENABLED = "true";
    process.env.NEXT_PUBLIC_PHASE3_COOPERATIVES_ENABLED = "true";
    const { isCooperativesFeatureEnabledForServer } = await import("@/lib/cooperatives/authorization");

    expect(isCooperativesFeatureEnabledForServer()).toBe(true);
  });

  it("does not enable APIs from the public flag alone", async () => {
    process.env.PHASE3_AI_GLOBAL_KILL_SWITCH = "false";
    process.env.PHASE3_COOPERATIVES_ENABLED = "false";
    process.env.NEXT_PUBLIC_PHASE3_COOPERATIVES_ENABLED = "true";
    const { isCooperativesFeatureEnabledForServer } = await import("@/lib/cooperatives/authorization");

    expect(isCooperativesFeatureEnabledForServer()).toBe(false);
  });

  it("respects the Phase 3 global kill switch", async () => {
    process.env.PHASE3_AI_GLOBAL_KILL_SWITCH = "true";
    process.env.PHASE3_COOPERATIVES_ENABLED = "true";
    process.env.NEXT_PUBLIC_PHASE3_COOPERATIVES_ENABLED = "true";
    const { isCooperativesFeatureEnabledForServer } = await import("@/lib/cooperatives/authorization");

    expect(isCooperativesFeatureEnabledForServer()).toBe(false);
  });
});
