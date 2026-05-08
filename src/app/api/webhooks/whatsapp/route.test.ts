import { describe, expect, it, vi, beforeEach } from "vitest";

const createEvent = vi.fn();
const updateMessage = vi.fn();

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

describe("/api/webhooks/whatsapp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "verify_me";
    delete process.env.WHATSAPP_APP_SECRET;
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
      new Request("http://localhost/api/webhooks/whatsapp", {
        method: "POST",
        body: "{bad",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("EVENT_RECEIVED");
  });

  it("stores delivery statuses and updates matching message logs", async () => {
    const { POST } = await import("@/app/api/webhooks/whatsapp/route");
    const response = await POST(
      new Request("http://localhost/api/webhooks/whatsapp", {
        method: "POST",
        body: JSON.stringify({
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
        }),
      }),
    );

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
});
