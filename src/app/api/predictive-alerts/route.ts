import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import {
  parsePredictiveAlertsRequest,
  predictiveAlertsErrorResponse,
  predictiveAlertsMethodNotAllowed,
} from "@/lib/predictive-alerts/api";
import { requirePredictiveAlertsAccess } from "@/lib/predictive-alerts/authorization";
import { listPredictiveAlerts } from "@/lib/predictive-alerts/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "predictive_alerts.read", 120, 15 * 60 * 1000);

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
    const alerts = await listPredictiveAlerts({
      businessId: access.businessId,
      locationId: access.locationId,
      statuses: filters.statuses,
      severity: filters.severity,
      category: filters.category,
      periodDays: filters.periodDays,
    });

    return Response.json({
      alerts,
      capabilities: {
        canManage: access.canManage,
        canAcknowledge: access.canAcknowledge,
        canExport: access.canExport,
        delivery: {
          inApp: true,
          email: false,
          whatsapp: false,
        },
      },
    });
  } catch (error) {
    return predictiveAlertsErrorResponse(error, "Could not load Predictive Alerts.");
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
