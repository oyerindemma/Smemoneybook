import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { assertSameOriginRequest, jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { parseJsonBody } from "@/lib/api/validation";
import { requireMinimumPlan } from "@/lib/billing/subscriptions";
import { requireBusinessAccess, requireLocationAccess } from "@/lib/operations/access";
import { getPrisma } from "@/lib/prisma";
import { requirePhase3Feature } from "@/lib/phase3/feature-flags";
import {
  calculateStaffPerformanceForBusiness,
  createStaffPerformanceGoal,
  saveStaffPerformanceSnapshot,
} from "@/lib/phase3/staff-performance-service";

export const runtime = "nodejs";

const businessId = z.preprocess((val) => val ?? "", z.string().trim().min(1, "Choose a business."));
const optionalText = z.preprocess(
  (val) => (typeof val === "string" && val.trim() ? val.trim() : undefined),
  z.string().optional(),
).optional();

const staffPerformanceActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create_goal"),
    businessId,
    locationId: optionalText,
    staffUserId: optionalText,
    label: z.string().trim().min(2, "Enter a goal label."),
    metric: z.enum(["salesRecorded", "revenueHandled", "transactionsProcessed", "returnsProcessed", "debtActions"]),
    targetValue: z.coerce.number().nonnegative(),
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
  }),
  z.object({
    action: z.literal("save_snapshot"),
    businessId,
    locationId: optionalText,
    staffUserId: optionalText,
    periodStart: z.coerce.date().optional(),
    periodEnd: z.coerce.date().optional(),
  }),
]);

export async function GET(request: Request) {
  try {
    const featureGate = requirePhase3Feature("staffPerformance", "Staff performance");

    if (featureGate) {
      return featureGate;
    }

    const user = await requireUser();
    const limited = await enforceRateLimit(request, "staff_performance.read", 80, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const { searchParams } = new URL(request.url);
    const requestedBusinessId = searchParams.get("businessId") ?? undefined;
    const locationId = searchParams.get("locationId") ?? undefined;
    const { periodStart, periodEnd } = getRequestedPeriod(searchParams);
    const access = await requireBusinessAccess(user.id, "reports:write", requestedBusinessId);
    const resolvedLocationId = locationId
      ? (await requireLocationAccess({
          userId: user.id,
          businessId: access.businessId,
          locationId,
          permission: "reports:write",
        })).locationId
      : undefined;
    const planGate = await requireMinimumPlan(
      user.id,
      access.businessId,
      "pro",
      "Upgrade to Pro to use Staff Performance.",
    );

    if (planGate) {
      return planGate;
    }

    const summary = await calculateStaffPerformanceForBusiness({
      businessId: access.businessId,
      locationId: resolvedLocationId,
      periodStart,
      periodEnd,
    });

    return Response.json({ summary });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error("staff_performance.read_failed", error);
    return jsonErrorFromUnknown(error, "Could not load staff performance.");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const featureGate = requirePhase3Feature("staffPerformance", "Staff performance");

    if (featureGate) {
      return featureGate;
    }

    const user = await requireUser();
    const body = await parseJsonBody(request, staffPerformanceActionSchema);
    const limited = await enforceRateLimit(request, "staff_performance.write", 30, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const access = await requireBusinessAccess(user.id, "admin", body.businessId);
    const planGate = await requireMinimumPlan(
      user.id,
      access.businessId,
      "pro",
      "Upgrade to Pro to use Staff Performance.",
    );

    if (planGate) {
      return planGate;
    }

    if (body.locationId) {
      await requireLocationAccess({
        userId: user.id,
        businessId: access.businessId,
        locationId: body.locationId,
        permission: "admin",
      });
    }

    const result = await runAction({
      businessId: access.businessId,
      actorId: user.id,
      body,
    });

    await getPrisma().auditLog.create({
      data: {
        businessId: access.businessId,
        actorId: user.id,
        action: `staff_performance.${body.action}`,
        message: "Staff performance action recorded.",
        metadata: {
          feature: "phase3k_staff_performance",
          action: body.action,
          resultId: result.id,
        } as Prisma.InputJsonObject,
      },
    });

    return Response.json({ result, message: "Staff performance action recorded." });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error("staff_performance.write_failed", error);
    return jsonErrorFromUnknown(error, "Could not record staff performance action.");
  }
}

async function runAction({
  businessId,
  actorId,
  body,
}: {
  businessId: string;
  actorId: string;
  body: z.infer<typeof staffPerformanceActionSchema>;
}) {
  if (body.action === "create_goal") {
    return createStaffPerformanceGoal({
      businessId,
      actorId,
      locationId: body.locationId || undefined,
      staffUserId: body.staffUserId || undefined,
      label: body.label,
      metric: body.metric,
      targetValue: body.targetValue,
      periodStart: body.periodStart,
      periodEnd: body.periodEnd,
    });
  }

  const period = {
    periodStart: body.periodStart ?? getDefaultPeriod().periodStart,
    periodEnd: body.periodEnd ?? getDefaultPeriod().periodEnd,
  };
  const summary = await calculateStaffPerformanceForBusiness({
    businessId,
    locationId: body.locationId || undefined,
    ...period,
  });

  return saveStaffPerformanceSnapshot({
    businessId,
    locationId: body.locationId || undefined,
    staffUserId: body.staffUserId || undefined,
    summary,
  });
}

function getRequestedPeriod(searchParams: URLSearchParams) {
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (from && to) {
    const periodStart = new Date(from);
    const periodEnd = new Date(to);

    if (!Number.isNaN(periodStart.getTime()) && !Number.isNaN(periodEnd.getTime()) && periodEnd > periodStart) {
      return { periodStart, periodEnd };
    }
  }

  return getDefaultPeriod();
}

function getDefaultPeriod() {
  const now = new Date();

  return {
    periodStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    periodEnd: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  };
}
