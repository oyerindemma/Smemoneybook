import type {
  ExecutiveDashboardDataQualityStatus,
  ExecutiveDashboardMetric,
  ExecutiveDashboardPeriod,
  ExecutiveDashboardTrendDirection,
} from "@/lib/executive-dashboard/definitions";

export function metric<T>({
  value,
  comparisonValue,
  period,
  comparisonPeriod,
  formulaId,
  sourceService,
  dataQualityStatus,
  lastCalculatedAt,
  businessId,
  unit,
  notes,
}: {
  value: T;
  comparisonValue?: T;
  period: ExecutiveDashboardPeriod;
  comparisonPeriod: ExecutiveDashboardPeriod;
  formulaId: string;
  sourceService: string;
  dataQualityStatus: ExecutiveDashboardDataQualityStatus;
  lastCalculatedAt: string;
  businessId: string;
  unit?: ExecutiveDashboardMetric<T>["unit"];
  notes?: string[];
}): ExecutiveDashboardMetric<T> {
  return {
    value,
    period,
    comparisonPeriod,
    comparisonValue,
    change: numericChange(value, comparisonValue),
    formulaId,
    sourceService,
    dataQualityStatus,
    lastCalculatedAt,
    businessId,
    unit,
    notes,
  };
}

export function numericChange<T>(value: T, comparisonValue?: T) {
  if (typeof value !== "number" || typeof comparisonValue !== "number") {
    return undefined;
  }

  const amount = roundMoney(value - comparisonValue);
  const direction: ExecutiveDashboardTrendDirection =
    comparisonValue === 0 && value !== 0
      ? "new"
      : Math.abs(amount) < 0.01
        ? "flat"
        : amount > 0
          ? "up"
          : "down";
  const percent =
    comparisonValue === 0
      ? value === 0
        ? 0
        : null
      : roundPercent((amount / Math.abs(comparisonValue)) * 100);

  return {
    amount,
    percent,
    direction,
  };
}

export function worstStatus(statuses: ExecutiveDashboardDataQualityStatus[]): ExecutiveDashboardDataQualityStatus {
  if (statuses.includes("setup_required")) return "setup_required";
  if (statuses.includes("insufficient_data")) return "insufficient_data";
  if (statuses.includes("stale")) return "stale";
  if (statuses.includes("partial")) return "partial";
  return "complete";
}

export function statusFromCounts({
  total,
  incomplete,
  setupRequired = false,
}: {
  total: number;
  incomplete: number;
  setupRequired?: boolean;
}): ExecutiveDashboardDataQualityStatus {
  if (setupRequired) return "setup_required";
  if (total === 0) return "insufficient_data";
  if (incomplete > 0) return "partial";
  return "complete";
}

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function roundPercent(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function ageingBandLabel(days: number) {
  if (days <= 30) return "0-30 days";
  if (days <= 60) return "31-60 days";
  if (days <= 90) return "61-90 days";
  return "90+ days";
}
