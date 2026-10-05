export const whatsappAutomationPolicyVersion = "whatsapp-automation-policy-v1";

export type WhatsAppAutomationContactInput = {
  phone: string;
  consentStatus: "PENDING" | "OPTED_IN" | "OPTED_OUT" | string;
  optedOutAt?: Date | string | null;
};

export type WhatsAppAutomationTemplateInput = {
  templateName: string;
  languageCode?: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "PAUSED" | string;
};

export type WhatsAppAutomationPreferenceInput = {
  whatsappAutomationEnabled?: boolean;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
};

export type WhatsAppAutomationJobInput = {
  status: string;
  automationType: string;
  costKobo?: number;
  retryCount?: number;
};

export type WhatsAppAutomationDecision = {
  policyVersion: string;
  allowed: boolean;
  status: "QUEUED" | "SKIPPED";
  reason?: string;
  quietHoursSkipped: boolean;
  optOutCheckedAt: string;
};

export function evaluateWhatsAppAutomationQueue({
  contact,
  template,
  preferences,
  now = new Date(),
}: {
  contact: WhatsAppAutomationContactInput | null;
  template?: WhatsAppAutomationTemplateInput | null;
  preferences?: WhatsAppAutomationPreferenceInput | null;
  now?: Date;
}): WhatsAppAutomationDecision {
  const base = {
    policyVersion: whatsappAutomationPolicyVersion,
    quietHoursSkipped: false,
    optOutCheckedAt: now.toISOString(),
  };

  if (!preferences?.whatsappAutomationEnabled) {
    return {
      ...base,
      allowed: false,
      status: "SKIPPED",
      reason: "WhatsApp automation is disabled for this business.",
    };
  }

  if (!contact || contact.consentStatus !== "OPTED_IN") {
    return {
      ...base,
      allowed: false,
      status: "SKIPPED",
      reason: "Recipient has not opted in to WhatsApp automation.",
    };
  }

  if (contact.optedOutAt) {
    return {
      ...base,
      allowed: false,
      status: "SKIPPED",
      reason: "Recipient opted out of WhatsApp automation.",
    };
  }

  if (template && template.status !== "APPROVED") {
    return {
      ...base,
      allowed: false,
      status: "SKIPPED",
      reason: "WhatsApp template is not approved.",
    };
  }

  if (isWithinQuietHours(now, preferences.quietHoursStart, preferences.quietHoursEnd)) {
    return {
      ...base,
      allowed: false,
      status: "SKIPPED",
      quietHoursSkipped: true,
      reason: "Current time is inside configured quiet hours.",
    };
  }

  return {
    ...base,
    allowed: true,
    status: "QUEUED",
  };
}

export function isWithinQuietHours(now: Date, quietHoursStart?: string | null, quietHoursEnd?: string | null) {
  const start = minutesFromTime(quietHoursStart);
  const end = minutesFromTime(quietHoursEnd);

  if (start === null || end === null || start === end) {
    return false;
  }

  const current = now.getHours() * 60 + now.getMinutes();

  if (start < end) {
    return current >= start && current < end;
  }

  return current >= start || current < end;
}

export function nextWhatsAppRetryAt({
  retryCount,
  now = new Date(),
}: {
  retryCount: number;
  now?: Date;
}) {
  const safeRetryCount = Math.max(0, retryCount);
  const minutes = Math.min(24 * 60, 5 * 2 ** safeRetryCount);
  return new Date(now.getTime() + minutes * 60_000);
}

export function summarizeWhatsAppAutomationHealth(jobs: WhatsAppAutomationJobInput[]) {
  const total = jobs.length;
  const sent = jobs.filter((job) => job.status === "SENT").length;
  const failed = jobs.filter((job) => job.status === "FAILED").length;
  const skipped = jobs.filter((job) => job.status === "SKIPPED").length;
  const queued = jobs.filter((job) => job.status === "QUEUED").length;
  const costKobo = jobs.reduce((totalCost, job) => totalCost + Math.max(0, job.costKobo ?? 0), 0);

  return {
    total,
    sent,
    failed,
    skipped,
    queued,
    failureRate: total > 0 ? roundMetric((failed / total) * 100) : 0,
    totalCostKobo: costKobo,
  };
}

export function buildWhatsAppManualFallbackLink(phone: string, message: string) {
  return `https://web.whatsapp.com/send?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(message)}`;
}

function minutesFromTime(value?: string | null) {
  if (!value) {
    return null;
  }

  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);

  if (!match) {
    return null;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

function roundMetric(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
