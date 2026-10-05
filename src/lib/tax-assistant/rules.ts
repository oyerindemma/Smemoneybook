import type { TaxRule, TaxRuleSet } from "@prisma/client";
import { taxAssistantRuleSetVersion } from "@/lib/tax-assistant/definitions";

export const defaultTaxRuleSetId = "tax_ruleset_ng_federal_2026_preview_v1";
export const defaultTaxJurisdiction = "NG-FED";

export type VerifiedTaxRuleSet = TaxRuleSet & {
  rules: TaxRule[];
};

export function isRuleSetVerified(ruleSet?: { status: string; lastVerifiedAt?: Date | null } | null) {
  return Boolean(ruleSet && ruleSet.status === "verified" && ruleSet.lastVerifiedAt);
}

export function getDefaultRuleSource() {
  return {
    ruleSetVersion: taxAssistantRuleSetVersion,
    ruleSetStatus: "verified",
    jurisdiction: defaultTaxJurisdiction,
    sourceTitle: "Nigeria Tax Act 2025 and Nigeria Revenue Service guidance",
    sourceAuthority: "Nigeria Revenue Service",
    sourceReference: "https://www.nrs.gov.ng/uploads/NIGERIA_TAX_ACT_2025_ef6bb812a5.pdf",
    lastVerifiedAt: "2026-07-23T00:00:00.000Z",
    verificationOwner: "SME MoneyBook engineering",
  };
}

export function maskTaxIdentificationNumber(value?: string | null) {
  const normalized = (value ?? "").replace(/\s+/g, "");

  if (!normalized) {
    return undefined;
  }

  if (normalized.length <= 4) {
    return "*".repeat(normalized.length);
  }

  return `${"*".repeat(Math.max(0, normalized.length - 4))}${normalized.slice(-4)}`;
}

export function isTaxAssistantProviderConfigured() {
  return Boolean(
    process.env.OPENAI_API_KEY &&
      process.env.OPENAI_API_KEY !== "[SENSITIVE]" &&
      process.env.OPENAI_MODEL &&
      process.env.OPENAI_MODEL !== "[SENSITIVE]",
  );
}

export function readFlag(value: string | undefined, defaultValue = false) {
  if (value === undefined) {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
