import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
const remindDebtForUser = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  requireUser,
}));

vi.mock("@/lib/bookkeeping/persistence", () => ({
  remindDebtForUser,
}));

describe("sendDebtReminderAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "user_1", name: "Owner", email: "owner@test.ng" });
    remindDebtForUser.mockResolvedValue({
      message: "WhatsApp reminder sent to John.",
      whatsappResult: { ok: true },
      state: { businessId: "biz_1" },
    });
  });

  it("protects and sends WhatsApp reminders for the selected business", async () => {
    const { sendDebtReminderAction } = await import("@/server/actions/whatsapp/send-debt-reminder");
    const result = await sendDebtReminderAction({ businessId: "biz_1", debtId: "debt_1" });

    expect(result.ok).toBe(true);
    expect(remindDebtForUser).toHaveBeenCalledWith({
      userId: "user_1",
      businessId: "biz_1",
      debtId: "debt_1",
      channel: "whatsapp",
    });
  });

  it("returns friendly failures without throwing to the client", async () => {
    remindDebtForUser.mockResolvedValueOnce({
      message: "WhatsApp is not configured yet.",
      whatsappResult: { ok: false },
      state: { businessId: "biz_1" },
    });

    const { sendDebtReminderAction } = await import("@/server/actions/whatsapp/send-debt-reminder");
    const result = await sendDebtReminderAction({ businessId: "biz_1", debtId: "debt_1" });

    expect(result.ok).toBe(false);
    expect(result.message).toBe("WhatsApp is not configured yet.");
  });
});
