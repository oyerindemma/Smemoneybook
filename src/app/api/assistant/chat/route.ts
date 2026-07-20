import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { assertSameOriginRequest, jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { parseJsonBody } from "@/lib/api/validation";
import { getBusinessAccess } from "@/lib/operations/access";
import { getPrisma } from "@/lib/prisma";
import { createAssistantReply } from "@/lib/assistant/assistant-client";
import { guardUserMessage, requiresConfirmation, sanitizeAssistantText } from "@/lib/assistant/assistant-guardrails";
import { phase3OperationalControls, requirePhase3Feature } from "@/lib/phase3/feature-flags";
import { maybeRecordAiEvaluationEvent } from "@/lib/phase3/ai-evaluation-service";
import { requireMinimumPlan } from "@/lib/billing/subscriptions";

export const runtime = "nodejs";

const chatRequestSchema = z.object({
  businessId: z.preprocess((val) => val ?? "", z.string().min(1, "Choose a business.")),
  message: z.preprocess(
    (val) => val ?? "",
    z.string().trim().min(1, "Enter a message.").max(1000, "Keep your message under 1000 characters."),
  ),
  threadId: z.preprocess((val) => val ?? "", z.string()).optional(),
});

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const body = await parseJsonBody(request, chatRequestSchema);
    const limited = await enforceRateLimit(request, "assistant.chat.write", 60, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const featureGate = requirePhase3Feature("aiAdvisor", "AI business advisor");

    if (featureGate) {
      return featureGate;
    }

    const access = await getBusinessAccess(user.id, body.businessId);

    if (!access) {
      return jsonError("Choose a business you can access.", 403);
    }

    const planGate = await requireMinimumPlan(
      user.id,
      access.businessId,
      "growth",
      "Upgrade to Growth to use the AI Business Advisor.",
    );

    if (planGate) {
      return planGate;
    }

    const usageGate = await enforceAdvisorUsageLimit(access.businessId);

    if (usageGate) {
      return usageGate;
    }

    const guard = guardUserMessage(body.message);
    if (!guard.allowed) {
      return Response.json({ reply: guard.message });
    }

    const thread = await getOrCreateThread({
      threadId: body.threadId,
      businessId: access.businessId,
      userId: user.id,
      title: body.message.slice(0, 60),
    });

    await getPrisma().assistantMessage.create({
      data: {
        threadId: thread.id,
        userId: user.id,
        role: "user",
        content: sanitizeAssistantText(body.message),
      },
    });

    const startedAt = Date.now();
    const result = await createAssistantReply({
      businessId: access.businessId,
      userId: user.id,
      message: body.message,
    });

    const confirmationNeeded = requiresConfirmation(body.message);
    const reply = confirmationNeeded
      ? `${result.reply}\n\nI can prepare this, but I will not change records until you confirm.`
      : result.reply;

    const sourceCitations = result.toolResults.flatMap((toolResult) => toolResult.citations ?? []);
    const assistantMessage = await getPrisma().assistantMessage.create({
      data: {
        threadId: thread.id,
        role: "assistant",
        content: reply,
        metadata: {
          feature: "phase3b_ai_advisor",
          promptVersion: "phase3b-advisor-v1",
          provider: result.provider,
          toolResults: result.toolResults,
          sourceCitations,
          confirmationNeeded,
          latencyMs: Date.now() - startedAt,
          costKoboEstimate: 0,
        } as Prisma.InputJsonObject,
      },
    });

    await getPrisma().auditLog.create({
      data: {
        businessId: access.businessId,
        actorId: user.id,
        action: "assistant.chat",
        message: "AI Business Advisor replied with grounded source metadata.",
        metadata: {
          feature: "phase3b_ai_advisor",
          threadId: thread.id,
          assistantMessageId: assistantMessage.id,
          provider: result.provider,
          promptVersion: "phase3b-advisor-v1",
          sourceCitations,
          confirmationNeeded,
          latencyMs: Date.now() - startedAt,
          costKoboEstimate: 0,
        } as Prisma.InputJsonObject,
      },
    });
    await maybeRecordAiEvaluationEvent({
      businessId: access.businessId,
      actorId: user.id,
      feature: "phase3b_ai_advisor",
      artifactType: "assistant_message",
      artifactId: assistantMessage.id,
      eventType: "request",
      modelVersion: result.provider,
      promptVersion: "phase3b-advisor-v1",
      latencyMs: Date.now() - startedAt,
      costKobo: 0,
      metadata: {
        threadId: thread.id,
        toolCount: result.toolResults.length,
        citationCount: sourceCitations.length,
        confirmationNeeded,
      },
    });

    return Response.json({
      threadId: thread.id,
      assistantMessageId: assistantMessage.id,
      reply,
      confirmationNeeded,
      sourceCitations,
    });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error("assistant.chat_failed", error);
    return jsonErrorFromUnknown(error, "MoneyBook Assistant could not reply right now.");
  }
}

async function getOrCreateThread({
  threadId,
  businessId,
  userId,
  title,
}: {
  threadId?: string;
  businessId: string;
  userId: string;
  title: string;
}) {
  if (threadId) {
    const existing = await getPrisma().assistantThread.findFirst({
      where: { id: threadId, businessId, userId },
    });

    if (existing) {
      return existing;
    }
  }

  return getPrisma().assistantThread.create({
    data: { businessId, userId, title },
  });
}

async function enforceAdvisorUsageLimit(businessId: string) {
  const limit = phase3OperationalControls.dailyRequestLimitPerBusiness;

  if (limit <= 0) {
    return null;
  }

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const count = await getPrisma().assistantMessage.count({
    where: {
      role: "user",
      createdAt: { gte: startOfDay },
      thread: { businessId },
    },
  });

  if (count < limit) {
    return null;
  }

  return Response.json(
    { error: "AI Business Advisor daily limit reached for this business." },
    { status: 429 },
  );
}
