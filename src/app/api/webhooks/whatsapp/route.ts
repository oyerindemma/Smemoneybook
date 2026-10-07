import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { after } from "next/server";
import { getWhatsAppWebhookVerifyToken } from "@/lib/env";
import { isPhase3FeatureEnabled } from "@/lib/phase3/feature-flags";
import { getPrisma } from "@/lib/prisma";
import { handleIncomingWhatsAppBotMessage } from "@/lib/chatbot/whatsapp-bot-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    token &&
    safeEqual(token, getWebhookToken()) &&
    challenge
  ) {
    return new Response(challenge, { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const rawBody = await request.text().catch(() => "");

  try {
    if (!isValidSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
      return new Response("Invalid signature", { status: 401 });
    }

    await scheduleWebhookWork(async () => {
      const payload = safeJson(rawBody);

      if (!payload) {
        await writeEvent("malformed", { received: Boolean(rawBody) });
        return;
      }

      const events = parseWebhookPayload(payload);
      await writeEvent("webhook_received", summarizeWebhookPayload(payload));
      for (const event of events) {
        const inserted = await writeEvent(
          event.eventType,
          event.auditPayload,
          event.externalId,
          event.status,
        );
        if (
          inserted &&
          isEligibleIncomingMessage(event) &&
          isPhase3FeatureEnabled("whatsappAutomation")
        ) {
          await routeIncomingMessage(event);
        }
      }
    });

    return new Response("EVENT_RECEIVED", { status: 200 });
  } catch (error) {
    console.error("whatsapp.webhook_failed", error);
    return new Response("EVENT_RECEIVED", { status: 200 });
  }
}

async function scheduleWebhookWork(work: () => Promise<void>) {
  try {
    after(async () => {
      try {
        await work();
      } catch (error) {
        console.error("whatsapp.webhook_background_failed", error);
      }
    });
  } catch {
    await work();
  }
}

async function routeIncomingMessage(event: {
  payload: Record<string, unknown>;
  externalId?: string;
}) {
  const from = typeof event.payload.from === "string" ? event.payload.from : "";
  const text = typeof event.payload.text === "string" ? event.payload.text : "";

  if (event.payload.type !== "text" || !from || !text.trim()) {
    return;
  }

  try {
    await handleIncomingWhatsAppBotMessage({ from, text, externalId: event.externalId });
  } catch (error) {
    console.error("whatsapp.bot_route_failed", error);
  }
}

function parseWebhookPayload(payload: unknown) {
  const events: Array<{
    eventType: string;
    payload: Record<string, unknown>;
    auditPayload: Record<string, unknown>;
    externalId?: string;
    status?: string;
  }> = [];

  if (!isRecord(payload) || payload.object !== "whatsapp_business_account") {
    return events;
  }

  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  for (const entry of entries) {
    if (!isRecord(entry)) {
      continue;
    }

    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for (const change of changes) {
      if (!isRecord(change) || change.field !== "messages" || !isRecord(change.value)) {
        continue;
      }

      const value = change.value;
      const messages = Array.isArray(value.messages) ? value.messages : [];
      const statuses = Array.isArray(value.statuses) ? value.statuses : [];

      for (const message of messages) {
        if (!isRecord(message)) {
          continue;
        }

        const text =
          isRecord(message.text) && typeof message.text.body === "string"
            ? message.text.body
            : "";
        const messageType = safeLabel(message.type, "unknown");
        const timestamp = safeTimestamp(message.timestamp);
        events.push({
          eventType: "incoming_message",
          externalId: nonEmptyString(message.id),
          payload: {
            from: typeof message.from === "string" ? message.from : "",
            type: messageType,
            text,
          },
          auditPayload: {
            messageType,
            hasText: Boolean(text.trim()),
            ...(timestamp ? { timestamp } : {}),
          },
        });
      }

      for (const status of statuses) {
        if (!isRecord(status)) {
          continue;
        }

        const messageStatus = safeMessageStatus(status.status);
        const timestamp = safeTimestamp(status.timestamp);
        const errors = Array.isArray(status.errors) ? status.errors : [];
        events.push({
          eventType: messageStatus ? `message_${messageStatus}` : "message_status",
          externalId: nonEmptyString(status.id),
          status: messageStatus,
          payload: {},
          auditPayload: {
            status: messageStatus ?? "unknown",
            hasErrors: errors.length > 0,
            ...(timestamp ? { timestamp } : {}),
          },
        });
      }
    }
  }

  return events;
}

async function writeEvent(
  eventType: string,
  payload: Record<string, unknown>,
  externalId?: string,
  status?: string,
) {
  try {
    await getPrisma().$transaction(async (tx) => {
      await tx.whatsAppEvent.create({
        data: {
          ...(externalId ? { id: deterministicEventId(eventType, externalId) } : {}),
          eventType,
          payload: payload as Prisma.InputJsonObject,
          externalId,
        },
      });

      if (externalId && status) {
        await tx.whatsAppMessage.updateMany({
          where: { externalId },
          data: { status },
        });
      }
    });
    return true;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return false;
    }
    console.error("whatsapp.webhook_event_log_failed", error);
    return false;
  }
}

function getWebhookToken() {
  try {
    return getWhatsAppWebhookVerifyToken();
  } catch (error) {
    console.error("whatsapp.webhook_verify_token_missing", error);
    return "";
  }
}

function isValidSignature(rawBody: string, signature: string | null) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    return false;
  }

  if (!signature?.startsWith("sha256=")) {
    return false;
  }

  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  return safeEqual(signature, expected);
}

function deterministicEventId(eventType: string, externalId: string) {
  return `waevt_${createHash("sha256").update(`${eventType}:${externalId}`).digest("hex")}`;
}

function isUniqueConstraintError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  return left.length === right.length && timingSafeEqual(left, right);
}

function safeJson(rawBody: string) {
  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    return null;
  }
}

function summarizeWebhookPayload(payload: unknown): Record<string, unknown> {
  if (!isRecord(payload)) {
    return { recognizedObject: false, entryCount: 0, changeCount: 0 };
  }

  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  const changeCount = entries.reduce((count, entry) => {
    if (!isRecord(entry) || !Array.isArray(entry.changes)) {
      return count;
    }
    return count + entry.changes.length;
  }, 0);

  return {
    recognizedObject: payload.object === "whatsapp_business_account",
    entryCount: entries.length,
    changeCount,
  };
}

function isEligibleIncomingMessage(event: {
  eventType: string;
  payload: Record<string, unknown>;
  externalId?: string;
}) {
  return (
    event.eventType === "incoming_message" &&
    Boolean(event.externalId) &&
    event.payload.type === "text" &&
    Boolean(nonEmptyString(event.payload.from)) &&
    Boolean(nonEmptyString(event.payload.text))
  );
}

function nonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function safeLabel(value: unknown, fallback: string) {
  return typeof value === "string" && /^[a-z0-9_]{1,64}$/i.test(value) ? value : fallback;
}

function safeTimestamp(value: unknown) {
  return typeof value === "string" && /^\d{1,20}$/.test(value) ? value : undefined;
}

function safeMessageStatus(value: unknown) {
  const status = safeLabel(value, "");
  return ["sent", "delivered", "read", "failed"].includes(status) ? status : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
