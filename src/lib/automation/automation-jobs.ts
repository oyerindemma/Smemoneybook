import { getPrisma } from "@/lib/prisma";
import { buildAutomationSuggestions } from "@/lib/automation/automation-rules";
import { logAutomationFailure, logAutomationSuggestion } from "@/lib/automation/automation-logger";

export async function runAutomationForBusiness(businessId: string) {
  try {
    const suggestions = await buildAutomationSuggestions(businessId);
    const results = await Promise.all(suggestions.map(logAutomationSuggestion));
    return {
      ok: true,
      businessId,
      suggested: results.filter((result) => result.created).length,
      skipped: results.filter((result) => !result.created).length,
    };
  } catch (error) {
    await logAutomationFailure(businessId, "automation_run", error);
    return {
      ok: false,
      businessId,
      error: error instanceof Error ? error.message : "Automation failed.",
    };
  }
}

export async function listAutomationBusinessIds() {
  const preferences = await getPrisma().automationPreference.findMany({
    where: {
      OR: [
        { dailyReminderEnabled: true },
        { debtReminderEnabled: true },
        { lowStockAlertEnabled: true },
        { weeklySummaryEnabled: true },
        { whatsappAutomationEnabled: true },
      ],
    },
    select: { businessId: true },
    orderBy: { createdAt: "asc" },
    take: 1000,
  });

  return preferences.map((preference) => preference.businessId);
}
