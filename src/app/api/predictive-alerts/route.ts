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
  listPredictiveAlerts,
  recordPredictiveAlertFeedback,
  scanPredictiveAlertsForBusiness,
} from "@/lib/phase3/predictive-alerts-service";
import { maybeRecordAiEvaluationEvent } from "@/lib/phase3/ai-evaluation-service";
import type { PredictiveAlertStatus } from "@/lib/phase3/predictive-alerts";

export const runtime = "nodejs";

const businessId = z.preprocess((val) => val ?? "", z.string().trim().min(1, "Choose a business."));
const optionalText = z.preprocess(
  (val) => (typeof val === "string" && val.trim() ? val.trim() : undefined),
  z.string().optional(),
).optional();

const predictiveAlertActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("scan"),
    businessId,
    locationId: optionalText,
    periodDays: z.preprocess((val) => val ?? undefined, z.coerce.number().int().min(7).max(30)).optional(),
  }),
  z.object({
    action: z.enum(["dismissed", "confirmed", "incorrect", "resolved"]),
    businessId,
    alertId: z.string().trim().min(1, "Choose an alert."),
    note: z.preprocess((val) => val ?? "", z.string().trim().max(500)).optional(),
  }),
]);

export async function GET(request: Request) {
  try {
    const featureGate = requirePhase3Feature("predictiveAlerts", "Predictive alerts");

    if (featureGate) {
      return featureGate;
    }

    const user = await requireUser();
    const limited = await enforceRateLimit(request, "predictive_alerts.read", 120, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const { searchParams } = new URL(request.url);
    const requestedBusinessId = searchParams.get("businessId") ?? undefined;
    const locationId = searchParams.get("locationId") ?? undefined;
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
      "growth",
      "Upgrade to Growth to use Predictive Alerts.",
    );

    if (planGate) {
      return planGate;
    }

    const alerts = await listPredictiveAlerts({
      businessId: access.businessId,
      locationId: resolvedLocationId,
      statuses: readStatuses(searchParams.get("status")),
    });

    return Response.json({ alerts });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error("predictive_alerts.read_failed", error);
    return jsonErrorFromUnknown(error, "Could not load predictive alerts.");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const featureGate = requirePhase3Feature("predictiveAlerts", "Predictive alerts");

    if (featureGate) {
      return featureGate;
    }

    const user = await requireUser();
    const body = await parseJsonBody(request, predictiveAlertActionSchema);
    const limited = await enforceRateLimit(request, "predictive_alerts.write", 40, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const access = await requireBusinessAccess(user.id, "reports:write", body.businessId);
    const planGate = await requireMinimumPlan(
      user.id,
      access.businessId,
      "growth",
      "Upgrade to Growth to use Predictive Alerts.",
    );

    if (planGate) {
      return planGate;
    }

    if (body.action === "scan") {
      const resolvedLocationId = body.locationId
        ? (await requireLocationAccess({
            userId: user.id,
            businessId: access.businessId,
            locationId: body.locationId,
            permission: "reports:write",
          })).locationId
        : undefined;
      const alerts = await scanPredictiveAlertsForBusiness({
        businessId: access.businessId,
        locationId: resolvedLocationId,
        periodDays: body.periodDays,
      });

      await getPrisma().auditLog.create({
        data: {
          businessId: access.businessId,
          actorId: user.id,
          action: "predictive_alerts.scanned",
          message: "Predictive alerts were recalculated.",
          metadata: {
            feature: "phase3o_predictive_alerts",
            alertCount: alerts.length,
            locationId: resolvedLocationId,
            periodDays: body.periodDays ?? 14,
          } as Prisma.InputJsonObject,
        },
      });

      return Response.json({ alerts, message: "Predictive alerts refreshed." });
    }

    const alert = await recordPredictiveAlertFeedback({
      businessId: access.businessId,
      actorId: user.id,
      alertId: body.alertId,
      response: body.action,
      note: body.note || undefined,
    });

    await getPrisma().auditLog.create({
      data: {
        businessId: access.businessId,
        actorId: user.id,
        action: `predictive_alerts.${body.action}`,
        message: `Predictive alert marked ${body.action}.`,
        metadata: {
          feature: "phase3o_predictive_alerts",
          alertId: body.alertId,
          response: body.action,
          alertType: alert.type,
        } as Prisma.InputJsonObject,
      },
    });
    await maybeRecordAiEvaluationEvent({
      businessId: access.businessId,
      actorId: user.id,
      feature: "phase3o_predictive_alerts",
      artifactType: "predictive_alert",
      artifactId: alert.id,
      eventType: "feedback",
      rating: body.action,
      accepted: body.action === "confirmed" || body.action === "resolved"
        ? true
        : body.action === "incorrect"
          ? false
          : undefined,
      correct: body.action === "incorrect" ? false : body.action === "confirmed" ? true : undefined,
      correction: body.note || undefined,
      modelVersion: "predictive-alerts-v1",
      promptVersion: "predictive-alerts-v1",
      metadata: {
        alertType: alert.type,
        severity: alert.severity,
        confidence: alert.confidence,
      },
    });

    return Response.json({ alert, message: "Alert feedback recorded." });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error("predictive_alerts.write_failed", error);
    return jsonErrorFromUnknown(error, "Could not update predictive alerts.");
  }
}

function readStatuses(value: string | null): PredictiveAlertStatus[] | undefined {
  if (!value) {
    return ["active", "confirmed"];
  }

  const statuses = value.split(",").map((item) => item.trim()).filter(Boolean);
  const allowed = new Set<PredictiveAlertStatus>(["active", "dismissed", "confirmed", "incorrect", "resolved"]);
  const filtered = statuses.filter((status): status is PredictiveAlertStatus =>
    allowed.has(status as PredictiveAlertStatus),
  );

  return filtered.length ? filtered : undefined;
}
