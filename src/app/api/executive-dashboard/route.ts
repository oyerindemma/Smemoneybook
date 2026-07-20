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
  calculateExecutiveDashboardForBusiness,
  saveExecutiveDashboardSnapshot,
} from "@/lib/phase3/executive-dashboard-service";

export const runtime = "nodejs";

const snapshotSchema = z.object({
  businessId: z.preprocess((val) => val ?? "", z.string().trim().min(1, "Choose a business.")),
  locationId: z.preprocess(
    (val) => (typeof val === "string" && val.trim() ? val.trim() : undefined),
    z.string().optional(),
  ).optional(),
  periodStart: z.coerce.date().optional(),
  periodEnd: z.coerce.date().optional(),
});

export async function GET(request: Request) {
  try {
    const featureGate = requirePhase3Feature("executiveDashboard", "Executive dashboard");

    if (featureGate) {
      return featureGate;
    }

    const user = await requireUser();
    const limited = await enforceRateLimit(request, "executive_dashboard.read", 80, 15 * 60 * 1000);

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
      "Upgrade to Pro to use Executive Dashboard.",
    );

    if (planGate) {
      return planGate;
    }

    const dashboard = await calculateExecutiveDashboardForBusiness({
      businessId: access.businessId,
      locationId: resolvedLocationId,
      periodStart,
      periodEnd,
    });

    return Response.json({ dashboard });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error("executive_dashboard.read_failed", error);
    return jsonErrorFromUnknown(error, "Could not load executive dashboard.");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const featureGate = requirePhase3Feature("executiveDashboard", "Executive dashboard");

    if (featureGate) {
      return featureGate;
    }

    const user = await requireUser();
    const body = await parseJsonBody(request, snapshotSchema);
    const limited = await enforceRateLimit(request, "executive_dashboard.write", 30, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const access = await requireBusinessAccess(user.id, "reports:write", body.businessId);
    const resolvedLocationId = body.locationId
      ? (await requireLocationAccess({
          userId: user.id,
          businessId: access.businessId,
          locationId: body.locationId,
          permission: "reports:write",
        })).locationId
      : undefined;
    const planGate = await requireMinimumPlan(
      user.id,
      access.businessId,
      "pro",
      "Upgrade to Pro to save Executive Dashboard snapshots.",
    );

    if (planGate) {
      return planGate;
    }

    const period = {
      periodStart: body.periodStart ?? getDefaultPeriod().periodStart,
      periodEnd: body.periodEnd ?? getDefaultPeriod().periodEnd,
    };
    const dashboard = await calculateExecutiveDashboardForBusiness({
      businessId: access.businessId,
      locationId: resolvedLocationId,
      ...period,
    });
    const snapshot = await saveExecutiveDashboardSnapshot({
      businessId: access.businessId,
      locationId: resolvedLocationId,
      dashboard,
    });

    await getPrisma().auditLog.create({
      data: {
        businessId: access.businessId,
        actorId: user.id,
        action: "executive_dashboard.snapshot_saved",
        message: "Executive dashboard snapshot saved.",
        metadata: {
          feature: "phase3n_executive_dashboard",
          snapshotId: snapshot.id,
          formulaVersion: dashboard.formulaVersion,
          periodStart: dashboard.periodStart,
          periodEnd: dashboard.periodEnd,
        } as Prisma.InputJsonObject,
      },
    });

    return Response.json({ dashboard, snapshotId: snapshot.id, message: "Executive dashboard snapshot saved." });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error("executive_dashboard.write_failed", error);
    return jsonErrorFromUnknown(error, "Could not save executive dashboard snapshot.");
  }
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
