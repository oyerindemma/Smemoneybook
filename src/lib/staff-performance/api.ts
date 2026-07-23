import { Prisma } from "@prisma/client";
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { getPrisma } from "@/lib/prisma";
import {
  StaffPerformanceAccessError,
  type StaffPerformanceAccess,
} from "@/lib/staff-performance/authorization";
import {
  resolveStaffPerformancePeriod,
  type StaffPerformanceDatePreset,
  type StaffPerformancePeriod,
} from "@/lib/staff-performance/definitions";

export type StaffPerformanceRequestFilters = {
  businessId: string;
  locationId?: string;
  period: StaffPerformancePeriod;
};

export function parseStaffPerformanceRequest(url: string): StaffPerformanceRequestFilters {
  const searchParams = new URL(url).searchParams;
  const businessId = (searchParams.get("businessId") ?? "").trim();

  if (!businessId) {
    throw new StaffPerformanceAccessError("Choose a business.", 400, "business_required");
  }

  return {
    businessId,
    locationId: optionalParam(searchParams.get("locationId")),
    period: resolveStaffPerformancePeriod({
      preset: searchParams.get("range") as StaffPerformanceDatePreset | null,
      from: searchParams.get("from"),
      to: searchParams.get("to"),
    }),
  };
}

export function staffPerformanceErrorResponse(error: unknown, fallback: string) {
  if (error instanceof StaffPerformanceAccessError) {
    return jsonError(error.message, error.status);
  }

  if (error instanceof Response) {
    return jsonError("Sign in to continue.", error.status);
  }

  console.error(error);
  return jsonErrorFromUnknown(error, fallback);
}

export async function logStaffPerformanceReportEvent({
  access,
  action,
  period,
  locationId,
  targetStaffId,
}: {
  access: StaffPerformanceAccess;
  action: "staff_performance.report_viewed" | "staff_performance.report_exported";
  period: StaffPerformancePeriod;
  locationId?: string;
  targetStaffId?: string;
}) {
  await getPrisma().auditLog.create({
    data: {
      businessId: access.businessId,
      actorId: access.userId,
      action,
      message:
        action === "staff_performance.report_exported"
          ? "Staff performance report exported."
          : "Staff performance report viewed.",
      metadata: {
        feature: "phase3_staff_performance",
        filters: {
          range: period.preset,
          locationId: locationId ?? null,
          targetStaffId: targetStaffId ?? null,
          periodStart: period.periodStart.toISOString(),
          periodEnd: period.periodEnd.toISOString(),
        },
      } as Prisma.InputJsonObject,
    },
  });
}

function optionalParam(value: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
