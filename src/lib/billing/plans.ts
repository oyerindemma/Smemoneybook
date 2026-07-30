import { SubscriptionPlan } from "@prisma/client";

export type BillingPlanId = "starter" | "growth" | "pro";

export type BillingFeature =
  | "basic_exports"
  | "ai_category_assist"
  | "receipt_extraction"
  | "bank_reconciliation"
  | "tax_assistant"
  | "executive_dashboard"
  | "predictive_alerts"
  | "payroll"
  | "ai_marketing"
  | "ai_evaluation"
  | "team_management"
  | "audit_tools"
  | "advanced_reports"
  | "multi_location"
  | "warehouse_transfers"
  | "professional_pdf_exports"
  | "invoice_branding"
  | "tax_management"
  | "granular_permissions"
  | "business_switching";

export type BillingFeatureDetail = {
  id: BillingFeature;
  name: string;
  summary: string;
};

export type BillingPlan = {
  id: BillingPlanId;
  dbPlan: SubscriptionPlan;
  name: string;
  tagline: string;
  description: string;
  amount: number;
  amountKobo: number;
  recommendedFor: string;
  features: BillingFeature[];
};

export const billingFeatureDetails: Record<BillingFeature, BillingFeatureDetail> = {
  basic_exports: {
    id: "basic_exports",
    name: "Accountant exports",
    summary: "Download owner-friendly CSV packs for accountant review and backup.",
  },
  ai_category_assist: {
    id: "ai_category_assist",
    name: "AI category assist",
    summary: "Suggest practical income and expense categories while recording money.",
  },
  receipt_extraction: {
    id: "receipt_extraction",
    name: "Receipt extraction",
    summary: "Turn pasted receipt text into vendor, amount, and category suggestions.",
  },
  bank_reconciliation: {
    id: "bank_reconciliation",
    name: "Bank reconciliation",
    summary: "Import CSV bank statements, review matches, and export an audit-friendly reconciliation report.",
  },
  tax_assistant: {
    id: "tax_assistant",
    name: "Tax assistant",
    summary: "Review tax-readiness estimates, missing data, grounded answers, and working-paper exports.",
  },
  executive_dashboard: {
    id: "executive_dashboard",
    name: "Executive dashboard",
    summary: "Unify financial, stock, debt, tax, reconciliation, and staff summaries for owner decisions.",
  },
  predictive_alerts: {
    id: "predictive_alerts",
    name: "Predictive alerts",
    summary: "Detect deterministic risk and opportunity signals from recorded sales, debt, stock, bank, tax, and staff data.",
  },
  payroll: {
    id: "payroll",
    name: "Payroll",
    summary: "Prepare controlled payroll periods, payslips, approvals, and explicit payroll expense posting.",
  },
  ai_marketing: {
    id: "ai_marketing",
    name: "AI marketing",
    summary: "Create consent-aware customer segments, campaign drafts, approvals, and send-disabled previews.",
  },
  ai_evaluation: {
    id: "ai_evaluation",
    name: "AI evaluation",
    summary: "Run internal AI safety, grounding, regression, latency, and cost checks before rollout.",
  },
  team_management: {
    id: "team_management",
    name: "Team and accountant access",
    summary: "Invite staff and accountants with role-based access for shared operations.",
  },
  audit_tools: {
    id: "audit_tools",
    name: "Audit tools",
    summary: "Track sensitive changes, billing activity, exports, and operational actions.",
  },
  advanced_reports: {
    id: "advanced_reports",
    name: "Advanced reports",
    summary: "Use deeper summaries for cash flow, tax review, debt aging, and stock decisions.",
  },
  multi_location: {
    id: "multi_location",
    name: "Multiple locations",
    summary: "Add branches, warehouses, storage, transit, and damaged-goods locations.",
  },
  warehouse_transfers: {
    id: "warehouse_transfers",
    name: "Warehouse transfers",
    summary: "Move stock between locations with approval, receiving, and discrepancy history.",
  },
  professional_pdf_exports: {
    id: "professional_pdf_exports",
    name: "Professional PDF exports",
    summary: "Generate branded PDF documents and reports for formal sharing.",
  },
  invoice_branding: {
    id: "invoice_branding",
    name: "Invoice branding",
    summary: "Configure logo, document footer, payment instructions, and invoice terms.",
  },
  tax_management: {
    id: "tax_management",
    name: "Tax management",
    summary: "Configure lightweight tax rates and preserve document tax snapshots.",
  },
  granular_permissions: {
    id: "granular_permissions",
    name: "Granular permissions",
    summary: "Control staff access by action, feature, and business location.",
  },
  business_switching: {
    id: "business_switching",
    name: "Business switching",
    summary: "Let approved users securely switch between separate businesses.",
  },
};

export const billingPlans: BillingPlan[] = [
  {
    id: "starter",
    dbPlan: SubscriptionPlan.STARTER,
    name: "Starter",
    tagline: "Clean records and accountant handoff",
    description: "For one-owner businesses that mainly need reliable books, report exports, and a simple monthly payment.",
    amount: 3500,
    amountKobo: 350000,
    recommendedFor: "Solo traders and micro shops moving from notebooks or spreadsheets.",
    features: ["basic_exports"],
  },
  {
    id: "growth",
    dbPlan: SubscriptionPlan.GROWTH,
    name: "Growth",
    tagline: "Faster daily capture with smart assistance",
    description: "For active SMEs that want less manual typing, cleaner categories, and receipt review support.",
    amount: 7000,
    amountKobo: 700000,
    recommendedFor: "Retailers, service businesses, and stock-based SMEs recording daily activity.",
    features: ["basic_exports", "ai_category_assist", "receipt_extraction", "bank_reconciliation", "tax_assistant", "ai_marketing"],
  },
  {
    id: "pro",
    dbPlan: SubscriptionPlan.PRO,
    name: "Pro",
    tagline: "Team controls, audits, and deeper reporting",
    description: "For growing businesses where owners, staff, and accountants need controlled access and stronger oversight.",
    amount: 12000,
    amountKobo: 1200000,
    recommendedFor: "Multi-staff SMEs, accountant-managed books, and businesses preparing formal reports.",
    features: [
      "basic_exports",
      "ai_category_assist",
      "receipt_extraction",
      "bank_reconciliation",
      "tax_assistant",
      "executive_dashboard",
      "predictive_alerts",
      "payroll",
      "ai_marketing",
      "ai_evaluation",
      "team_management",
      "audit_tools",
      "advanced_reports",
      "multi_location",
      "warehouse_transfers",
      "professional_pdf_exports",
      "invoice_branding",
      "tax_management",
      "granular_permissions",
      "business_switching",
    ],
  },
];

export function getBillingPlan(planId: unknown) {
  return billingPlans.find((plan) => plan.id === planId) ?? null;
}

export function getBillingPlanByDbPlan(dbPlan: SubscriptionPlan) {
  return billingPlans.find((plan) => plan.dbPlan === dbPlan) ?? null;
}

export function hasFeatureAccess(planId: BillingPlanId | "free" | null | undefined, feature: BillingFeature) {
  const plan = getBillingPlan(planId);
  return Boolean(plan?.features.includes(feature));
}

export function getPlanFeatureDetails(plan: BillingPlan) {
  return plan.features.map((feature) => billingFeatureDetails[feature]);
}
