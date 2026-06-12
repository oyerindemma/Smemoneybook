import { SubscriptionPlan } from "@prisma/client";

export type BillingPlanId = "starter" | "growth" | "pro";

export type BillingFeature =
  | "basic_exports"
  | "ai_category_assist"
  | "receipt_extraction"
  | "team_management"
  | "audit_tools"
  | "advanced_reports";

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
    features: ["basic_exports", "ai_category_assist", "receipt_extraction"],
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
      "team_management",
      "audit_tools",
      "advanced_reports",
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
