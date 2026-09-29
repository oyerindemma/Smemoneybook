import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isPasswordResetEmailConfigured, sendPasswordResetEmail } from "@/lib/email/password-reset";

const originalEnv = { ...process.env };

describe("sendPasswordResetEmail", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn(),
      }),
    );
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "SME MoneyBook <support@smemoneybook.com>";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    process.env = { ...originalEnv };
  });

  it("sends a password reset email through Resend", async () => {
    await sendPasswordResetEmail({
      to: "owner@example.com",
      resetUrl: "https://app.example.com/reset-password?token=abc123",
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer re_test",
          "Content-Type": "application/json",
        },
      }),
    );

    const [, request] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(String(request?.body));
    expect(body).toMatchObject({
      from: "SME MoneyBook <support@smemoneybook.com>",
      to: "owner@example.com",
      subject: "Reset your SME MoneyBook password",
    });
    expect(body.text).toContain("https://app.example.com/reset-password?token=abc123");
    expect(body.html).toContain("Reset your password");
  });

  it("fails closed when the dedicated EMAIL_FROM setting is absent", async () => {
    delete process.env.EMAIL_FROM;
    process.env.Admin_Email = "admin@smemoneybook.com";

    expect(isPasswordResetEmailConfigured()).toBe(false);
    await expect(sendPasswordResetEmail({
      to: "owner@example.com",
      resetUrl: "https://app.example.com/reset-password?token=abc123",
    })).rejects.toThrow("EMAIL_FROM");
  });

  it("surfaces provider errors", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: vi.fn().mockResolvedValue({ message: "Domain is not verified" }),
    } as unknown as Response);

    await expect(
      sendPasswordResetEmail({
        to: "owner@example.com",
        resetUrl: "https://app.example.com/reset-password?token=abc123",
      }),
    ).rejects.toThrow("Email provider returned 403");
  });

  it("requires the verified SME MoneyBook sender domain in Production", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.EMAIL_FROM = "SME MoneyBook <support@example.com>";

    expect(isPasswordResetEmailConfigured()).toBe(false);
    await expect(sendPasswordResetEmail({
      to: "owner@example.com",
      resetUrl: "https://smemoneybook.com/reset-password?token=abc123",
    })).rejects.toThrow("smemoneybook.com");
  });
});
