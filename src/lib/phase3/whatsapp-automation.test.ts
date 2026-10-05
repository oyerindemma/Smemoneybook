import { describe, expect, it } from "vitest";
import {
  buildWhatsAppManualFallbackLink,
  evaluateWhatsAppAutomationQueue,
  isWithinQuietHours,
  nextWhatsAppRetryAt,
  summarizeWhatsAppAutomationHealth,
} from "@/lib/phase3/whatsapp-automation";

describe("Phase 3L WhatsApp automation policy", () => {
  it("blocks recipients without explicit opt-in", () => {
    const decision = evaluateWhatsAppAutomationQueue({
      contact: { phone: "2348012345678", consentStatus: "PENDING" },
      preferences: { whatsappAutomationEnabled: true },
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("not opted in");
  });

  it("blocks non-approved Meta templates", () => {
    const decision = evaluateWhatsAppAutomationQueue({
      contact: { phone: "2348012345678", consentStatus: "OPTED_IN" },
      template: { templateName: "promo", status: "REJECTED" },
      preferences: { whatsappAutomationEnabled: true },
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("not approved");
  });

  it("honors quiet hours across midnight", () => {
    expect(isWithinQuietHours(new Date(2026, 6, 19, 23, 30), "22:00", "06:00")).toBe(true);
    expect(isWithinQuietHours(new Date(2026, 6, 19, 12, 30), "22:00", "06:00")).toBe(false);
  });

  it("queues only when automation, consent, template, and quiet hours allow it", () => {
    const decision = evaluateWhatsAppAutomationQueue({
      now: new Date(2026, 6, 19, 12, 0),
      contact: { phone: "2348012345678", consentStatus: "OPTED_IN" },
      template: { templateName: "payment_confirmation", status: "APPROVED" },
      preferences: {
        whatsappAutomationEnabled: true,
        quietHoursStart: "22:00",
        quietHoursEnd: "06:00",
      },
    });

    expect(decision).toMatchObject({
      allowed: true,
      status: "QUEUED",
      policyVersion: "whatsapp-automation-policy-v1",
    });
  });

  it("calculates bounded retry times and automation health", () => {
    const now = new Date("2026-07-19T12:00:00.000Z");
    const retry = nextWhatsAppRetryAt({ retryCount: 2, now });
    const health = summarizeWhatsAppAutomationHealth([
      { status: "SENT", automationType: "receipt", costKobo: 200 },
      { status: "FAILED", automationType: "receipt", costKobo: 0 },
      { status: "SKIPPED", automationType: "promo", costKobo: 0 },
    ]);

    expect(retry.toISOString()).toBe("2026-07-19T12:20:00.000Z");
    expect(health).toMatchObject({
      total: 3,
      sent: 1,
      failed: 1,
      skipped: 1,
      failureRate: 33.33,
      totalCostKobo: 200,
    });
  });

  it("builds a manual WhatsApp fallback link", () => {
    expect(buildWhatsAppManualFallbackLink("2348012345678", "Hello there")).toContain("text=Hello%20there");
  });
});
