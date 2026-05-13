import { createHmac, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { after } from "next/server";
import { getWhatsAppWebhookVerifyToken } from "@/lib/env";
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
    token === getWebhookToken() &&
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
      await Promise.all([
        writeEvent("raw_webhook", sanitizePayload(payload)),
        ...events.map((event) =>
          writeEvent(event.eventType, event.payload, event.externalId, event.status),
        ),
        ...events
          .filter((event) => event.eventType === "incoming_message")
          .map((event) => routeIncomingMessage(event)),
      ]);
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

  if (!from || !text) {
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
    externalId?: string;
    status?: string;
  }> = [];

  if (!isRecord(payload)) {
    return events;
  }

  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  for (const entry of entries) {
    if (!isRecord(entry)) {
      continue;
    }

    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for (const change of changes) {
      if (!isRecord(change) || !isRecord(change.value)) {
        continue;
      }

      const value = change.value;
      const messages = Array.isArray(value.messages) ? value.messages : [];
      const statuses = Array.isArray(value.statuses) ? value.statuses : [];

      for (const message of messages) {
        if (!isRecord(message)) {
          continue;
        }

        const text = isRecord(message.text) ? String(message.text.body ?? "") : "";
        events.push({
          eventType: "incoming_message",
          externalId: typeof message.id === "string" ? message.id : undefined,
          payload: sanitizePayload({
            id: message.id,
            from: message.from,
            timestamp: message.timestamp,
            type: message.type,
            text,
          }),
        });
      }

      for (const status of statuses) {
        if (!isRecord(status)) {
          continue;
        }

        events.push({
          eventType: `message_${String(status.status ?? "status")}`,
          externalId: typeof status.id === "string" ? status.id : undefined,
          status: typeof status.status === "string" ? status.status : undefined,
          payload: sanitizePayload({
            id: status.id,
            status: status.status,
            timestamp: status.timestamp,
            recipientId: status.recipient_id,
            errors: status.errors,
          }),
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
  } catch (error) {
    console.error("whatsapp.webhook_event_log_failed", error);
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
    return process.env.NODE_ENV !== "production";
  }

  if (!signature?.startsWith("sha256=")) {
    return false;
  }

  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  return safeEqual(signature, expected);
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

function sanitizePayload(payload: unknown): Record<string, unknown> {
  const seen = new WeakSet<object>();

  return JSON.parse(
    JSON.stringify(payload, (key, value) => {
      if (typeof key === "string" && /token|authorization|secret|password/i.test(key)) {
        return "[redacted]";
      }

      if (typeof value === "string") {
        return value.slice(0, 2000);
      }

      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) {
          return "[circular]";
        }
        seen.add(value);
      }

      return value;
    }),
  ) as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
