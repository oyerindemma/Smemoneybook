import { Prisma } from "@prisma/client";
import { formatNaira } from "@/lib/bookkeeping/transaction-engine";
import { getPrisma } from "@/lib/prisma";
import { debtReminderText, invoiceNotificationText, lowStockAlertText } from "@/lib/whatsapp/templates";
import { getBusinessAssistantContext } from "@/lib/assistant/assistant-context";
import { guardToolName } from "@/lib/assistant/assistant-guardrails";
import { getBusinessAccess } from "@/lib/operations/access";
import { maybeRecordAiEvaluationEvent } from "@/lib/phase3/ai-evaluation-service";
import {
  createAssistantCitation,
  type AssistantMetricConfidence,
  type AssistantMetricKind,
  type AssistantSourceCitation,
} from "@/lib/assistant/source-metrics";
import type { AssistantToolName, AssistantToolResult } from "@/lib/assistant/assistant-types";

export const assistantToolDefinitions = [
  tool("get_today_summary", "Get today's recorded money in, money out, profit, and activity count."),
  tool("get_debt_summary", "Get recorded customer debt and supplier bill summary."),
  tool("get_low_stock_items", "Get products currently at or below their low stock alert level."),
  tool("get_invoice_summary", "Get recorded unpaid invoice summary."),
  tool("get_monthly_report_summary", "Get this month's recorded money in, money out, profit, VAT estimate, and activity count."),
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

  const access = await getBusinessAccess(userId, businessId);

  if (!access || access.businessId !== businessId) {
    return {
      ok: false,
      tool: toolName,
      message: "You do not have access to this business.",
    };
  }

  const context = await getBusinessAssistantContext(access.businessId);
  const result = getReadOnlyToolResult(toolName, context);

  await getPrisma().auditLog.create({
    data: {
      businessId: access.businessId,
      actorId: userId,
      action: "assistant.tool",
      message: `Assistant used ${toolName}.`,
      metadata: {
        toolName,
        readOnly: true,
        metricVersion: "phase3b-advisor-v1",
        citations: result.citations ?? [],
      } as Prisma.InputJsonObject,
    },
  });
  await maybeRecordAiEvaluationEvent({
    businessId: access.businessId,
    actorId: userId,
    feature: "phase3b_ai_advisor",
    artifactType: "assistant_tool",
    artifactId: toolName,
    eventType: result.ok ? "tool_call" : "tool_failure",
    rating: result.ok ? undefined : "failed",
    toolName,
    modelVersion: "server_tool",
    promptVersion: "phase3b-advisor-v1",
    metadata: {
      readOnly: true,
      citationCount: result.citations?.length ?? 0,
      pendingActionRequired: Boolean(result.pendingActionRequired),
    },
  });

  return result;
}

function getReadOnlyToolResult(
  toolName: AssistantToolName,
  context: Awaited<ReturnType<typeof getBusinessAssistantContext>>,
): AssistantToolResult {
  if (toolName === "get_today_summary") {
    const citation = citationFor(context, {
      id: "today_summary",
      label: "Today summary",
      kind: "recorded",
      period: "today",
      sourceTables: ["Transaction"],
      confidence: context.today.transactionCount > 0 ? "high" : "insufficient_data",
      dataWarnings: context.today.transactionCount > 0 ? [] : ["No transactions are recorded for today."],
    });

    return {
      ok: true,
      tool: toolName,
      data: {
        ...context.today,
        kind: "recorded",
        periodLabel: context.periods.today.label,
        generatedAt: context.generatedAt,
      },
      citations: [citation],
    };
  }

  if (toolName === "get_debt_summary") {
    const hasDebt = context.debts.customerDebtTotal > 0 || context.debts.supplierDebtTotal > 0;
    const citation = citationFor(context, {
      id: "open_debt_summary",
      label: "Open debt summary",
      kind: "recorded",
      period: "today",
      sourceTables: ["Debt", "Customer", "Supplier"],
      confidence: hasDebt ? "high" : "insufficient_data",
      dataWarnings: hasDebt ? [] : ["No open debts are recorded."],
    });

    return {
      ok: true,
      tool: toolName,
      data: {
        ...context.debts,
        kind: "recorded",
        periodLabel: "currently open",
        generatedAt: context.generatedAt,
      },
      citations: [citation],
    };
  }

  if (toolName === "get_low_stock_items") {
    const citation = citationFor(context, {
      id: "low_stock_items",
      label: "Low stock items",
      kind: "recorded",
      period: "today",
      sourceTables: ["InventoryItem", "InventoryBalance"],
      confidence: "high",
      dataWarnings: [],
    });

    return {
      ok: true,
      tool: toolName,
      data: {
        ...context.stock,
        kind: "recorded",
        periodLabel: "current stock",
        generatedAt: context.generatedAt,
      },
      citations: [citation],
    };
  }

  if (toolName === "get_invoice_summary") {
    const citation = citationFor(context, {
      id: "invoice_summary",
      label: "Unpaid invoice summary",
      kind: "recorded",
      period: "today",
      sourceTables: ["Debt", "Transaction"],
      confidence: context.invoices.unpaidCount > 0 ? "high" : "insufficient_data",
      dataWarnings: context.invoices.unpaidCount > 0 ? [] : ["No unpaid invoices are recorded."],
    });

    return {
      ok: true,
      tool: toolName,
      data: {
        ...context.invoices,
        kind: "recorded",
        periodLabel: "currently unpaid",
        generatedAt: context.generatedAt,
      },
      citations: [citation],
    };
  }

  if (toolName === "get_monthly_report_summary") {
    const citation = citationFor(context, {
      id: "monthly_report_summary",
      label: "Monthly report summary",
      kind: "estimated",
      period: "month",
      sourceTables: ["Transaction", "TransactionPayment", "TaxRun"],
      confidence: context.report.transactionCount > 0 ? "high" : "insufficient_data",
      dataWarnings:
        context.report.transactionCount > 0
          ? ["VAT is an estimate from recorded data, not tax advice."]
          : ["No transactions are recorded for this month."],
    });

    return {
      ok: true,
      tool: toolName,
      data: {
        ...context.report,
        kind: "recorded_and_estimated",
        periodLabel: context.periods.month.label,
        generatedAt: context.generatedAt,
        vatEstimateKind: "estimated",
      },
      citations: [citation],
    };
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
        kind: "recommendation",
        generatedAt: context.generatedAt,
      },
      citations: [
        citationFor(context, {
          id: "debt_reminder_draft_source",
          label: "Debt reminder draft source",
          kind: "recommendation",
          period: "today",
          sourceTables: ["Debt", "Customer"],
          confidence: debtor ? "medium" : "insufficient_data",
          dataWarnings: debtor ? ["Draft only. Nothing was sent."] : ["No debtor was available for a draft."],
        }),
      ],
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
        kind: "recommendation",
        generatedAt: context.generatedAt,
      },
      citations: [
        citationFor(context, {
          id: "stock_alert_draft_source",
          label: "Stock alert draft source",
          kind: "recommendation",
          period: "today",
          sourceTables: ["InventoryItem", "InventoryBalance"],
          confidence: item ? "medium" : "insufficient_data",
          dataWarnings: item ? ["Draft only. Nothing was sent."] : ["No low-stock item was available."],
        }),
      ],
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
        kind: "recommendation",
        generatedAt: context.generatedAt,
      },
      citations: [
        citationFor(context, {
          id: "invoice_message_draft_source",
          label: "Invoice message draft source",
          kind: "recommendation",
          period: "today",
          sourceTables: ["Debt", "Transaction", "Customer"],
          confidence: debtor ? "medium" : "insufficient_data",
          dataWarnings: debtor ? ["Draft only. Nothing was sent."] : ["No unpaid invoice was available."],
        }),
      ],
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

function citationFor(
  context: Awaited<ReturnType<typeof getBusinessAssistantContext>>,
  input: {
    id: string;
    label: string;
    kind: AssistantMetricKind;
    period: "today" | "month";
    sourceTables: string[];
    confidence: AssistantMetricConfidence;
    dataWarnings: string[];
  },
): AssistantSourceCitation {
  const period = context.periods[input.period];

  return createAssistantCitation({
    id: input.id,
    label: input.label,
    kind: input.kind,
    periodStart: period.start,
    periodEnd: period.end,
    generatedAt: context.generatedAt,
    sourceTables: input.sourceTables,
    confidence: input.confidence,
    dataWarnings: input.dataWarnings,
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
