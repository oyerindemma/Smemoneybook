import type { ExecutiveDashboardSummary } from "@/lib/executive-dashboard/definitions";

export const executiveDashboardSnapshotTtlMs = 10 * 60 * 1000;

export function isExecutiveDashboardSnapshotFresh({
  generatedAt,
  now = new Date(),
  ttlMs = executiveDashboardSnapshotTtlMs,
}: {
  generatedAt: Date | string;
  now?: Date;
  ttlMs?: number;
}) {
  return now.getTime() - new Date(generatedAt).getTime() <= ttlMs;
}

export function snapshotDisclosure(summary: ExecutiveDashboardSummary) {
  return summary.freshness.stale
    ? "This Executive Dashboard has stale source data for the selected period."
    : "This Executive Dashboard was calculated on demand from current SME MoneyBook records.";
}
