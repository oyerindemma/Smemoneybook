export type PayrollStatutoryRuleStatus = "draft" | "verified" | "retired";

export type PayrollStatutoryRuleConfig = {
  id: string;
  country: string;
  ruleType: "PAYE" | "pension" | "statutory_deduction" | "employer_contribution";
  effectiveFrom: string;
  effectiveTo?: string;
  thresholds: Array<Record<string, unknown>>;
  officialSource: string;
  verificationDate: string;
  status: PayrollStatutoryRuleStatus;
};

export type PayrollStatutorySetup = {
  status: "setup_required" | "configured" | "not_applicable";
  version: string;
  rules: PayrollStatutoryRuleConfig[];
  message: string;
};

export function getPayrollStatutorySetup(country = "NG"): PayrollStatutorySetup {
  const normalizedCountry = country.trim().toUpperCase() || "NG";
  const configuredRules = readConfiguredRules(normalizedCountry);

  if (configuredRules.length === 0) {
    return {
      status: normalizedCountry === "NG" ? "setup_required" : "not_applicable",
      version: "phase3i-statutory-rules-empty-v1",
      rules: [],
      message:
        "Statutory payroll setup required. Configure verified PAYE, pension, deduction, and employer contribution rules before statutory amounts are calculated.",
    };
  }

  return {
    status: "configured",
    version: `phase3i-statutory-rules-${normalizedCountry.toLowerCase()}-configured-v1`,
    rules: configuredRules,
    message:
      "Verified statutory payroll sources are configured for this Preview environment. Phase 3I applies reviewed statutory inputs and preserves the source metadata for approval.",
  };
}

function readConfiguredRules(country: string): PayrollStatutoryRuleConfig[] {
  const raw = process.env.PHASE3_PAYROLL_STATUTORY_RULES_JSON;

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as PayrollStatutoryRuleConfig[];

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((rule) => isVerifiedRuleForCountry(rule, country));
  } catch {
    return [];
  }
}

function isVerifiedRuleForCountry(rule: PayrollStatutoryRuleConfig, country: string) {
  return (
    rule.country?.toUpperCase() === country &&
    rule.status === "verified" &&
    Boolean(rule.effectiveFrom) &&
    Boolean(rule.officialSource) &&
    Boolean(rule.verificationDate)
  );
}
