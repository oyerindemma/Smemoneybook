export type Phase3NavigationModule =
  | "bankReconciliation"
  | "loanReadiness"
  | "taxAssistant"
  | "cooperativeGroups"
  | "payroll"
  | "staffPerformance"
  | "aiMarketing"
  | "executiveDashboard"
  | "predictiveAlerts"
  | "aiEvaluation"
  | "aiAdvisor"
  | "whatsappAutomation";

type Phase3Readiness = "gated-implemented" | "partial" | "external-setup";

const moduleReadiness: Record<Phase3NavigationModule, Phase3Readiness> = {
  bankReconciliation: "gated-implemented",
  loanReadiness: "gated-implemented",
  taxAssistant: "gated-implemented",
  cooperativeGroups: "gated-implemented",
  payroll: "gated-implemented",
  staffPerformance: "gated-implemented",
  aiMarketing: "gated-implemented",
  executiveDashboard: "gated-implemented",
  predictiveAlerts: "gated-implemented",
  aiEvaluation: "gated-implemented",
  aiAdvisor: "gated-implemented",
  whatsappAutomation: "external-setup",
};

export function getPhase3NavigationStatus(
  module: Phase3NavigationModule,
  enabled: boolean,
) {
  const readiness = moduleReadiness[module];

  if (!enabled) {
    if (readiness === "partial") {
      return "Coming soon";
    }

    if (readiness === "external-setup") {
      return "Setup required";
    }

    return "Unavailable";
  }

  if (readiness === "gated-implemented") {
    return "Preview — operational";
  }

  return "Preview — limited";
}
