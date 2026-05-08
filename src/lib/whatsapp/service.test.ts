import { beforeEach, describe, expect, it, vi } from "vitest";

const sendText = vi.fn();
const createMessage = vi.fn();
const createAudit = vi.fn();
const findPreference = vi.fn();
const rateLimitFindUnique = vi.fn();
const rateLimitUpsert = vi.fn();
const rateLimitUpdate = vi.fn();

vi.mock("@/lib/whatsapp/client", () => ({
  getWhatsAppClient: () => ({ sendText }),
  normalizeUnknownError: (error: unknown) => ({
    message: error instanceof Error ? error.message : "failed",
    retryable: false,
  }),
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    messagePreference: { findUnique: findPreference },
    rateLimitBucket: {
      findUnique: rateLimitFindUnique,
      upsert: rateLimitUpsert,
      update: rateLimitUpdate,
    },
    $transaction: async (callback: (tx: unknown) => unknown) =>
      callback({
        whatsAppMessage: { create: createMessage },
        auditLog: { create: createAudit },
        rateLimitBucket: {
          findUnique: rateLimitFindUnique,
          upsert: rateLimitUpsert,
          update: rateLimitUpdate,
        },
      }),
  }),
}));

describe("WhatsApp send service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendText.mockResolvedValue({ messages: [{ id: "wamid.1" }] });
    findPreference.mockResolvedValue(null);
    rateLimitFindUnique.mockResolvedValue(null);
    rateLimitUpsert.mockResolvedValue({
      key: "bucket",
      count: 1,
      resetAt: new Date(Date.now() + 1000),
    });
  });

  it("normalizes numbers and logs successful sends", async () => {
    const { sendTextMessage } = await import("@/lib/whatsapp/service");
    const result = await sendTextMessage({
      to: "08012345678",
      message: "Hello",
      businessId: "biz_1",
      actorId: "user_1",
    });

    expect(result).toMatchObject({ ok: true, phone: "2348012345678", messageId: "wamid.1" });
    expect(sendText).toHaveBeenCalledWith("2348012345678", "Hello");
    expect(createMessage).toHaveBeenCalled();
    expect(createAudit).toHaveBeenCalled();
  });

  it("returns a typed failure for invalid phone numbers", async () => {
    const { sendTextMessage } = await import("@/lib/whatsapp/service");
    const result = await sendTextMessage({ to: "123", message: "Hello" });

    expect(result.ok).toBe(false);
    expect(result.status).toBe("failed");
    expect(sendText).not.toHaveBeenCalled();
  });
});
