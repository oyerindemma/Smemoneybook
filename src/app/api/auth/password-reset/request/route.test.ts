import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const deleteMany = vi.fn();
const create = vi.fn();
const sendPasswordResetEmail = vi.fn();
const isPasswordResetEmailConfigured = vi.fn();

vi.mock("@/lib/auth/rate-limit", () => ({
  enforceRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/email/password-reset", () => ({
  isPasswordResetEmailConfigured,
  sendPasswordResetEmail,
}));

vi.mock("@/lib/operations/monitoring", () => ({
  logApiFailure: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    user: { findUnique },
    passwordResetToken: { deleteMany, create },
  }),
}));

function makeRequest(email: string) {
  return new Request("https://app.example.com/api/auth/password-reset/request", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://app.example.com",
      host: "app.example.com",
      "x-forwarded-proto": "https",
    },
    body: JSON.stringify({ email }),
  });
}

describe("password reset request route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_APP_URL;
    findUnique.mockResolvedValue({ id: "user_1", email: "owner@example.com" });
    deleteMany.mockResolvedValue({ count: 0 });
    create.mockResolvedValue({ id: "reset_1" });
    isPasswordResetEmailConfigured.mockReturnValue(true);
    sendPasswordResetEmail.mockResolvedValue(undefined);
  });

  it("creates a token and sends the reset link when the user exists", async () => {
    const { POST } = await import("@/app/api/auth/password-reset/request/route");

    const response = await POST(makeRequest("Owner@Example.com"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.message).toBe("If that email is registered, we sent password reset instructions.");
    expect(findUnique).toHaveBeenCalledWith({
      where: { email: "owner@example.com" },
      select: { id: true, email: true },
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user_1",
        tokenHash: expect.any(String),
        expiresAt: expect.any(Date),
      }),
    });
    expect(sendPasswordResetEmail).toHaveBeenCalledWith({
      to: "owner@example.com",
      resetUrl: expect.stringMatching(/^https:\/\/app\.example\.com\/reset-password\?token=/),
    });
  });

  it("does not send email when the user is not found", async () => {
    findUnique.mockResolvedValueOnce(null);
    const { POST } = await import("@/app/api/auth/password-reset/request/route");

    const response = await POST(makeRequest("missing@example.com"));

    expect(response.status).toBe(200);
    expect(create).not.toHaveBeenCalled();
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("fails in production when email is not configured for an existing user", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@example.com:5432/db");
    isPasswordResetEmailConfigured.mockReturnValueOnce(false);
    const { POST } = await import("@/app/api/auth/password-reset/request/route");

    const response = await POST(makeRequest("owner@example.com"));
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.error).toBe("Could not start password reset right now.");
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
