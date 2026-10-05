export type AssistantMetricKind = "recorded" | "estimated" | "forecast" | "recommendation";
export type AssistantMetricConfidence = "high" | "medium" | "low" | "insufficient_data";

export type AssistantSourceCitation = {
  id: string;
  label: string;
  metricVersion: "phase3b-advisor-v1";
  kind: AssistantMetricKind;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  sourceTables: string[];
  confidence: AssistantMetricConfidence;
  dataWarnings: string[];
};

export function createAssistantCitation(input: Omit<AssistantSourceCitation, "metricVersion">) {
  return {
    ...input,
    metricVersion: "phase3b-advisor-v1" as const,
  };
}

export function formatAssistantGrounding(citations: AssistantSourceCitation[]) {
  if (citations.length === 0) {
    return "";
  }

  const sourceList = citations
    .map((citation) => {
      const period = formatPeriod(citation.periodStart, citation.periodEnd);
      const tables = citation.sourceTables.join(", ");
      return `${citation.label}: ${citation.kind}, ${period}, confidence ${citation.confidence}, sources ${tables}`;
    })
    .join("; ");

  return `\n\nGrounding: ${sourceList}.`;
}

function formatPeriod(start: string, end: string) {
  const startDate = new Date(start);
  const endDate = new Date(end);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return "period unavailable";
  }

  return `${startDate.toLocaleDateString("en-NG")} to ${endDate.toLocaleDateString("en-NG")}`;
}
