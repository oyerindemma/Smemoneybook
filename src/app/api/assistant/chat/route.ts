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

    const access = await getBusinessAccess(user.id, body.businessId);

    if (!access) {
      return jsonError("Choose a business you can access.", 403);
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

    const result = await createAssistantReply({
      businessId: access.businessId,
      userId: user.id,
      message: body.message,
    });

    const confirmationNeeded = requiresConfirmation(body.message);
    const reply = confirmationNeeded
      ? `${result.reply}\n\nI can prepare this, but I will not change records until you confirm.`
      : result.reply;

    await getPrisma().assistantMessage.create({
      data: {
        threadId: thread.id,
        role: "assistant",
        content: reply,
        metadata: {
          provider: result.provider,
          toolResults: result.toolResults,
          confirmationNeeded,
        } as Prisma.InputJsonObject,
      },
    });

    return Response.json({ threadId: thread.id, reply, confirmationNeeded });
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
