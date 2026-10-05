import { afterEach, describe, expect, it } from "vitest";
import { getDefaultAiEvaluationDataset } from "@/lib/ai-evaluation/datasets";
import {
  createSyntheticAiEvaluationProvider,
  getAiEvaluationProviderSetupStatus,
  TransientAiEvaluationProviderError,
} from "@/lib/ai-evaluation/runner";
import { redactAiEvaluationResponse } from "@/lib/ai-evaluation/report";

const originalEnv = { ...process.env };

describe("AI Evaluation runner utilities", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("uses a versioned synthetic dataset without production customer data", () => {
    const dataset = getDefaultAiEvaluationDataset();

    expect(dataset.version).toBe("phase3f-synthetic-v1");
    expect(dataset.cases.length).toBeGreaterThanOrEqual(15);
    expect(dataset.cases.every((item) => item.fixtureReference.startsWith("synthetic/"))).toBe(true);
  });

  it("reports provider setup required without printing secret values", () => {
    process.env.OPENAI_API_KEY = "[SENSITIVE]";
    process.env.OPENAI_MODEL = "[SENSITIVE]";

    expect(getAiEvaluationProviderSetupStatus()).toEqual({
      configured: false,
      model: null,
      deterministicProviderAvailable: true,
    });
  });

  it("surfaces transient provider failures for bounded retry handling", async () => {
    const provider = createSyntheticAiEvaluationProvider();
    const providerFailureCase = getDefaultAiEvaluationDataset().cases.find(
      (item) => item.key === "provider_failure_retry",
    )!;

    await expect(provider.evaluateCase(providerFailureCase)).rejects.toBeInstanceOf(TransientAiEvaluationProviderError);
    await expect(provider.evaluateCase(providerFailureCase)).resolves.toMatchObject({
      response: expect.stringContaining("fallback"),
    });
  });

  it("redacts secrets and database URLs from exportable responses", () => {
    expect(
      redactAiEvaluationResponse("OPENAI_API_KEY=sk-secretvalue postgres://user:pass@example/db token=abcdef123456"),
    ).not.toContain("sk-secretvalue");
  });
});
