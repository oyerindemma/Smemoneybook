import { assertSameOriginRequest } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import {
  logPredictiveAlertsAudit,
  parsePredictiveAlertsRequest,
  predictiveAlertsErrorResponse,
  predictiveAlertsMethodNotAllowed,
} from "@/lib/predictive-alerts/api";
import { requirePredictiveAlertsAccess } from "@/lib/predictive-alerts/authorization";
import { evaluatePredictiveAlertsForBusiness } from "@/lib/predictive-alerts/service";

export const runtime = "nodejs";

export function GET() {
  return predictiveAlertsMethodNotAllowed("POST");
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "predictive_alerts.evaluate", 20, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const filters = parsePredictiveAlertsRequest(request.url);
    const access = await requirePredictiveAlertsAccess({
      userId: user.id,
      businessId: filters.businessId,
      locationId: filters.locationId,
      permission: "predictive_alerts:manage",
    });
    const result = await evaluatePredictiveAlertsForBusiness({
      businessId: access.businessId,
      locationId: access.locationId,
      periodDays: filters.periodDays,
    });

    await logPredictiveAlertsAudit({
      access,
      action: "predictive_alerts.evaluation_run",
      metadata: {
        generatedCount: result.generatedCount,
        resolvedCount: result.resolvedCount,
        periodDays: filters.periodDays ?? 30,
      },
    });

    return Response.json({ ...result, message: "Predictive Alerts evaluated." });
  } catch (error) {
    return predictiveAlertsErrorResponse(error, "Could not evaluate Predictive Alerts.");
  }
}

export function PUT() {
  return predictiveAlertsMethodNotAllowed("POST");
}

export function PATCH() {
  return predictiveAlertsMethodNotAllowed("POST");
}

export function DELETE() {
  return predictiveAlertsMethodNotAllowed("POST");
}
