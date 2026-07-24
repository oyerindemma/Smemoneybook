import { z } from "zod";
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
import { updatePredictiveAlertLifecycle } from "@/lib/predictive-alerts/service";

export const runtime = "nodejs";

const dismissSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "predictive_alerts.dismiss", 40, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const filters = parsePredictiveAlertsRequest(request.url);
    const access = await requirePredictiveAlertsAccess({
      userId: user.id,
      businessId: filters.businessId,
      locationId: filters.locationId,
      permission: "predictive_alerts:acknowledge",
    });
    const body = dismissSchema.parse(await request.json().catch(() => ({})));
    const { id } = await params;
    const alert = await updatePredictiveAlertLifecycle({
      businessId: access.businessId,
      actorId: user.id,
      alertId: id,
      action: "dismiss",
      reason: body.reason,
    });

    await logPredictiveAlertsAudit({
      access,
      action: "predictive_alerts.dismissed",
      metadata: { alertId: id, ruleKey: alert.ruleKey, hasReason: Boolean(body.reason) },
    });

    return Response.json({ alert, message: "Predictive Alert dismissed." });
  } catch (error) {
    return predictiveAlertsErrorResponse(error, "Could not dismiss Predictive Alert.");
  }
}

export function GET() {
  return predictiveAlertsMethodNotAllowed("POST");
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
