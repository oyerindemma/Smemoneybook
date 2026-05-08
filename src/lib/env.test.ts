import { afterEach, describe, expect, it } from "vitest";
import { getAppEnv, getWhatsAppEnv } from "@/lib/env";

const originalEnv = { ...process.env };

describe("env validation", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("provides a local app URL fallback", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(getAppEnv().NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
  });

  it("throws clear errors for missing WhatsApp settings", () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    delete process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;

    expect(() => getWhatsAppEnv()).toThrow("Invalid WhatsApp environment configuration");
  });
});
