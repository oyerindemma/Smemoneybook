import type { PredictiveAlertRecord } from "@/lib/predictive-alerts/definitions";

export function predictiveAlertsCsvFilename() {
  return `predictive-alerts-${new Date().toISOString().slice(0, 10)}.csv`;
}

export function predictiveAlertsToCsv({
  alerts,
  generatedBy,
}: {
  alerts: PredictiveAlertRecord[];
  generatedBy: string;
}) {
  const rows = [
    ["section", "field", "value", "source"],
    ["export", "generated_by", generatedBy, "User"],
    ["export", "generated_at", new Date().toISOString(), "PredictiveAlerts"],
  ];

  for (const alert of alerts) {
    rows.push(["alert", "id", alert.id, "PredictiveAlert"]);
    rows.push(["alert", "rule_key", alert.ruleKey, "PredictiveAlertRule"]);
    rows.push(["alert", "category", alert.category, "PredictiveAlert"]);
    rows.push(["alert", "severity", alert.severity, "PredictiveAlert"]);
    rows.push(["alert", "status", alert.lifecycleStatus, "PredictiveAlert"]);
    rows.push(["alert", "title", alert.title, "PredictiveAlert"]);
    rows.push(["alert", "explanation", alert.explanation, "PredictiveAlert"]);
    rows.push(["alert", "recommended_action", alert.recommendedAction, "PredictiveAlert"]);
    rows.push(["alert", "formula", alert.evidence.formula, "PredictiveAlert.evidence"]);
    rows.push(["alert", "formula_reference", alert.formulaReference, "PredictiveAlert"]);
    rows.push(["alert", "period_start", alert.period.start, "PredictiveAlert"]);
    rows.push(["alert", "period_end", alert.period.end, "PredictiveAlert"]);
    rows.push(["alert", "impact_amount", String(alert.impactAmount), "PredictiveAlert"]);
    rows.push(["alert", "confidence", String(alert.confidence), "PredictiveAlert"]);
    rows.push(["alert", "source_data", alert.evidence.sourceData.join("; "), "PredictiveAlert.evidence"]);
    rows.push(["alert", "missing_data", alert.evidence.missingData.join("; "), "PredictiveAlert.evidence"]);

    for (const [key, value] of Object.entries(alert.evidence.metricValues)) {
      rows.push(["metric", key, String(value), "PredictiveAlert.evidence.metricValues"]);
    }

    for (const [key, value] of Object.entries(alert.evidence.threshold)) {
      rows.push(["threshold", key, String(value), "PredictiveAlert.evidence.threshold"]);
    }
  }

  return rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
}

function escapeCsv(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}
