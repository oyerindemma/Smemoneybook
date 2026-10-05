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
import {
  listBusinessAlertPreferences,
  updateBusinessAlertPreferences,
} from "@/lib/predictive-alerts/service";

export const runtime = "nodejs";

const severitySchema = z.enum(["critical", "high", "medium", "low", "information"]);
const thresholdValueSchema = z.union([z.number(), z.string(), z.boolean(), z.null()]);
const preferenceSchema = z.object({
  ruleKey: z.string().trim().min(1),
  enabled: z.boolean().optional(),
  severityOverride: severitySchema.nullish(),
  thresholdOverride: z.record(z.string(), thresholdValueSchema).nullish(),
  inAppEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  whatsappEnabled: z.boolean().optional(),
});
const preferenceRequestSchema = z.object({
  preferences: z.array(preferenceSchema).min(1),
});

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "predictive_alerts.preferences.read", 80, 15 * 60 * 1000);

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
    const preferences = await listBusinessAlertPreferences({ businessId: access.businessId });

    return Response.json({
      preferences,
      delivery: {
        inApp: true,
        email: false,
        whatsapp: false,
      },
    });
  } catch (error) {
    return predictiveAlertsErrorResponse(error, "Could not load Predictive Alert preferences.");
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "predictive_alerts.preferences.write", 20, 60 * 60 * 1000);

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
    const payload = preferenceRequestSchema.parse(await request.json().catch(() => ({})));
    const sanitizedPreferences = payload.preferences.map((preference) => ({
      ...preference,
      emailEnabled: false,
      whatsappEnabled: false,
    }));
    const preferences = await updateBusinessAlertPreferences({
      businessId: access.businessId,
      preferences: sanitizedPreferences,
    });

    await logPredictiveAlertsAudit({
      access,
      action: "predictive_alerts.preference_changed",
      metadata: { preferenceCount: payload.preferences.length },
    });

    return Response.json({
      preferences,
      message: "Predictive Alert preferences updated.",
    });
  } catch (error) {
    return predictiveAlertsErrorResponse(error, "Could not update Predictive Alert preferences.");
  }
}

export function POST() {
  return predictiveAlertsMethodNotAllowed("GET, PUT");
}

export function PATCH() {
  return predictiveAlertsMethodNotAllowed("GET, PUT");
}

export function DELETE() {
  return predictiveAlertsMethodNotAllowed("GET, PUT");
}
