import { getDashboardState } from "@/lib/bookkeeping/persistence";
import { findLowStockRules, findOverdueReminderRules, shouldSendDailySummary } from "@/lib/automation/rules";

export async function collectAutomationTriggers(businessId: string) {
  const state = await getDashboardState(businessId);
  const preferences = await import("@/lib/prisma").then(({ getPrisma }) =>
    getPrisma().messagePreference.findUnique({ where: { businessId } }),
  );

  const rules = [
    ...findOverdueReminderRules(state.debts),
    ...findLowStockRules(state.items),
  ];

  if (shouldSendDailySummary(new Date(), preferences?.timezone ?? "Africa/Lagos")) {
    rules.push({
      type: "daily_sales_summary",
      businessId,
      date: new Date().toISOString().slice(0, 10),
    });
  }

  return rules;
}
