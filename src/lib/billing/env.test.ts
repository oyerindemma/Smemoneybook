import { afterEach, describe, expect, it, vi } from "vitest";
import { getPaystackEnv, isPaystackConfigured } from "@/lib/billing/env";

const originalEnv = { ...process.env };

describe("Paystack env", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    process.env = { ...originalEnv };
  });

  it("allows test keys outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    delete process.env.VERCEL_ENV;
    process.env.PAYSTACK_PUBLIC_KEY = "pk_test_123";
    process.env.PAYSTACK_SECRET_KEY = "sk_test_123";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000/";

    expect(getPaystackEnv()).toEqual({
      publicKey: "pk_test_123",
      secretKey: "sk_test_123",
      appUrl: "http://localhost:3000",
    });
    expect(isPaystackConfigured()).toBe(true);
  });

  it("requires live keys in production", () => {
    process.env.VERCEL_ENV = "production";
    process.env.PAYSTACK_PUBLIC_KEY = "pk_test_123";
    process.env.PAYSTACK_SECRET_KEY = "sk_test_123";
    process.env.NEXT_PUBLIC_APP_URL = "https://smemoneybook.com";

    expect(() => getPaystackEnv()).toThrow("Production billing requires Paystack live keys");
    expect(isPaystackConfigured()).toBe(false);
  });

  it("rejects mixed Paystack key modes", () => {
    vi.stubEnv("NODE_ENV", "development");
    delete process.env.VERCEL_ENV;
    process.env.PAYSTACK_PUBLIC_KEY = "pk_live_123";
    process.env.PAYSTACK_SECRET_KEY = "sk_test_123";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

    expect(() => getPaystackEnv()).toThrow("Paystack public and secret keys must both be test keys or both be live keys");
  });
});
