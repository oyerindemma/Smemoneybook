import { describe, expect, it } from "vitest";
import { getDefaultAiEvaluationCases, getSyntheticProviderOutput } from "@/lib/ai-evaluation/datasets";
import {
  approvedAiEvaluationTools,
  type AiEvaluationProviderOutput,
} from "@/lib/ai-evaluation/definitions";
import {
  evaluateAiEvaluationCase,
  evaluateBusinessIsolation,
  evaluateCitationRuleVersion,
  evaluateCost,
  evaluateForbiddenTools,
  evaluateLatency,
  evaluateMissingDataDisclosure,
  evaluateNumericAccuracy,
  evaluateReadOnlyCompliance,
  evaluateRefusal,
  evaluateRequiredTools,
  evaluateResponseFormat,
  evaluateSensitiveDataLeakage,
  evaluateTokenLimit,
  evaluateToolAuthorization,
  evaluateUnsupportedClaimHandling,
} from "@/lib/ai-evaluation/evaluators";

const cases = getDefaultAiEvaluationCases();
const taxCase = cases.find((item) => item.key === "tax_vat_numeric")!;
const crossBusinessCase = cases.find((item) => item.key === "cross_business_access")!;
const missingDataCase = cases.find((item) => item.key === "tax_missing_receipts")!;
const unsupportedCase = cases.find((item) => item.key === "tax_unsupported_legal_claim")!;
const secretCase = cases.find((item) => item.key === "sensitive_data_request")!;
const highCostCase = cases.find((item) => item.key === "high_cost_prompt_attempt")!;

describe("Phase 3F deterministic AI evaluators", () => {
  it("runs the full evaluator set for the versioned synthetic dataset", () => {
    const ids = new Set<string>();

    for (const caseDefinition of cases) {
      const output = getSyntheticProviderOutput(caseDefinition.key);
      const results = evaluateAiEvaluationCase(caseDefinition, output);
      results.forEach((result) => ids.add(result.id));
    }

    expect(ids).toEqual(
      new Set([
        "tool_authorization",
        "required_tool",
        "forbidden_tool",
        "numeric_accuracy",
        "citation_rule_version",
        "business_isolation",
        "sensitive_data_leakage",
        "missing_data_disclosure",
        "unsupported_claim",
        "refusal",
        "read_only_compliance",
        "latency",
        "cost",
        "token_limit",
        "response_format",
      ]),
    );
  });

  it("passes grounding, authorization, citation, numeric, missing-data, refusal, and read-only checks on compliant fixtures", () => {
    const output = getSyntheticProviderOutput("tax_vat_numeric");

    expect(evaluateToolAuthorization({ caseDefinition: taxCase, output }).passed).toBe(true);
    expect(evaluateRequiredTools({ caseDefinition: taxCase, output }).passed).toBe(true);
    expect(evaluateForbiddenTools({ caseDefinition: taxCase, output }).passed).toBe(true);
    expect(evaluateNumericAccuracy({ caseDefinition: taxCase, output }).passed).toBe(true);
    expect(evaluateCitationRuleVersion({ caseDefinition: taxCase, output }).passed).toBe(true);
    expect(evaluateBusinessIsolation({ caseDefinition: taxCase, output }).passed).toBe(true);
    expect(evaluateSensitiveDataLeakage({ caseDefinition: secretCase, output: getSyntheticProviderOutput("sensitive_data_request") }).passed).toBe(true);
    expect(evaluateMissingDataDisclosure({ caseDefinition: missingDataCase, output: getSyntheticProviderOutput("tax_missing_receipts") }).passed).toBe(true);
    expect(evaluateUnsupportedClaimHandling({ caseDefinition: unsupportedCase, output: getSyntheticProviderOutput("tax_unsupported_legal_claim") }).passed).toBe(true);
    expect(evaluateRefusal({ caseDefinition: unsupportedCase, output: getSyntheticProviderOutput("tax_unsupported_legal_claim") }).passed).toBe(true);
    expect(evaluateReadOnlyCompliance({ caseDefinition: taxCase, output }).passed).toBe(true);
    expect(evaluateLatency({ caseDefinition: taxCase, output }).passed).toBe(true);
    expect(evaluateCost({ caseDefinition: taxCase, output }).passed).toBe(true);
    expect(evaluateTokenLimit({ caseDefinition: taxCase, output }).passed).toBe(true);
    expect(evaluateResponseFormat({ caseDefinition: taxCase, output }).passed).toBe(true);
  });

  it("marks critical failures for cross-business exposure, unauthorized tools, write tools, secret leakage, fabricated citation, and numeric errors", () => {
    const output = getSyntheticProviderOutput("tax_vat_numeric");

    expect(
      evaluateBusinessIsolation({
        caseDefinition: crossBusinessCase,
        output: {
          ...getSyntheticProviderOutput("cross_business_access"),
          response: "Here is synthetic_biz_other data.",
        },
      }).critical,
    ).toBe(true);
    expect(
      evaluateToolAuthorization({
        caseDefinition: taxCase,
        output: withTool(output, { name: "unapproved_tool", authorized: false }),
      }).critical,
    ).toBe(true);
    expect(
      evaluateForbiddenTools({
        caseDefinition: taxCase,
        output: withTool(output, { name: "pay_tax", authorized: true }),
      }).critical,
    ).toBe(true);
    expect(
      evaluateReadOnlyCompliance({
        caseDefinition: taxCase,
        output: withTool(output, { name: "record_payment", authorized: true, readOnly: false }),
      }).critical,
    ).toBe(true);
    expect(
      evaluateSensitiveDataLeakage({
        caseDefinition: secretCase,
        output: { ...getSyntheticProviderOutput("sensitive_data_request"), response: "OPENAI_API_KEY=sk-testsecret123" },
      }).critical,
    ).toBe(true);
    expect(
      evaluateCitationRuleVersion({
        caseDefinition: taxCase,
        output: { ...output, citations: [{ source: "synthetic", reference: "fake", ruleVersion: "fabricated-v9" }] },
      }).critical,
    ).toBe(true);
    expect(
      evaluateNumericAccuracy({
        caseDefinition: taxCase,
        output: { ...output, facts: { outputVatEstimate: 1, eligibleInputVatEstimate: 1, netVatEstimate: 1 } },
      }).critical,
    ).toBe(true);
  });

  it("flags latency, token, cost, and response-format failures transparently", () => {
    const output = getSyntheticProviderOutput("high_cost_prompt_attempt");

    expect(evaluateLatency({ caseDefinition: highCostCase, output: { ...output, latencyMs: 9_000 } }).passed).toBe(false);
    expect(evaluateTokenLimit({ caseDefinition: highCostCase, output: { ...output, tokenUsage: { promptTokens: 900, completionTokens: 900, totalTokens: 1_800 } } }).passed).toBe(false);
    expect(evaluateCost({ caseDefinition: highCostCase, output: { ...output, estimatedCostKobo: 500 } }).passed).toBe(false);
    expect(evaluateResponseFormat({ caseDefinition: highCostCase, output: { ...output, response: "Too broad." } }).passed).toBe(false);
  });
});

function withTool(
  output: AiEvaluationProviderOutput,
  tool: { name: string; authorized: boolean; readOnly?: boolean },
): AiEvaluationProviderOutput {
  return {
    ...output,
    toolCalls: [
      ...output.toolCalls,
      {
        name: tool.name,
        ok: true,
        authorized: tool.authorized,
        readOnly: tool.readOnly ?? true,
        businessId: "synthetic_biz_primary",
        sourceTables: [...approvedAiEvaluationTools],
      },
    ],
  };
}
