import { describe, expect, it } from "vitest";
import {
  assertNoSensitiveMarketingTargeting,
  containsSensitiveMarketingTargeting,
  getMarketingEligibility,
  maskMarketingContact,
  normalizeMarketingChannel,
  normalizeMarketingConsentStatus,
} from "@/lib/ai-marketing/consent";

describe("AI Marketing consent rules", () => {
  it("defaults existing customers to unknown consent and excludes them from marketing recipients", () => {
    const eligibility = getMarketingEligibility({
      consentStatus: undefined,
      preferredChannel: "whatsapp",
      phone: "+2348012345000",
    });

    expect(eligibility).toMatchObject({
      consentStatus: "unknown",
      eligibilityStatus: "excluded",
      exclusionReason: "consent_unknown",
    });
  });

  it("allows only explicitly consented customers with usable contact details", () => {
    expect(getMarketingEligibility({
      consentStatus: "consented",
      preferredChannel: "whatsapp",
      phone: "+2348012345000",
    })).toMatchObject({ eligibilityStatus: "eligible" });

    expect(getMarketingEligibility({
      consentStatus: "consented",
      preferredChannel: "sms",
      phone: "",
    })).toMatchObject({ eligibilityStatus: "excluded", exclusionReason: "missing_contact" });
  });

  it("excludes opted-out, transactional-only, and do-not-contact customers", () => {
    expect(getMarketingEligibility({
      consentStatus: "opted_out",
      preferredChannel: "whatsapp",
      phone: "+2348012345000",
    })).toMatchObject({ eligibilityStatus: "excluded", exclusionReason: "opted_out" });

    expect(getMarketingEligibility({
      consentStatus: "transactional_only",
      preferredChannel: "whatsapp",
      phone: "+2348012345000",
    })).toMatchObject({ eligibilityStatus: "excluded", exclusionReason: "transactional_only" });

    expect(getMarketingEligibility({
      consentStatus: "consented",
      preferredChannel: "whatsapp",
      phone: "+2348012345000",
      doNotContact: true,
    })).toMatchObject({ eligibilityStatus: "excluded", exclusionReason: "do_not_contact" });
  });

  it("normalizes consent status, channels, and masked contact output", () => {
    expect(normalizeMarketingConsentStatus("CONSENTED")).toBe("consented");
    expect(normalizeMarketingConsentStatus("made_up")).toBe("unknown");
    expect(normalizeMarketingChannel("email")).toBe("email");
    expect(normalizeMarketingChannel("telegram")).toBe("whatsapp");
    expect(maskMarketingContact("+2348012345000")).toBe("...5000");
  });

  it("blocks protected or sensitive marketing targeting", () => {
    expect(containsSensitiveMarketingTargeting("target customers by religion")).toBe(true);
    expect(() => assertNoSensitiveMarketingTargeting("Send only to rich customers")).toThrow(
      "protected or sensitive",
    );
  });
});
