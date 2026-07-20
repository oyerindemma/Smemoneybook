import { formatNaira } from "@/lib/bookkeeping/transaction-engine";
import { taxDisclaimer } from "@/lib/assistant/assistant-guardrails";
import { executeAssistantTool } from "@/lib/assistant/assistant-tools";
import { formatAssistantGrounding } from "@/lib/assistant/source-metrics";
import type { AssistantToolName, AssistantToolResult } from "@/lib/assistant/assistant-types";

export function chooseLocalTool(message: string) {
  const text = message.toLowerCase();

  if (/owe|owing|debt|who owes/.test(text)) {
    return "get_debt_summary" as const;
  }

  if (/low stock|stock low|stock|restock/.test(text)) {
    return "get_low_stock_items" as const;
  }

  if (/invoice|unpaid/.test(text)) {
    return "get_invoice_summary" as const;
  }

  if (/vat|tax/.test(text)) {
    return "get_monthly_report_summary" as const;
  }

  if (/month|summary|report/.test(text)) {
    return "get_monthly_report_summary" as const;
  }

  if (/afford|can i pay|can i buy/.test(text) && !/\d/.test(text)) {
    return "clarify_amount" as const;
  }

  if (/today|make|made|sales|profit/.test(text)) {
    return "get_today_summary" as const;
  }

  return "get_today_summary" as const;
}

export async function getLocalAssistantResponse({
  businessId,
  userId,
  message,
}: {
  businessId: string;
  userId: string;
  message: string;
}) {
  const tool = chooseLocalTool(message);

  if (tool === "clarify_amount") {
    return {
      reply: "What amount are you considering, and should I compare it against today or this month? I will only use your recorded MoneyBook data.",
      toolResults: [],
    };
  }

  const toolResult = await executeAssistantTool({ businessId, userId, toolName: tool });
  const reply = formatLocalToolReply(tool, toolResult, message);

  return {
    reply,
    toolResults: [toolResult],
  };
}

export async function getLocalAssistantReply(businessId: string, message: string, userId = "") {
  if (!userId) {
    return "I need a signed-in user before I can answer with business records.";
  }

  const response = await getLocalAssistantResponse({ businessId, userId, message });
  return response.reply;
}

function formatLocalToolReply(tool: AssistantToolName, result: AssistantToolResult, message: string) {
  if (!result.ok) {
    return result.message ?? "I could not access enough authorized business data to answer that.";
  }

  const grounding = formatAssistantGrounding(result.citations ?? []);

  if (tool === "get_debt_summary") {
    const data = result.data as {
      customerDebtTotal: number;
      supplierDebtTotal: number;
      topDebtors: Array<{ name: string; amount: number; overdue: boolean }>;
    };

    if (data.customerDebtTotal <= 0 && data.supplierDebtTotal <= 0) {
      return `Recorded open debt: no customer debt or supplier bills are currently showing.${grounding}`;
    }

    const people = data.topDebtors
      .map((debt) => `${debt.name}: ${formatNaira(debt.amount)}${debt.overdue ? " overdue" : ""}`)
      .join(", ");
    return `Recorded open customer debt is ${formatNaira(data.customerDebtTotal)}. Recorded open supplier bills are ${formatNaira(data.supplierDebtTotal)}.${people ? ` Top customer debts: ${people}.` : ""}${grounding}`;
  }

  if (tool === "get_low_stock_items") {
    const data = result.data as {
      lowStockCount: number;
      lowStockItems: Array<{ name: string; quantityOnHand: number }>;
    };

    if (data.lowStockCount === 0) {
      return `Recorded current stock looks okay. No item is at or below its low-stock alert level.${grounding}`;
    }

    const items = data.lowStockItems
      .map((item) => `${item.name}, ${item.quantityOnHand} left`)
      .join("; ");
    return `Recorded low-stock items: ${items}.${grounding}`;
  }

  if (tool === "get_invoice_summary") {
    const data = result.data as { unpaidCount: number; unpaidTotal: number };
    return `Recorded unpaid invoices: ${data.unpaidCount}, totaling ${formatNaira(data.unpaidTotal)}.${grounding}`;
  }

  if (tool === "get_monthly_report_summary") {
    const data = result.data as {
      monthIncome: number;
      monthExpenses: number;
      monthProfit: number;
      vatEstimate: number;
      transactionCount: number;
    };
    const vatNote = /vat|tax/i.test(message) ? ` ${taxDisclaimer()}` : "";
    return `Recorded this month: ${formatNaira(data.monthIncome)} in, ${formatNaira(data.monthExpenses)} out, ${formatNaira(data.monthProfit)} profit across ${data.transactionCount} activities. VAT estimate: ${formatNaira(data.vatEstimate)}.${vatNote}${grounding}`;
  }

  const data = result.data as {
    income: number;
    expenses: number;
    profit: number;
    transactionCount: number;
  };
  return `Recorded today: ${formatNaira(data.income)} in, ${formatNaira(data.expenses)} out, ${formatNaira(data.profit)} profit across ${data.transactionCount} activities.${grounding}`;
}
