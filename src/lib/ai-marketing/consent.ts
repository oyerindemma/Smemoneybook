export const aiMarketingConsentStatuses = [
  "unknown",
  "consented",
  "opted_out",
  "transactional_only",
] as const;

export const aiMarketingChannels = ["whatsapp", "sms", "email", "phone"] as const;

export type AiMarketingConsentStatus = (typeof aiMarketingConsentStatuses)[number];
export type AiMarketingChannel = (typeof aiMarketingChannels)[number];

export type MarketingConsentInput = {
  consentStatus?: string | null;
  optOutAt?: Date | string | null;
  doNotContact?: boolean | null;
  preferredChannel?: string | null;
  phone?: string | null;
};

export type MarketingEligibility = {
  consentStatus: AiMarketingConsentStatus;
  eligibilityStatus: "eligible" | "excluded";
  exclusionReason?: string;
};

const sensitiveTargetingPatterns = [
  /\breligion\b/i,
  /\bmuslim(s)?\b/i,
  /\bchristian(s)?\b/i,
  /\bethnic(ity)?\b/i,
  /\btribe\b/i,
  /\byoruba\b/i,
  /\bigbo\b/i,
  /\bhausa\b/i,
  /\bhealth\b/i,
  /\bmedical\b/i,
  /\bpregnan(t|cy)\b/i,
  /\bpolitic(al|s)?\b/i,
  /\bparty supporter(s)?\b/i,
  /\binferred income\b/i,
  /\brich customers\b/i,
  /\bpoor customers\b/i,
  /\bgender\b/i,
  /\bmen only\b/i,
  /\bwomen only\b/i,
];

export function normalizeMarketingConsentStatus(value?: string | null): AiMarketingConsentStatus {
  const normalized = value?.trim().toLowerCase();

  return aiMarketingConsentStatuses.includes(normalized as AiMarketingConsentStatus)
    ? normalized as AiMarketingConsentStatus
    : "unknown";
}

export function normalizeMarketingChannel(value?: string | null): AiMarketingChannel {
  const normalized = value?.trim().toLowerCase();

  return aiMarketingChannels.includes(normalized as AiMarketingChannel)
    ? normalized as AiMarketingChannel
    : "whatsapp";
}

export function getMarketingEligibility({
  consentStatus,
  optOutAt,
  doNotContact,
  preferredChannel,
  phone,
}: MarketingConsentInput): MarketingEligibility {
  const normalizedConsent = normalizeMarketingConsentStatus(consentStatus);
  const channel = normalizeMarketingChannel(preferredChannel);

  if (doNotContact) {
    return {
      consentStatus: normalizedConsent,
      eligibilityStatus: "excluded",
      exclusionReason: "do_not_contact",
    };
  }

  if (normalizedConsent === "opted_out" || optOutAt) {
    return {
      consentStatus: "opted_out",
      eligibilityStatus: "excluded",
      exclusionReason: "opted_out",
    };
  }

  if (normalizedConsent === "transactional_only") {
    return {
      consentStatus: normalizedConsent,
      eligibilityStatus: "excluded",
      exclusionReason: "transactional_only",
    };
  }

  if (normalizedConsent !== "consented") {
    return {
      consentStatus: normalizedConsent,
      eligibilityStatus: "excluded",
      exclusionReason: "consent_unknown",
    };
  }

  if ((channel === "whatsapp" || channel === "sms" || channel === "phone") && !phone?.trim()) {
    return {
      consentStatus: normalizedConsent,
      eligibilityStatus: "excluded",
      exclusionReason: "missing_contact",
    };
  }

  return {
    consentStatus: normalizedConsent,
    eligibilityStatus: "eligible",
  };
}

export function assertNoSensitiveMarketingTargeting(value: string) {
  if (containsSensitiveMarketingTargeting(value)) {
    throw new Error("AI Marketing cannot target protected or sensitive customer characteristics.");
  }
}

export function containsSensitiveMarketingTargeting(value: string) {
  return sensitiveTargetingPatterns.some((pattern) => pattern.test(value));
}

export function maskMarketingContact(value?: string | null) {
  const digits = value?.replace(/\D/g, "") ?? "";

  if (digits.length < 4) {
    return value ? "hidden" : "";
  }

  return `...${digits.slice(-4)}`;
}
