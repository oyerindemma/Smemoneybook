import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ activate: vi.fn() }));

vi.mock("@/lib/billing/env", () => ({
  getPaystackEnv: () => ({
    publicKey: "pk_live_redacted",
    secretKey: "sk_live_webhook_test_secret",
    appUrl: "https://smemoneybook.com",
  }),
}));
vi.mock("@/lib/billing/subscriptions", () => ({ activatePaystackSubscription: mocks.activate }));

const secret = "sk_live_webhook_test_secret";

describe("Paystack webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.activate.mockResolvedValue({ alreadyProcessed: false });
  });

  it("fails closed without a valid x-paystack-signature", async () => {
    const { POST } = await import("@/app/api/paystack/webhook/route");
    const response = await POST(new Request("http://localhost/api/paystack/webhook", {
      method: "POST",
      body: JSON.stringify({ event: "charge.success" }),
    }));

    expect(response.status).toBe(401);
    expect(mocks.activate).not.toHaveBeenCalled();
  });

  it("handles malformed signed payloads without exposing the body", async () => {
    const { POST } = await import("@/app/api/paystack/webhook/route");
    const response = await POST(signedRequest("{bad"));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Invalid Paystack webhook payload.");
    expect(mocks.activate).not.toHaveBeenCalled();
  });

  it("acknowledges non-charge events without changing subscriptions", async () => {
    const { POST } = await import("@/app/api/paystack/webhook/route");
    const body = JSON.stringify({ event: "transfer.success", data: { reference: "ref_1" } });
    const response = await POST(signedRequest(body));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, ignored: true });
    expect(mocks.activate).not.toHaveBeenCalled();
  });

  it("delegates only signed charge.success events with a reference", async () => {
    const { POST } = await import("@/app/api/paystack/webhook/route");
    const data = {
      reference: "sme_growth_ref",
      status: "success",
      amount: 700000,
      currency: "NGN",
      metadata: { userId: "user_1", businessId: "biz_1", planId: "growth" },
    };
    const response = await POST(signedRequest(JSON.stringify({ event: "charge.success", data })));

    expect(response.status).toBe(200);
    expect(mocks.activate).toHaveBeenCalledWith({
      reference: "sme_growth_ref",
      eventType: "charge.success",
      payload: data,
    });
  });
});

function signedRequest(body: string) {
  const signature = createHmac("sha512", secret).update(body).digest("hex");
  return new Request("http://localhost/api/paystack/webhook", {
    method: "POST",
    headers: { "x-paystack-signature": signature },
    body,
  });
}
