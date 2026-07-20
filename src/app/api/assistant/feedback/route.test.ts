import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
const getBusinessAccess = vi.fn();
const findMessage = vi.fn();
const updateMessage = vi.fn();
const createAudit = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  requireUser,
}));

vi.mock("@/lib/operations/access", () => ({
  getBusinessAccess,
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    assistantMessage: {
      findFirst: findMessage,
      update: updateMessage,
    },
    auditLog: {
      create: createAudit,
    },
  }),
}));

describe("/api/assistant/feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "user_1" });
    getBusinessAccess.mockResolvedValue({ businessId: "biz_1" });
    findMessage.mockResolvedValue({
      id: "msg_1",
      threadId: "thread_1",
      metadata: { provider: "local" },
    });
    updateMessage.mockResolvedValue({ id: "msg_1" });
  });

  it("stores feedback only for an assistant message in the active business", async () => {
    const { POST } = await import("@/app/api/assistant/feedback/route");
    const response = await POST(
      new Request("http://localhost/api/assistant/feedback", {
        method: "POST",
        body: JSON.stringify({
          businessId: "biz_1",
          messageId: "msg_1",
          rating: "helpful",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(findMessage).toHaveBeenCalledWith({
      where: {
        id: "msg_1",
        role: "assistant",
        thread: { businessId: "biz_1" },
      },
      select: {
        id: true,
        metadata: true,
        threadId: true,
      },
    });
    expect(updateMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "msg_1" },
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            feedback: expect.objectContaining({ rating: "helpful", actorId: "user_1" }),
          }),
        }),
      }),
    );
    expect(createAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "assistant.feedback", businessId: "biz_1" }),
      }),
    );
  });

  it("rejects feedback across business boundaries", async () => {
    findMessage.mockResolvedValue(null);

    const { POST } = await import("@/app/api/assistant/feedback/route");
    const response = await POST(
      new Request("http://localhost/api/assistant/feedback", {
        method: "POST",
        body: JSON.stringify({
          businessId: "biz_1",
          messageId: "msg_other",
          rating: "incorrect",
        }),
      }),
    );

    expect(response.status).toBe(404);
    expect(updateMessage).not.toHaveBeenCalled();
  });
});
