import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import {
  logPredictiveAlertsAudit,
  parsePredictiveAlertsRequest,
  predictiveAlertsErrorResponse,
  predictiveAlertsMethodNotAllowed,
} from "@/lib/predictive-alerts/api";
import { requirePredictiveAlertsAccess } from "@/lib/predictive-alerts/authorization";
import {
  predictiveAlertsCsvFilename,
  predictiveAlertsToCsv,
} from "@/lib/predictive-alerts/export";
import { listPredictiveAlerts } from "@/lib/predictive-alerts/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "predictive_alerts.export", 30, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const filters = parsePredictiveAlertsRequest(request.url);
    const access = await requirePredictiveAlertsAccess({
      userId: user.id,
      businessId: filters.businessId,
      locationId: filters.locationId,
      permission: "predictive_alerts:export",
    });
    const alerts = await listPredictiveAlerts({
      businessId: access.businessId,
      locationId: access.locationId,
      statuses: filters.statuses,
      severity: filters.severity,
      category: filters.category,
      periodDays: filters.periodDays,
      take: 500,
    });
    const csv = predictiveAlertsToCsv({
      alerts,
      generatedBy: user.email,
    });

    await logPredictiveAlertsAudit({
      access,
      action: "predictive_alerts.export_generated",
      metadata: { alertCount: alerts.length },
    });

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${predictiveAlertsCsvFilename()}"`,
      },
    });
  } catch (error) {
    return predictiveAlertsErrorResponse(error, "Could not export Predictive Alerts.");
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
