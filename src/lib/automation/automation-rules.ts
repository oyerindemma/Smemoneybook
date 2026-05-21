import { formatNaira } from "@/lib/bookkeeping/transaction-engine";
import { getBusinessAssistantContext } from "@/lib/assistant/assistant-context";
import { getPrisma } from "@/lib/prisma";
import type { AutomationSuggestion } from "@/lib/automation/automation-types";
import { buildRetentionEngine } from "@/lib/retention/retention-engine";
import { getDashboardState } from "@/lib/bookkeeping/persistence";

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
  const member = await getPrisma().businessMember.findFirst({
    where: { businessId, role: "OWNER" },
    select: { userId: true, role: true },
  });
  const state = member?.userId
    ? await getDashboardState(businessId, member.role, member.userId)
    : null;
  const retention = state ? buildRetentionEngine(state, now) : null;

  if (preferences.dailyReminderEnabled && context.today.transactionCount === 0) {
    suggestions.push({
      idempotencyKey: `${businessId}:daily_money_reminder:${day}`,
      businessId,
      type: "daily_money_reminder",
      message: "You haven’t recorded today’s money yet.",
    });
  }

  if (preferences.dailyReminderEnabled && retention?.recoveryMessage) {
    suggestions.push({
      idempotencyKey: `${businessId}:inactive_recovery:${day}`,
      businessId,
      type: "inactive_recovery",
      message: retention.recoveryMessage,
      metadata: { segment: retention.segment },
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
      message: retention
        ? `Weekly report: Sales ${formatNaira(retention.weeklyReport.totalSales)}, expenses ${formatNaira(retention.weeklyReport.totalExpenses)}, profit ${formatNaira(retention.weeklyReport.totalProfit)}. ${retention.weeklyReport.recommendation}`
        : `Money in: ${formatNaira(context.report.monthIncome)}, Money out: ${formatNaira(context.report.monthExpenses)}, Profit: ${formatNaira(context.report.monthProfit)}.`,
    });
  }

  if (retention?.businessMoments[0]) {
    suggestions.push({
      idempotencyKey: `${businessId}:business_moment:${day}:${retention.businessMoments[0]}`,
      businessId,
      type: "business_moment",
      message: retention.businessMoments[0],
      metadata: { segment: retention.segment },
    });
  }

  if (retention?.smartInsights[0]) {
    suggestions.push({
      idempotencyKey: `${businessId}:smart_insight:${day}:${retention.smartInsights[0]}`,
      businessId,
      type: "smart_insight",
      message: retention.smartInsights[0],
      metadata: { healthScore: retention.businessHealth.score, segment: retention.segment },
    });
  }

  return suggestions;
}
