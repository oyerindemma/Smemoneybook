import { describe, expect, it, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";

const createEvent = vi.fn();
const updateMessage = vi.fn();
const handleIncomingMessage = vi.fn();
const eventIds = new Set<string>();

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
    vi.clearAllMocks();
    eventIds.clear();
    createEvent.mockImplementation(({ data }: { data: { id?: string } }) => {
      if (data.id && eventIds.has(data.id)) {
        return Promise.reject(Object.assign(new Error("duplicate"), { code: "P2002" }));
      }
      if (data.id) eventIds.add(data.id);
      return Promise.resolve({ id: data.id ?? "event_raw" });
    });
    handleIncomingMessage.mockResolvedValue({ ok: true });
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "verify_me";
    process.env.WHATSAPP_APP_SECRET = "app_secret_for_tests";
  });

  it("verifies Meta webhook challenge", async () => {
    const { GET } = await import("@/app/api/webhooks/whatsapp/route");
    const response = await GET(
      new Request(
        "http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify_me&hub.challenge=abc123",
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("abc123");
  });

  it("rejects invalid verify token", async () => {
    const { GET } = await import("@/app/api/webhooks/whatsapp/route");
    const response = await GET(
      new Request(
        "http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc123",
      ),
    );

    expect(response.status).toBe(403);
  });

  it("never crashes on malformed POST payloads", async () => {
    const { POST } = await import("@/app/api/webhooks/whatsapp/route");
    const response = await POST(
      signedRequest("{bad"),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("EVENT_RECEIVED");
  });

  it("stores delivery statuses and updates matching message logs", async () => {
    const { POST } = await import("@/app/api/webhooks/whatsapp/route");
    const body = JSON.stringify({
          entry: [
            {
              changes: [
                {
                  value: {
                    statuses: [
                      {
                        id: "wamid.1",
                        status: "delivered",
                        timestamp: "1710000000",
                        recipient_id: "2348012345678",
                      },
                    ],
                  },
                },
              ],
            },
          ],
        });
    const response = await POST(signedRequest(body));

    expect(response.status).toBe(200);
    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "message_delivered",
          externalId: "wamid.1",
        }),
      }),
    );
    expect(updateMessage).toHaveBeenCalledWith({
      where: { externalId: "wamid.1" },
      data: { status: "delivered" },
    });
  });

  it("fails closed when the Meta app secret is absent", async () => {
    delete process.env.WHATSAPP_APP_SECRET;
    const { POST } = await import("@/app/api/webhooks/whatsapp/route");
    const response = await POST(new Request("http://localhost/api/webhooks/whatsapp", {
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(401);
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("does not route the same inbound message twice", async () => {
    const { POST } = await import("@/app/api/webhooks/whatsapp/route");
    const body = JSON.stringify({
      entry: [{
        changes: [{
          value: {
            messages: [{ id: "wamid.duplicate", from: "2348012345678", type: "text", text: { body: "balance" } }],
          },
        }],
      }],
    });

    expect((await POST(signedRequest(body))).status).toBe(200);
    expect((await POST(signedRequest(body))).status).toBe(200);
    expect(handleIncomingMessage).toHaveBeenCalledTimes(1);
  });
});

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
