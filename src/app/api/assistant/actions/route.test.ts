import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
const requireBusinessAccess = vi.fn();
const createAction = vi.fn();
const updateMany = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  requireUser,
}));

vi.mock("@/lib/operations/access", () => ({
  requireBusinessAccess,
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    pendingAssistantAction: {
      create: createAction,
      updateMany,
    },
  }),
}));

describe("/api/assistant/actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "user_1" });
    requireBusinessAccess.mockResolvedValue({ businessId: "biz_1" });
    createAction.mockResolvedValue({ id: "act_1", status: "pending" });
    updateMany.mockResolvedValue({ count: 1 });
  });

  it("creates pending assistant actions", async () => {
    const { POST } = await import("@/app/api/assistant/actions/route");
    const response = await POST(
      new Request("http://localhost/api/assistant/actions", {
        method: "POST",
        body: JSON.stringify({ businessId: "biz_1", type: "send_whatsapp_message", payload: { draft: "Hi" } }),
      }),
    );

    expect(response.status).toBe(200);
    expect(createAction).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ businessId: "biz_1", userId: "user_1" }),
      }),
    );
  });

  it("approves or rejects only pending owned actions", async () => {
    const { POST } = await import("@/app/api/assistant/actions/route");
    const response = await POST(
      new Request("http://localhost/api/assistant/actions", {
        method: "POST",
        body: JSON.stringify({ businessId: "biz_1", actionId: "act_1", decision: "reject" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "act_1", businessId: "biz_1", userId: "user_1", status: "pending" },
      data: { status: "rejected" },
    });
  });
});
