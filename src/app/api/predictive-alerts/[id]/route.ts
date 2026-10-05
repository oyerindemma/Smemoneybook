import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import {
  parsePredictiveAlertsRequest,
  predictiveAlertsErrorResponse,
  predictiveAlertsMethodNotAllowed,
} from "@/lib/predictive-alerts/api";
import { requirePredictiveAlertsAccess } from "@/lib/predictive-alerts/authorization";
import { getPredictiveAlert } from "@/lib/predictive-alerts/service";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "predictive_alerts.detail", 120, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const filters = parsePredictiveAlertsRequest(request.url);
    const access = await requirePredictiveAlertsAccess({
      userId: user.id,
      businessId: filters.businessId,
      locationId: filters.locationId,
      permission: "predictive_alerts:read",
    });
    const { id } = await params;
    const alert = await getPredictiveAlert({
      businessId: access.businessId,
      alertId: id,
    });

    if (!alert) {
      return Response.json({ error: "Predictive Alert was not found." }, { status: 404 });
    }

    return Response.json({ alert });
  } catch (error) {
    return predictiveAlertsErrorResponse(error, "Could not load Predictive Alert.");
  }
}

export function POST() {
  return predictiveAlertsMethodNotAllowed();
}

export function PUT() {
  return predictiveAlertsMethodNotAllowed();
}

export function PATCH() {
  return predictiveAlertsMethodNotAllowed();
}

export function DELETE() {
  return predictiveAlertsMethodNotAllowed();
}
