import { formatNaira } from "@/lib/bookkeeping/transaction-engine";
import { taxDisclaimer } from "@/lib/assistant/assistant-guardrails";
import { getBusinessAssistantContext } from "@/lib/assistant/assistant-context";

export function chooseLocalTool(message: string) {
  const text = message.toLowerCase();

  if (/owe|owing|debt|who owes/.test(text)) {
    return "get_debt_summary" as const;
  }

  if (/low stock|stock low|stock/.test(text)) {
    return "get_low_stock_items" as const;
  }

  if (/vat|tax/.test(text)) {
    return "get_monthly_report_summary" as const;
  }

  if (/month|summary|report/.test(text)) {
    return "get_monthly_report_summary" as const;
  }

  if (/today|make|made|sales|profit/.test(text)) {
    return "get_today_summary" as const;
  }

  return "get_today_summary" as const;
}

export async function getLocalAssistantReply(businessId: string, message: string) {
  const context = await getBusinessAssistantContext(businessId);
  const tool = chooseLocalTool(message);

  if (tool === "get_debt_summary") {
    if (context.debts.customerDebtTotal <= 0) {
      return "No customer debt is currently showing. Nice and clear.";
    }

    const people = context.debts.topDebtors
      .map((debt) => `${debt.name}: ${formatNaira(debt.amount)}${debt.overdue ? " overdue" : ""}`)
      .join(", ");
    return `Customers currently owe ${formatNaira(context.debts.customerDebtTotal)}. ${people ? `Top names: ${people}.` : ""}`;
  }

  if (tool === "get_low_stock_items") {
    if (context.stock.lowStockCount === 0) {
      return "Stock looks okay. No item is at or below its low stock alert level.";
    }

    const items = context.stock.lowStockItems
      .map((item) => `${item.name}, ${item.quantityOnHand} left`)
      .join("; ");
    return `Low stock: ${items}.`;
  }

  if (tool === "get_monthly_report_summary") {
    const vatNote = /vat|tax/i.test(message) ? ` ${taxDisclaimer()}` : "";
    return `This month: ${formatNaira(context.report.monthIncome)} in, ${formatNaira(context.report.monthExpenses)} out, ${formatNaira(context.report.monthProfit)} profit. VAT estimate: ${formatNaira(context.report.vatEstimate)}.${vatNote}`;
  }

  return `Today: ${formatNaira(context.today.income)} in, ${formatNaira(context.today.expenses)} out, ${formatNaira(context.today.profit)} profit across ${context.today.transactionCount} activities.`;
}
