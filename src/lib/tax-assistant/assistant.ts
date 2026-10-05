import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import type { TaxAssistantAccess } from "@/lib/tax-assistant/authorization";
import { TaxAssistantDomainError } from "@/lib/tax-assistant/api";
import {
  composeGroundedTaxAnswer,
  selectTaxAssistantTools,
} from "@/lib/tax-assistant/context";
import {
  taxAssistantDisclaimer,
  taxAssistantPromptVersion,
  type TaxAssistantChatAnswer,
  type TaxAssistantToolName,
  type TaxReviewItemDto,
} from "@/lib/tax-assistant/definitions";
import { isTaxAssistantProviderConfigured } from "@/lib/tax-assistant/rules";
import { calculateTaxAssistantForBusiness } from "@/lib/tax-assistant/service";
import { runTaxAssistantTool } from "@/lib/tax-assistant/tools";

export type TaxAssistantQuestionInput = {
  access: TaxAssistantAccess;
  question: string;
  periodStart: Date;
  periodEnd: Date;
  locationId?: string;
  conversationId?: string;
};

export async function answerTaxAssistantQuestion({
  access,
  question,
  periodStart,
  periodEnd,
  locationId,
  conversationId,
}: TaxAssistantQuestionInput): Promise<TaxAssistantChatAnswer> {
  const normalizedQuestion = question.trim();

  if (!normalizedQuestion) {
    throw new TaxAssistantDomainError("Ask a tax question first.", 400, "question_required");
  }

  if (normalizedQuestion.length > 600) {
    throw new TaxAssistantDomainError("Keep Tax Assistant questions under 600 characters.", 400, "question_too_long");
  }

  const providerConfigured = isTaxAssistantProviderConfigured();
  const requestedTools = selectTaxAssistantTools(normalizedQuestion);
  const toolResults: Array<{ name: TaxAssistantToolName; ok: boolean; result?: unknown; error?: string }> = [];

  for (const toolName of requestedTools) {
    try {
      const result = await runTaxAssistantTool({
        access,
        toolName,
        periodStart,
        periodEnd,
        locationId,
      });
      toolResults.push({ name: toolName, ok: true, result });
    } catch (error) {
      toolResults.push({
        name: toolName,
        ok: false,
        error: error instanceof Error ? error.message : "Tool failed.",
      });
    }
  }

  const summary = await calculateTaxAssistantForBusiness({
    businessId: access.businessId,
    locationId,
    periodStart,
    periodEnd,
  });
  const reviewItems = extractReviewItems(toolResults, summary.reviewItems);
  const answer = composeGroundedTaxAnswer({
    question: normalizedQuestion,
    summary,
    reviewItems,
    providerConfigured,
  });
  const conversation = await upsertConversation({
    businessId: access.businessId,
    userId: access.userId,
    question: normalizedQuestion,
    conversationId,
  });
  const assistantMessage = await getPrisma().$transaction(async (tx) => {
    await tx.taxAssistantMessage.create({
      data: {
        conversationId: conversation.id,
        businessId: access.businessId,
        userId: access.userId,
        role: "user",
        content: normalizedQuestion,
        promptVersion: taxAssistantPromptVersion,
      },
    });

    const message = await tx.taxAssistantMessage.create({
      data: {
        conversationId: conversation.id,
        businessId: access.businessId,
        role: "assistant",
        content: answer,
        model: providerConfigured ? process.env.OPENAI_MODEL : "deterministic-tax-tools",
        promptVersion: taxAssistantPromptVersion,
        toolCalls: toJson(toolResults.map(({ name, ok, error }) => ({ name, ok, error: error ?? null }))),
        citations: toJson({
          ruleSetVersion: summary.source.ruleSetVersion,
          sourceAuthority: summary.source.sourceAuthority,
          sourceReference: summary.source.sourceReference,
        }),
        tokenUsage: toJson({
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          fallback: !providerConfigured,
        }),
        estimatedCost: new Prisma.Decimal(0),
      },
      select: { id: true },
    });

    await tx.taxAssistantConversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    return message;
  });

  return {
    conversationId: conversation.id,
    messageId: assistantMessage.id,
    answer,
    toolCalls: toolResults.map(({ name, ok }) => ({ name, ok })),
    source: summary.source,
    provider: providerConfigured ? "configured-grounded" : "setup_required",
    promptVersion: taxAssistantPromptVersion,
    disclaimer: taxAssistantDisclaimer,
  };
}

async function upsertConversation({
  businessId,
  userId,
  question,
  conversationId,
}: {
  businessId: string;
  userId: string;
  question: string;
  conversationId?: string;
}) {
  if (conversationId) {
    const existing = await getPrisma().taxAssistantConversation.findFirst({
      where: { id: conversationId, businessId, userId },
      select: { id: true },
    });

    if (!existing) {
      throw new TaxAssistantDomainError("Tax Assistant conversation was not found.", 404, "conversation_not_found");
    }

    return existing;
  }

  return getPrisma().taxAssistantConversation.create({
    data: {
      businessId,
      userId,
      title: titleFromQuestion(question),
    },
    select: { id: true },
  });
}

function extractReviewItems(
  toolResults: Array<{ name: TaxAssistantToolName; ok: boolean; result?: unknown }>,
  fallback: TaxReviewItemDto[],
) {
  const reviewResult = toolResults.find((result) => result.name === "get_tax_review_items" && result.ok)?.result;

  if (isReviewItemsPayload(reviewResult)) {
    return reviewResult.items;
  }

  return fallback;
}

function isReviewItemsPayload(value: unknown): value is { items: TaxReviewItemDto[] } {
  return Boolean(value && typeof value === "object" && Array.isArray((value as { items?: unknown }).items));
}

function titleFromQuestion(question: string) {
  const trimmed = question.replace(/\s+/g, " ").trim();
  return trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
