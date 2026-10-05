import type { ExecutiveDashboardSummary } from "@/lib/executive-dashboard/definitions";
import {
  getExecutiveDashboardSummary,
  resolveExecutiveDashboardPeriod,
} from "@/lib/executive-dashboard/service";

export async function calculateExecutiveDashboardForBusiness({
  businessId,
  locationId,
  periodStart,
  periodEnd,
  generatedAt = new Date(),
}: {
  businessId: string;
  locationId?: string;
  periodStart: Date;
  periodEnd: Date;
  generatedAt?: Date;
}): Promise<ExecutiveDashboardSummary> {
  const period = resolveExecutiveDashboardPeriod({
    preset: "custom",
    from: periodStart.toISOString(),
    to: periodEnd.toISOString(),
    now: generatedAt,
  });

  return getExecutiveDashboardSummary({
    businessId,
    locationId,
    period,
    generatedAt,
  });
}

export async function saveExecutiveDashboardSnapshot(): Promise<never> {
  throw new Error("Executive Dashboard is read-only in Phase 3D Preview.");
}
