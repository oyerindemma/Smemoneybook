export type Phase3Feature =
  | "aiAdvisor"
  | "healthScore"
  | "executiveDashboard"
  | "cashflowForecasts"
  | "inventoryForecasting"
  | "predictiveAlerts"
  | "bankReconciliation"
  | "taxAssistant"
  | "loanReadiness"
  | "cooperativeGroups"
  | "payroll"
  | "staffPerformance"
  | "whatsappAutomation"
  | "aiMarketing"
  | "aiEvaluation"
  | "adminAiOperations";

export type Phase3FeatureFlagState = Record<Phase3Feature, boolean>;

const rawPhase3FeatureFlags: Phase3FeatureFlagState = {
  aiAdvisor: readFlag(process.env.NEXT_PUBLIC_PHASE3_AI_ADVISOR_ENABLED, false),
  healthScore: readFlag(process.env.NEXT_PUBLIC_PHASE3_HEALTH_SCORE_ENABLED, false),
  executiveDashboard: readFlag(process.env.NEXT_PUBLIC_PHASE3_EXECUTIVE_DASHBOARD_ENABLED, false),
  cashflowForecasts: readFlag(process.env.NEXT_PUBLIC_PHASE3_CASHFLOW_FORECASTS_ENABLED, false),
  inventoryForecasting: readFlag(process.env.NEXT_PUBLIC_PHASE3_INVENTORY_FORECASTING_ENABLED, false),
  predictiveAlerts: readFlag(process.env.NEXT_PUBLIC_PHASE3_PREDICTIVE_ALERTS_ENABLED, false),
  bankReconciliation: readFlag(process.env.NEXT_PUBLIC_PHASE3_BANK_RECONCILIATION_ENABLED, false),
  taxAssistant: readFlag(process.env.NEXT_PUBLIC_PHASE3_TAX_ASSISTANT_ENABLED, false),
  loanReadiness: readFlag(process.env.NEXT_PUBLIC_PHASE3_LOAN_READINESS_ENABLED, false),
  cooperativeGroups: readFlag(process.env.NEXT_PUBLIC_PHASE3_COOPERATIVES_ENABLED, false),
  payroll: readFlag(process.env.NEXT_PUBLIC_PHASE3_PAYROLL_ENABLED, false),
  staffPerformance: readFlag(process.env.NEXT_PUBLIC_PHASE3_STAFF_PERFORMANCE_ENABLED, false),
  whatsappAutomation: readFlag(process.env.NEXT_PUBLIC_PHASE3_WHATSAPP_AUTOMATION_ENABLED, false),
  aiMarketing: readFlag(process.env.NEXT_PUBLIC_PHASE3_AI_MARKETING_ENABLED, false),
  aiEvaluation: readFlag(process.env.NEXT_PUBLIC_PHASE3_AI_EVALUATION_ENABLED, false),
  adminAiOperations: readFlag(process.env.NEXT_PUBLIC_PHASE3_ADMIN_AI_OPS_ENABLED, false),
};

export const phase3OperationalControls = {
  aiEnabled: readFlag(process.env.PHASE3_AI_ENABLED, false),
  globalKillSwitch: readFlag(process.env.PHASE3_AI_GLOBAL_KILL_SWITCH, false),
  monthlyCostBudgetKobo: readPositiveInteger(process.env.PHASE3_AI_MONTHLY_COST_BUDGET_KOBO, 0),
  dailyRequestLimitPerBusiness: readPositiveInteger(
    process.env.PHASE3_AI_DAILY_REQUEST_LIMIT_PER_BUSINESS,
    0,
  ),
};

export const phase3FeatureFlags: Phase3FeatureFlagState = phase3OperationalControls.globalKillSwitch
  ? disableAllPhase3Features()
  : rawPhase3FeatureFlags;

export function isPhase3FeatureEnabled(feature: Phase3Feature) {
  return phase3FeatureFlags[feature];
}

export function requirePhase3Feature(feature: Phase3Feature, label: string) {
  if (isPhase3FeatureEnabled(feature)) {
    return null;
  }

  const status = phase3OperationalControls.globalKillSwitch ? 503 : 404;
  const reason = phase3OperationalControls.globalKillSwitch
    ? "Phase 3 AI capabilities are temporarily paused."
    : `${label} is not available right now.`;

  return Response.json({ error: reason }, { status });
}

function disableAllPhase3Features(): Phase3FeatureFlagState {
  return Object.fromEntries(
    Object.keys(rawPhase3FeatureFlags).map((feature) => [feature, false]),
  ) as Phase3FeatureFlagState;
}

function readFlag(value: string | undefined, defaultValue: boolean) {
  if (value === undefined) {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function readPositiveInteger(value: string | undefined, defaultValue: number) {
  if (value === undefined || value.trim() === "") {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}
