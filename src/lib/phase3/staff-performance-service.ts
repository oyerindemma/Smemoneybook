import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import {
  calculateStaffPerformance,
  type StaffPerformanceSummary,
} from "@/lib/phase3/staff-performance";

export async function calculateStaffPerformanceForBusiness({
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
}): Promise<StaffPerformanceSummary> {
  const [members, auditLogs, goals] = await Promise.all([
    getPrisma().businessMember.findMany({
      where: { businessId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    getPrisma().auditLog.findMany({
      where: {
        businessId,
        createdAt: {
          gte: periodStart,
          lt: periodEnd,
        },
      },
      orderBy: { createdAt: "asc" },
      take: 2000,
    }),
    getPrisma().staffPerformanceGoal.findMany({
      where: {
        businessId,
        status: "ACTIVE",
        periodStart: { lte: periodEnd },
        periodEnd: { gte: periodStart },
        ...(locationId ? { OR: [{ locationId }, { locationId: null }] } : {}),
      },
    }),
  ]);
  const events = auditLogs
    .map((log) => {
      const metadata = asRecord(log.metadata);
      const eventLocationId = stringValue(metadata.locationId);

      return {
        actorId: log.actorId,
        action: log.action,
        createdAt: log.createdAt,
        locationId: eventLocationId,
        amount: amountFromMetadata(metadata),
      };
    })
    .filter((event) => !locationId || event.locationId === locationId);

  return calculateStaffPerformance({
    generatedAt,
    periodStart,
    periodEnd,
    members: members.map((member) => ({
      userId: member.user.id,
      name: member.user.name || member.user.email,
      role: member.role,
    })),
    events,
    goals: goals.map((goal) => ({
      id: goal.id,
      staffUserId: goal.staffUserId,
      label: goal.label,
      metric: goal.metric,
      targetValue: goal.targetValue.toNumber(),
      periodStart: goal.periodStart,
      periodEnd: goal.periodEnd,
    })),
  });
}

export async function createStaffPerformanceGoal({
  businessId,
  locationId,
  staffUserId,
  label,
  metric,
  targetValue,
  periodStart,
  periodEnd,
  actorId,
}: {
  businessId: string;
  locationId?: string;
  staffUserId?: string;
  label: string;
  metric: string;
  targetValue: number;
  periodStart: Date;
  periodEnd: Date;
  actorId?: string;
}) {
  return getPrisma().staffPerformanceGoal.create({
    data: {
      businessId,
      locationId,
      staffUserId,
      label,
      metric,
      targetValue,
      periodStart,
      periodEnd,
      createdById: actorId,
    },
  });
}

export async function saveStaffPerformanceSnapshot({
  businessId,
  locationId,
  staffUserId,
  summary,
}: {
  businessId: string;
  locationId?: string;
  staffUserId?: string;
  summary: StaffPerformanceSummary;
}) {
  return getPrisma().staffPerformanceSnapshot.create({
    data: {
      businessId,
      locationId,
      staffUserId,
      formulaVersion: summary.formulaVersion,
      periodStart: new Date(summary.periodStart),
      periodEnd: new Date(summary.periodEnd),
      generatedAt: new Date(summary.generatedAt),
      metrics: toJson(summary.rows),
      goals: toJson(summary.rows.flatMap((row) => row.goalProgress)),
      warnings: toJson(summary.warnings),
      sourceMetrics: toJson(summary.sourceMetrics),
    },
  });
}

function amountFromMetadata(metadata: Record<string, unknown>) {
  for (const key of ["amount", "paidAmount", "total", "refundAmount"]) {
    const value = metadata[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asRecord(value: Prisma.JsonValue | null) {
  return typeof value === "object" && value && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
