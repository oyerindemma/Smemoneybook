import { formatNaira } from "@/lib/bookkeeping/transaction-engine";
import { getBusinessAssistantContext } from "@/lib/assistant/assistant-context";
import { detectWhatsAppIntent } from "@/lib/chatbot/whatsapp-intents";

export async function routeWhatsAppBotMessage({
  businessId,
  message,
}: {
  businessId: string;
  message: string;
}) {
  const intent = detectWhatsAppIntent(message);
  const context = await getBusinessAssistantContext(businessId);

  if (intent === "today") {
    return `Today: ${formatNaira(context.today.income)} in, ${formatNaira(context.today.expenses)} out, ${formatNaira(context.today.profit)} profit.`;
  }

  if (intent === "debt_summary") {
    return `Customers currently owe ${formatNaira(context.debts.customerDebtTotal)}.`;
  }

  if (intent === "low_stock") {
    if (context.stock.lowStockCount === 0) {
      return "No low stock item right now.";
    }

    return `Low stock: ${context.stock.lowStockItems
      .map((item) => `${item.name}, ${item.quantityOnHand} left`)
      .join("; ")}.`;
  }

  if (intent === "summary") {
    return `This month: ${formatNaira(context.report.monthIncome)} in, ${formatNaira(context.report.monthExpenses)} out, ${formatNaira(context.report.monthProfit)} profit.`;
  }

  if (intent === "help") {
    return "Try: today, sales today, who owes me, low stock, summary. I cannot record or change money from WhatsApp yet.";
  }

  return "I can help with: today, who owes me, low stock, summary, and help.";
}
