import type {
  PredictiveAlertEvidence,
  PredictiveAlertRuleDefinition,
} from "@/lib/predictive-alerts/definitions";

export function buildPredictiveAlertEvidence({
  rule,
  whatChanged,
  comparedPeriod,
  metricValues,
  threshold,
  missingData = [],
  recommendedReviewAction,
  disclaimer,
}: {
  rule: PredictiveAlertRuleDefinition;
  whatChanged: string;
  comparedPeriod: string;
  metricValues: PredictiveAlertEvidence["metricValues"];
  threshold?: PredictiveAlertEvidence["threshold"];
  missingData?: string[];
  recommendedReviewAction: string;
  disclaimer?: string;
}): PredictiveAlertEvidence {
  return {
    whatChanged,
    comparedPeriod,
    metricValues,
    threshold: threshold ?? rule.thresholdConfig,
    formula: rule.formula,
    sourceData: rule.sourceData,
    missingData,
    recommendedReviewAction,
    disclaimer,
  };
}

export function aiExplanationsEnabled() {
  return readFlag(process.env.PHASE3_PREDICTIVE_ALERTS_AI_EXPLANATION_ENABLED, false);
}

export function deterministicExplanation(text: string) {
  return sanitizeAlertLanguage(text);
}

export function sanitizeAlertLanguage(text: string) {
  return text
    .replace(/\bfraud\b/gi, "duplicate or unusual entry")
    .replace(/\bfailing\b/gi, "under pressure")
    .replace(/\bwill fail\b/gi, "needs review")
    .replace(/\bemployee performance\b/gi, "staff activity attribution");
}

function readFlag(value: string | undefined, defaultValue: boolean) {
  if (value === undefined) {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
