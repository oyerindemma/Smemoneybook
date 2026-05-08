import { formatNaira } from "@/lib/bookkeeping/transaction-engine";
import { getBusinessAssistantContext } from "@/lib/assistant/assistant-context";
import { getPrisma } from "@/lib/prisma";
import type { AutomationSuggestion } from "@/lib/automation/automation-types";

export async function buildAutomationSuggestions(businessId: string, now = new Date()) {
  const [context, preferences] = await Promise.all([
    getBusinessAssistantContext(businessId),
    getPrisma().automationPreference.upsert({
      where: { businessId },
      create: { businessId },
      update: {},
    }),
  ]);
  const suggestions: AutomationSuggestion[] = [];
  const day = now.toISOString().slice(0, 10);

  if (preferences.dailyReminderEnabled && context.today.transactionCount === 0) {
    suggestions.push({
      idempotencyKey: `${businessId}:daily_money_reminder:${day}`,
      businessId,
      type: "daily_money_reminder",
      message: "You haven’t recorded today’s money yet.",
    });
  }

  if (preferences.debtReminderEnabled) {
    for (const debtor of context.debts.topDebtors.filter((debt) => debt.overdue)) {
      suggestions.push({
        idempotencyKey: `${businessId}:debt_reminder_suggestion:${day}:${debtor.name}`,
        businessId,
        type: "debt_reminder_suggestion",
        message: `${debtor.name} still owes ${formatNaira(debtor.amount)}.`,
        metadata: { debtorName: debtor.name, amount: debtor.amount },
      });
    }
  }

  if (preferences.lowStockAlertEnabled) {
    for (const item of context.stock.lowStockItems) {
      suggestions.push({
        idempotencyKey: `${businessId}:low_stock_alert:${day}:${item.name}`,
        businessId,
        type: "low_stock_alert",
        message: `${item.name} is low. ${item.quantityOnHand} left.`,
        metadata: item,
      });
    }
  }

  if (preferences.weeklySummaryEnabled && now.getDay() === 1) {
    suggestions.push({
      idempotencyKey: `${businessId}:weekly_summary:${day}`,
      businessId,
      type: "weekly_summary",
      message: `Money in: ${formatNaira(context.report.monthIncome)}, Money out: ${formatNaira(context.report.monthExpenses)}, Profit: ${formatNaira(context.report.monthProfit)}.`,
    });
  }

  return suggestions;
}
