import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
const enforceRateLimit = vi.fn();
const requireFeatureAccess = vi.fn();
const requireBusinessAccess = vi.fn();
const inviteStaff = vi.fn();
const isStaffInvitationEmailConfigured = vi.fn();
const sendStaffInvitationEmail = vi.fn();
const logApiFailure = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  requireUser,
}));

vi.mock("@/lib/auth/rate-limit", () => ({
  enforceRateLimit,
}));

vi.mock("@/lib/billing/subscriptions", () => ({
  requireFeatureAccess,
}));

vi.mock("@/lib/email/staff-invitation", () => ({
  isStaffInvitationEmailConfigured,
  sendStaffInvitationEmail,
}));

vi.mock("@/lib/operations/access", () => ({
  requireBusinessAccess,
}));

vi.mock("@/lib/operations/service", () => ({
  inviteStaff,
}));

vi.mock("@/lib/operations/monitoring", () => ({
  logApiFailure,
}));

function makeRequest() {
  return new Request("https://app.example.com/api/staff/invitations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      businessId: "biz_1",
      email: "staff@example.com",
      role: "staff",
    }),
  });
}

describe("staff invitation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_APP_URL;
    requireUser.mockResolvedValue({ id: "user_1", name: "Owner", email: "owner@example.com" });
    enforceRateLimit.mockResolvedValue(null);
    requireBusinessAccess.mockResolvedValue({ businessId: "biz_1", businessName: "Demo Shop" });
    requireFeatureAccess.mockResolvedValue(null);
    inviteStaff.mockResolvedValue({
      id: "invite_1",
      email: "staff@example.com",
      role: "staff",
      token: "invite_token",
      expiresAt: "2026-07-21T00:00:00.000Z",
      status: "pending",
    });
  });

  it("creates and emails a staff invitation link", async () => {
    isStaffInvitationEmailConfigured.mockReturnValue(true);
    sendStaffInvitationEmail.mockResolvedValue(undefined);

    const { POST } = await import("@/app/api/staff/invitations/route");
    const response = await POST(makeRequest());
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.emailSent).toBe(true);
    expect(payload.inviteUrl).toBe("https://app.example.com/invite/invite_token");
    expect(sendStaffInvitationEmail).toHaveBeenCalledWith({
      to: "staff@example.com",
      inviteUrl: "https://app.example.com/invite/invite_token",
      businessName: "Demo Shop",
      inviterName: "Owner",
      role: "staff",
      expiresAt: "2026-07-21T00:00:00.000Z",
    });
  });

  it("keeps the invite link available when email is not configured", async () => {
    isStaffInvitationEmailConfigured.mockReturnValue(false);

    const { POST } = await import("@/app/api/staff/invitations/route");
    const response = await POST(makeRequest());
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.emailSent).toBe(false);
    expect(payload.inviteUrl).toBe("https://app.example.com/invite/invite_token");
    expect(sendStaffInvitationEmail).not.toHaveBeenCalled();
  });
});
