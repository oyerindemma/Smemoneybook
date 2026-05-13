import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { assertSameOriginRequest, jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { requireBusinessAccess } from "@/lib/operations/access";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

const preferenceSchema = z.object({
  businessId: z.string().min(1),
  dailyReminderEnabled: z.boolean().optional(),
  dailyReminderTime: z.string().optional().nullable(),
  debtReminderEnabled: z.boolean().optional(),
  lowStockAlertEnabled: z.boolean().optional(),
  weeklySummaryEnabled: z.boolean().optional(),
  whatsappAutomationEnabled: z.boolean().optional(),
  quietHoursStart: z.string().optional().nullable(),
  quietHoursEnd: z.string().optional().nullable(),
  timezone: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const businessId = new URL(request.url).searchParams.get("businessId") ?? "";
    const access = await requireBusinessAccess(user.id, "admin", businessId);
    const preferences = await getPrisma().automationPreference.upsert({
      where: { businessId: access.businessId },
      create: { businessId: access.businessId },
      update: {},
    });

    return Response.json({ preferences });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    return jsonErrorFromUnknown(error, "Could not load automation settings.");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const body = preferenceSchema.parse(await request.json().catch(() => ({})));
    const access = await requireBusinessAccess(user.id, "admin", body.businessId);
    const preferenceData = {
      dailyReminderEnabled: body.dailyReminderEnabled,
      dailyReminderTime: body.dailyReminderTime,
      debtReminderEnabled: body.debtReminderEnabled,
      lowStockAlertEnabled: body.lowStockAlertEnabled,
      weeklySummaryEnabled: body.weeklySummaryEnabled,
      whatsappAutomationEnabled: body.whatsappAutomationEnabled,
      quietHoursStart: body.quietHoursStart,
      quietHoursEnd: body.quietHoursEnd,
      timezone: body.timezone,
    };
    const preferences = await getPrisma().automationPreference.upsert({
      where: { businessId: access.businessId },
      create: { businessId: access.businessId, ...preferenceData },
      update: preferenceData,
    });

    return Response.json({ preferences, message: "Automation settings saved." });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    return jsonErrorFromUnknown(error, "Could not save automation settings.");
  }
}
