import { Prisma } from "@prisma/client";
import { formatNaira } from "@/lib/bookkeeping/transaction-engine";
import { getPrisma } from "@/lib/prisma";
import { debtReminderText, invoiceNotificationText, lowStockAlertText } from "@/lib/whatsapp/templates";
import { getBusinessAssistantContext } from "@/lib/assistant/assistant-context";
import { guardToolName } from "@/lib/assistant/assistant-guardrails";
import type { AssistantToolName, AssistantToolResult } from "@/lib/assistant/assistant-types";

export const assistantToolDefinitions = [
  tool("get_today_summary", "Get today's money in, money out, profit, and activity count."),
  tool("get_debt_summary", "Get customers owing and supplier bills summary."),
  tool("get_low_stock_items", "Get products currently at or below their low stock alert level."),
  tool("get_invoice_summary", "Get unpaid invoice summary."),
  tool("get_monthly_report_summary", "Get this month's money in, money out, profit, VAT estimate, and activity count."),
  tool("draft_whatsapp_debt_reminder", "Draft a WhatsApp debt reminder. Does not send."),
  tool("prepare_stock_alert", "Draft a low stock alert. Does not send."),
  tool("prepare_invoice_message", "Draft an invoice notification. Does not send."),
  tool("send_whatsapp_message", "Disabled mutation. Requires user confirmation."),
  tool("create_invoice", "Disabled mutation. Requires user confirmation."),
  tool("record_payment", "Disabled mutation. Requires user confirmation."),
  tool("adjust_stock", "Disabled mutation. Requires user confirmation."),
];

export async function executeAssistantTool({
  toolName,
  businessId,
  userId,
}: {
  toolName: AssistantToolName;
  businessId: string;
  userId: string;
  args?: unknown;
}): Promise<AssistantToolResult> {
  const guard = guardToolName(toolName);
  if (!guard.allowed) {
    return {
      ok: false,
      tool: toolName,
      pendingActionRequired: guard.pendingActionRequired,
      message: guard.message,
    };
  }

  const context = await getBusinessAssistantContext(businessId);
  const result = getReadOnlyToolResult(toolName, context);

  await getPrisma().auditLog.create({
    data: {
      businessId,
      actorId: userId,
      action: "assistant.tool",
      message: `Assistant used ${toolName}.`,
      metadata: { toolName, readOnly: true } as Prisma.InputJsonObject,
    },
  });

  return result;
}

function getReadOnlyToolResult(toolName: AssistantToolName, context: Awaited<ReturnType<typeof getBusinessAssistantContext>>): AssistantToolResult {
  if (toolName === "get_today_summary") {
    return { ok: true, tool: toolName, data: context.today };
  }

  if (toolName === "get_debt_summary") {
    return { ok: true, tool: toolName, data: context.debts };
  }

  if (toolName === "get_low_stock_items") {
    return { ok: true, tool: toolName, data: context.stock };
  }

  if (toolName === "get_invoice_summary") {
    return { ok: true, tool: toolName, data: context.invoices };
  }

  if (toolName === "get_monthly_report_summary") {
    return { ok: true, tool: toolName, data: context.report };
  }

  if (toolName === "draft_whatsapp_debt_reminder") {
    const debtor = context.debts.topDebtors[0];
    return {
      ok: true,
      tool: toolName,
      data: {
        draft: debtor
          ? debtReminderText({
              customerName: debtor.name,
              businessName: context.businessName,
              amount: debtor.amount,
            })
          : "No customer debt found to draft a reminder.",
      },
    };
  }

  if (toolName === "prepare_stock_alert") {
    const item = context.stock.lowStockItems[0];
    return {
      ok: true,
      tool: toolName,
      data: {
        draft: item
          ? lowStockAlertText({
              businessName: context.businessName,
              productName: item.name,
              quantityOnHand: item.quantityOnHand,
              lowStockLevel: item.lowStockLevel,
            })
          : "No low stock item found.",
      },
    };
  }

  if (toolName === "prepare_invoice_message") {
    const debtor = context.debts.topDebtors[0];
    return {
      ok: true,
      tool: toolName,
      data: {
        draft: debtor
          ? invoiceNotificationText({
              customerName: debtor.name,
              businessName: context.businessName,
              amount: debtor.amount,
              invoiceNumber: "next invoice",
            })
          : "No unpaid invoice found.",
      },
    };
  }

  return { ok: false, tool: toolName, message: "Unsupported assistant tool." };
}

export function createPendingAssistantAction({
  businessId,
  userId,
  type,
  payload,
}: {
  businessId: string;
  userId: string;
  type: string;
  payload: Prisma.InputJsonValue;
}) {
  return getPrisma().pendingAssistantAction.create({
    data: { businessId, userId, type, payload },
  });
}

function tool(name: AssistantToolName, description: string) {
  return {
    type: "function",
    name,
    description,
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    strict: true,
  };
}

export function formatAssistantCurrency(amount: number) {
  return formatNaira(amount);
}
