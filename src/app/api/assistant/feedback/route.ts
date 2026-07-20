import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { assertSameOriginRequest, jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { parseJsonBody } from "@/lib/api/validation";
import { getBusinessAccess } from "@/lib/operations/access";
import { getPrisma } from "@/lib/prisma";
import { sanitizeAssistantText } from "@/lib/assistant/assistant-guardrails";
import { maybeRecordAiEvaluationEvent } from "@/lib/phase3/ai-evaluation-service";

export const runtime = "nodejs";

const feedbackRequestSchema = z.object({
  businessId: z.preprocess((val) => val ?? "", z.string().min(1, "Choose a business.")),
  messageId: z.preprocess((val) => val ?? "", z.string().min(1, "Choose a message.")),
  rating: z.enum(["helpful", "not_helpful", "correct", "incorrect"]),
  note: z.preprocess((val) => val ?? "", z.string().trim().max(500)).optional(),
});

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const body = await parseJsonBody(request, feedbackRequestSchema);
    const access = await getBusinessAccess(user.id, body.businessId);

    if (!access) {
      return jsonError("Choose a business you can access.", 403);
    }

    const message = await getPrisma().assistantMessage.findFirst({
      where: {
        id: body.messageId,
        role: "assistant",
        thread: {
          businessId: access.businessId,
        },
      },
      select: {
        id: true,
        metadata: true,
        threadId: true,
      },
    });

    if (!message) {
      return jsonError("Choose a valid assistant message.", 404);
    }

    const metadata = normalizeMetadata(message.metadata);
    const feedback = {
      rating: body.rating,
      note: body.note ? sanitizeAssistantText(body.note) : undefined,
      actorId: user.id,
      submittedAt: new Date().toISOString(),
    };

    await getPrisma().assistantMessage.update({
      where: { id: message.id },
      data: {
        metadata: {
          ...metadata,
          feedback,
        } as Prisma.InputJsonObject,
      },
    });

    await getPrisma().auditLog.create({
      data: {
        businessId: access.businessId,
        actorId: user.id,
        action: "assistant.feedback",
        message: `AI Business Advisor feedback recorded as ${body.rating}.`,
        metadata: {
          feature: "phase3b_ai_advisor",
          threadId: message.threadId,
          assistantMessageId: message.id,
          rating: body.rating,
        } as Prisma.InputJsonObject,
      },
    });
    await maybeRecordAiEvaluationEvent({
      businessId: access.businessId,
      actorId: user.id,
      feature: "phase3b_ai_advisor",
      artifactType: "assistant_message",
      artifactId: message.id,
      eventType: "feedback",
      rating: body.rating,
      correct: body.rating === "correct" ? true : body.rating === "incorrect" ? false : undefined,
      correction: body.note ? sanitizeAssistantText(body.note) : undefined,
      modelVersion: readString(metadata.provider),
      promptVersion: readString(metadata.promptVersion),
      metadata: {
        threadId: message.threadId,
        sourceCitationCount: Array.isArray(metadata.sourceCitations) ? metadata.sourceCitations.length : 0,
      },
    });

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error("assistant.feedback_failed", error);
    return jsonErrorFromUnknown(error, "Could not save assistant feedback.");
  }
}

function normalizeMetadata(value: Prisma.JsonValue | null): Record<string, Prisma.JsonValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, Prisma.JsonValue>;
}

function readString(value: Prisma.JsonValue | undefined) {
  return typeof value === "string" ? value : undefined;
}
