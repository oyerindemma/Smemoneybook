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
  calculateBusinessHealthScoreForBusiness,
  saveBusinessHealthScoreSnapshot,
} from "@/lib/phase3/health-score-service";

export const runtime = "nodejs";

const snapshotRequestSchema = z.object({
  businessId: z.preprocess((val) => val ?? "", z.string().min(1, "Choose a business.")),
  locationId: z.preprocess((val) => val ?? "", z.string().trim()).optional(),
  recalculatedFromId: z.preprocess((val) => val ?? "", z.string().trim()).optional(),
});

export async function GET(request: Request) {
  try {
    const featureGate = requirePhase3Feature("healthScore", "Business health score");

    if (featureGate) {
      return featureGate;
    }

    const user = await requireUser();
    const limited = await enforceRateLimit(request, "health_score.read", 120, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get("businessId") ?? undefined;
    const locationId = searchParams.get("locationId") ?? undefined;
    const access = await requireBusinessAccess(user.id, "reports:write", businessId);
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
      "growth",
      "Upgrade to Growth to use Business Health Score.",
    );

    if (planGate) {
      return planGate;
    }

    const score = await calculateBusinessHealthScoreForBusiness({
      businessId: access.businessId,
      locationId: resolvedLocationId,
    });

    return Response.json({ score });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error("health_score.read_failed", error);
    return jsonErrorFromUnknown(error, "Could not calculate business health score.");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const featureGate = requirePhase3Feature("healthScore", "Business health score");

    if (featureGate) {
      return featureGate;
    }

    const user = await requireUser();
    const body = await parseJsonBody(request, snapshotRequestSchema);
    const limited = await enforceRateLimit(request, "health_score.write", 40, 60 * 60 * 1000);

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
      "growth",
      "Upgrade to Growth to save Business Health Score snapshots.",
    );

    if (planGate) {
      return planGate;
    }

    const score = await calculateBusinessHealthScoreForBusiness({
      businessId: access.businessId,
      locationId: resolvedLocationId,
    });
    const snapshot = await saveBusinessHealthScoreSnapshot({
      score,
      recalculatedFromId: body.recalculatedFromId || undefined,
    });

    await getPrisma().auditLog.create({
      data: {
        businessId: access.businessId,
        actorId: user.id,
        action: "health_score.snapshot_saved",
        message: "Business Health Score snapshot saved.",
        metadata: {
          feature: "phase3c_health_score",
          snapshotId: snapshot.id,
          formulaVersion: score.formulaVersion,
          score: score.score,
          rating: score.rating,
          confidence: score.confidence,
          locationId: resolvedLocationId,
        } as Prisma.InputJsonObject,
      },
    });

    return Response.json({ score, snapshotId: snapshot.id, message: "Business Health Score snapshot saved." });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error("health_score.write_failed", error);
    return jsonErrorFromUnknown(error, "Could not save business health score.");
  }
}
