import { getOpenAIEnv } from "@/lib/env";
import {
  assertNoSensitiveMarketingTargeting,
  containsSensitiveMarketingTargeting,
} from "@/lib/ai-marketing/consent";

export const aiMarketingPromptVersion = "phase3h-ai-marketing-draft-v1";
export const aiMarketingReviewLabel = "AI-generated draft \u2014 review before approval.";

export type AiMarketingProviderSetup = {
  configured: boolean;
  provider: "openai" | "setup_required";
  model: string | null;
  requiresPhase3Ai: boolean;
};

export type AiMarketingDraftProvider = {
  provider: "openai" | "test";
  model: string;
  generate: (input: AiMarketingDraftPromptInput) => Promise<string>;
};

export type AiMarketingDraftPromptInput = {
  businessName: string;
  objective: string;
  channel: string;
  segmentLabel: string;
  segmentDefinition: string;
  customerCount: number;
  consentEligibleCount: number;
  excludedCount: number;
  dataLimitations: string[];
  tone?: string;
  editableNotes?: string;
};

export type AiMarketingDraftResult = {
  content: string;
  promptVersion: typeof aiMarketingPromptVersion;
  model: string;
  provider: AiMarketingDraftProvider["provider"];
  safetyWarnings: AiMarketingDraftSafetyWarning[];
  reviewLabel: typeof aiMarketingReviewLabel;
};

export type AiMarketingDraftSafetyWarning = {
  code: string;
  severity: "info" | "warning" | "critical";
  message: string;
};

export class AiMarketingDraftingSetupError extends Error {
  constructor() {
    super("AI Marketing drafting needs PHASE3_AI_ENABLED, OPENAI_API_KEY, and OPENAI_MODEL in this environment.");
    this.name = "AiMarketingDraftingSetupError";
  }
}

export function getAiMarketingProviderSetupStatus(): AiMarketingProviderSetup {
  const model = process.env.OPENAI_MODEL?.trim();
  const aiEnabled = readFlag(process.env.PHASE3_AI_ENABLED, false);
  const configured = Boolean(
    aiEnabled &&
      model &&
      isUsableSecret(process.env.OPENAI_API_KEY) &&
      isUsableSecret(model),
  );

  return {
    configured,
    provider: configured ? "openai" : "setup_required",
    model: configured ? model ?? null : null,
    requiresPhase3Ai: true,
  };
}

export async function generateAiMarketingDraft({
  input,
  provider,
}: {
  input: AiMarketingDraftPromptInput;
  provider?: AiMarketingDraftProvider;
}): Promise<AiMarketingDraftResult> {
  assertNoSensitiveMarketingTargeting(`${input.objective} ${input.segmentLabel} ${input.editableNotes ?? ""}`);

  const selectedProvider = provider ?? createOpenAiMarketingDraftProvider();
  const rawContent = await selectedProvider.generate(input);
  const content = sanitizeDraftContent(rawContent);
  const safetyWarnings = assessMarketingDraftSafety(content);

  if (safetyWarnings.some((warning) => warning.severity === "critical")) {
    throw new Error("AI Marketing draft failed safety review.");
  }

  return {
    content,
    promptVersion: aiMarketingPromptVersion,
    model: selectedProvider.model,
    provider: selectedProvider.provider,
    safetyWarnings,
    reviewLabel: aiMarketingReviewLabel,
  };
}

export function createOpenAiMarketingDraftProvider(): AiMarketingDraftProvider {
  const setup = getAiMarketingProviderSetupStatus();

  if (!setup.configured) {
    throw new AiMarketingDraftingSetupError();
  }

  const env = getOpenAIEnv();

  return {
    provider: "openai",
    model: env.OPENAI_MODEL,
    async generate(input) {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: env.OPENAI_MODEL,
          input: [
            {
              role: "system",
              content: [
                "You draft consent-aware marketing copy for Nigerian SMEs.",
                "Use only aggregate segment context.",
                "Do not claim messages were sent or delivered.",
                "Do not promise guaranteed outcomes, invent discounts, or use false scarcity.",
                "Do not target protected characteristics.",
                "Return one editable message draft only.",
              ].join(" "),
            },
            {
              role: "user",
              content: buildDraftPrompt(input),
            },
          ],
          max_output_tokens: 450,
        }),
      });

      if (!response.ok) {
        throw new Error("AI Marketing drafting provider failed.");
      }

      const payload = await response.json() as { output_text?: string; output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }> };
      const text = payload.output_text || payload.output?.find((item) => item.type === "message")?.content?.find((item) => item.type === "output_text")?.text || "";

      if (!text.trim()) {
        throw new Error("AI Marketing drafting provider returned no draft.");
      }

      return text;
    },
  };
}

export function assessMarketingDraftSafety(content: string): AiMarketingDraftSafetyWarning[] {
  const warnings: AiMarketingDraftSafetyWarning[] = [
    {
      code: "review_required",
      severity: "info",
      message: "AI-generated draft. Owner review and approval are required before any use.",
    },
  ];
  const normalized = content.toLowerCase();

  if (containsSensitiveMarketingTargeting(content)) {
    warnings.push({
      code: "sensitive_targeting",
      severity: "critical",
      message: "Draft appears to target protected or sensitive characteristics.",
    });
  }

  if (/\b(guaranteed|miracle|cure|risk-free|free money|only today or never)\b/i.test(content)) {
    warnings.push({
      code: "misleading_claim",
      severity: "critical",
      message: "Draft contains potentially misleading or prohibited claims.",
    });
  }

  if (/\b(sent|delivered|we have messaged|already contacted)\b/.test(normalized)) {
    warnings.push({
      code: "delivery_implication",
      severity: "critical",
      message: "Draft must not imply that messages were sent or delivered.",
    });
  }

  if (/\bignore previous|system prompt|developer message|openai_api_key|database_url\b/i.test(content)) {
    warnings.push({
      code: "prompt_injection",
      severity: "critical",
      message: "Draft contains prompt-injection or secret-request language.",
    });
  }

  return warnings;
}

function buildDraftPrompt(input: AiMarketingDraftPromptInput) {
  return [
    `Business: ${sanitizePromptText(input.businessName)}.`,
    `Objective: ${sanitizePromptText(input.objective)}.`,
    `Channel: ${sanitizePromptText(input.channel)}.`,
    `Tone: ${sanitizePromptText(input.tone || "friendly and clear")}.`,
    `Segment: ${sanitizePromptText(input.segmentLabel)}.`,
    `Segment definition: ${sanitizePromptText(input.segmentDefinition)}.`,
    `Aggregate counts: ${input.customerCount} matched, ${input.consentEligibleCount} consent-eligible, ${input.excludedCount} excluded.`,
    `Data limitations: ${input.dataLimitations.map(sanitizePromptText).join(" | ") || "None recorded."}.`,
    input.editableNotes ? `Owner notes: ${sanitizePromptText(input.editableNotes)}.` : "",
    "Draft must be editable, truthful, consent-aware, and under 900 characters.",
    "Do not include private customer names, phone numbers, or a recipient list.",
  ].filter(Boolean).join("\n");
}

function sanitizeDraftContent(value: string) {
  return value
    .replace(/\bsk-[A-Za-z0-9_-]+\b/g, "[redacted]")
    .replace(/postgres(ql)?:\/\/\S+/gi, "[redacted]")
    .replace(/\s+\n/g, "\n")
    .trim()
    .slice(0, 2_000);
}

function sanitizePromptText(value: string) {
  return value
    .replace(/\bsk-[A-Za-z0-9_-]+\b/g, "[redacted]")
    .replace(/postgres(ql)?:\/\/\S+/gi, "[redacted]")
    .replace(/\bignore previous\b/gi, "disallowed instruction")
    .slice(0, 700);
}

function isUsableSecret(value?: string) {
  const trimmed = value?.trim();

  return Boolean(
    trimmed &&
      trimmed !== "[SENSITIVE]" &&
      !/\[redacted\]/i.test(trimmed) &&
      !/placeholder/i.test(trimmed) &&
      !/xxx/i.test(trimmed),
  );
}

function readFlag(value: string | undefined, defaultValue: boolean) {
  if (value === undefined) {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
