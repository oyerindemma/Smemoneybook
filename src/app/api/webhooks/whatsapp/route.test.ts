import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createEvent = vi.fn();
const updateMessage = vi.fn();
const handleIncomingMessage = vi.fn();
const eventIds = new Set<string>();
const syntheticPhone = "15550000000";
const syntheticText = "synthetic webhook test";

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    $transaction: async (callback: (tx: unknown) => unknown) =>
      callback({
        whatsAppEvent: {
          create: createEvent,
        },
        whatsAppMessage: {
          updateMany: updateMessage,
        },
      }),
  }),
}));

vi.mock("@/lib/chatbot/whatsapp-bot-service", () => ({
  handleIncomingWhatsAppBotMessage: handleIncomingMessage,
}));

describe("/api/webhooks/whatsapp", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    eventIds.clear();
    createEvent.mockImplementation(({ data }: { data: { id?: string } }) => {
      if (data.id && eventIds.has(data.id)) {
        return Promise.reject(Object.assign(new Error("duplicate"), { code: "P2002" }));
      }
      if (data.id) eventIds.add(data.id);
      return Promise.resolve({ id: data.id ?? "event_received" });
    });
    handleIncomingMessage.mockResolvedValue({ ok: true });
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "verify_me";
    process.env.WHATSAPP_APP_SECRET = "app_secret_for_tests";
    process.env.NEXT_PUBLIC_PHASE3_WHATSAPP_AUTOMATION_ENABLED = "false";
  });

  it("verifies a valid Meta webhook challenge", async () => {
    const { GET } = await import("@/app/api/webhooks/whatsapp/route");
    const response = await GET(
      new Request(
        "http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify_me&hub.challenge=abc123",
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("abc123");
  });

  it("rejects an incorrect GET verification token", async () => {
    const { GET } = await import("@/app/api/webhooks/whatsapp/route");
    const response = await GET(
      new Request(
        "http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc123",
      ),
    );

    expect(response.status).toBe(403);
  });

  it("rejects a missing GET verification token", async () => {
    const { GET } = await import("@/app/api/webhooks/whatsapp/route");
    const response = await GET(
      new Request(
        "http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.challenge=abc123",
      ),
    );

    expect(response.status).toBe(403);
  });

  it("accepts a valid POST signature", async () => {
    const { POST } = await import("@/app/api/webhooks/whatsapp/route");
    const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
    const response = await POST(signedRequest(body));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("EVENT_RECEIVED");
    expect(createEvent).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "webhook_received",
        payload: { recognizedObject: true, entryCount: 0, changeCount: 0 },
      }),
    });
  });

  it("rejects an invalid POST signature", async () => {
    const { POST } = await import("@/app/api/webhooks/whatsapp/route");
    const response = await POST(
      new Request("http://localhost/api/webhooks/whatsapp", {
        method: "POST",
        headers: { "x-hub-signature-256": "sha256=invalid" },
        body: "{}",
      }),
    );

    expect(response.status).toBe(401);
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("rejects a missing POST signature", async () => {
    const { POST } = await import("@/app/api/webhooks/whatsapp/route");
    const response = await POST(
      new Request("http://localhost/api/webhooks/whatsapp", {
        method: "POST",
        body: "{}",
      }),
    );

    expect(response.status).toBe(401);
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("acknowledges malformed signed JSON without routing", async () => {
    const { POST } = await import("@/app/api/webhooks/whatsapp/route");
    const response = await POST(signedRequest("{bad"));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("EVENT_RECEIVED");
    expect(createEvent).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventType: "malformed" }),
    });
    expect(handleIncomingMessage).not.toHaveBeenCalled();
  });

  it("acknowledges an empty signed payload safely", async () => {
    const { POST } = await import("@/app/api/webhooks/whatsapp/route");
    const response = await POST(signedRequest("{}"));

    expect(response.status).toBe(200);
    expect(createEvent).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "webhook_received",
        payload: { recognizedObject: false, entryCount: 0, changeCount: 0 },
      }),
    });
    expect(handleIncomingMessage).not.toHaveBeenCalled();
  });

  it("acknowledges an unknown authentic event without routing", async () => {
    const { POST } = await import("@/app/api/webhooks/whatsapp/route");
    const body = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          field: "unknown",
          value: {
            messages: [{
              id: "wamid.unknown",
              from: syntheticPhone,
              type: "text",
              text: { body: syntheticText },
            }],
          },
        }],
      }],
    });
    const response = await POST(signedRequest(body));

    expect(response.status).toBe(200);
    expect(createEvent).toHaveBeenCalledTimes(1);
    expect(handleIncomingMessage).not.toHaveBeenCalled();
  });

  it.each(["sent", "delivered", "read", "failed"])(
    "acknowledges a %s status without bot routing",
    async (status) => {
      const { POST } = await import("@/app/api/webhooks/whatsapp/route");
      const response = await POST(signedRequest(statusBody(status)));

      expect(response.status).toBe(200);
      expect(createEvent).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: `message_${status}`,
          externalId: `wamid.status.${status}`,
        }),
      });
      expect(updateMessage).toHaveBeenCalledWith({
        where: { externalId: `wamid.status.${status}` },
        data: { status },
      });
      expect(handleIncomingMessage).not.toHaveBeenCalled();
    },
  );

  it("fails closed when the Meta app secret is absent", async () => {
    delete process.env.WHATSAPP_APP_SECRET;
    const { POST } = await import("@/app/api/webhooks/whatsapp/route");
    const response = await POST(
      new Request("http://localhost/api/webhooks/whatsapp", {
        method: "POST",
        headers: { "x-hub-signature-256": "sha256=synthetic" },
        body: "{}",
      }),
    );

    expect(response.status).toBe(401);
    expect(createEvent).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", undefined],
    ["false", "false"],
    ["unexpected", "enabled"],
  ])("does not route inbound messages when the automation flag is %s", async (_label, value) => {
    if (value === undefined) {
      delete process.env.NEXT_PUBLIC_PHASE3_WHATSAPP_AUTOMATION_ENABLED;
    } else {
      process.env.NEXT_PUBLIC_PHASE3_WHATSAPP_AUTOMATION_ENABLED = value;
    }
    const { POST } = await import("@/app/api/webhooks/whatsapp/route");
    const response = await POST(signedRequest(inboundMessageBody("wamid.disabled")));

    expect(response.status).toBe(200);
    expect(handleIncomingMessage).not.toHaveBeenCalled();
  });

  it("requires a provider message ID before routing inbound messages", async () => {
    process.env.NEXT_PUBLIC_PHASE3_WHATSAPP_AUTOMATION_ENABLED = "true";
    const { POST } = await import("@/app/api/webhooks/whatsapp/route");
    const response = await POST(signedRequest(inboundMessageBody()));

    expect(response.status).toBe(200);
    expect(handleIncomingMessage).not.toHaveBeenCalled();
  });

  it("does not route non-text inbound messages", async () => {
    process.env.NEXT_PUBLIC_PHASE3_WHATSAPP_AUTOMATION_ENABLED = "true";
    const { POST } = await import("@/app/api/webhooks/whatsapp/route");
    const response = await POST(
      signedRequest(inboundMessageBody("wamid.image", { type: "image", text: "" })),
    );

    expect(response.status).toBe(200);
    expect(handleIncomingMessage).not.toHaveBeenCalled();
  });

  it("routes one eligible inbound message when automation is on", async () => {
    process.env.NEXT_PUBLIC_PHASE3_WHATSAPP_AUTOMATION_ENABLED = "true";
    const { POST } = await import("@/app/api/webhooks/whatsapp/route");
    const response = await POST(signedRequest(inboundMessageBody("wamid.enabled")));

    expect(response.status).toBe(200);
    expect(handleIncomingMessage).toHaveBeenCalledOnce();
    expect(handleIncomingMessage).toHaveBeenCalledWith({
      from: syntheticPhone,
      text: syntheticText,
      externalId: "wamid.enabled",
    });
  });

  it("does not route the same provider message twice", async () => {
    process.env.NEXT_PUBLIC_PHASE3_WHATSAPP_AUTOMATION_ENABLED = "true";
    const { POST } = await import("@/app/api/webhooks/whatsapp/route");
    const body = inboundMessageBody("wamid.duplicate");

    expect((await POST(signedRequest(body))).status).toBe(200);
    expect((await POST(signedRequest(body))).status).toBe(200);
    expect(handleIncomingMessage).toHaveBeenCalledTimes(1);
  });

  it("persists non-PII webhook summaries instead of raw message data", async () => {
    const { POST } = await import("@/app/api/webhooks/whatsapp/route");
    const response = await POST(signedRequest(inboundMessageBody("wamid.private")));

    expect(response.status).toBe(200);
    const persistedData = createEvent.mock.calls.map(([input]) => input.data);
    expect(persistedData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "webhook_received",
          payload: { recognizedObject: true, entryCount: 1, changeCount: 1 },
        }),
        expect.objectContaining({
          eventType: "incoming_message",
          payload: { messageType: "text", hasText: true, timestamp: "1710000000" },
        }),
      ]),
    );
    expect(JSON.stringify(persistedData)).not.toContain(syntheticPhone);
    expect(JSON.stringify(persistedData)).not.toContain(syntheticText);
  });
});

function inboundMessageBody(
  id?: string,
  options: { type?: string; text?: string } = {},
) {
  const message = {
    ...(id ? { id } : {}),
    from: syntheticPhone,
    timestamp: "1710000000",
    type: options.type ?? "text",
    text: { body: options.text ?? syntheticText },
  };

  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ changes: [{ field: "messages", value: { messages: [message] } }] }],
  });
}

function statusBody(status: string) {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{
      changes: [{
        field: "messages",
        value: {
          statuses: [{
            id: `wamid.status.${status}`,
            status,
            timestamp: "1710000000",
            recipient_id: syntheticPhone,
            errors: status === "failed" ? [{ code: 131000, title: "synthetic failure" }] : [],
          }],
        },
      }],
    }],
  });
}

function signedRequest(body: string) {
  const signature = createHmac("sha256", process.env.WHATSAPP_APP_SECRET as string)
    .update(body)
    .digest("hex");
  return new Request("http://localhost/api/webhooks/whatsapp", {
    method: "POST",
    headers: { "x-hub-signature-256": `sha256=${signature}` },
    body,
  });
}
