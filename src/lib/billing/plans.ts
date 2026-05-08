import { SubscriptionPlan } from "@prisma/client";

export type BillingPlanId = "starter" | "growth" | "pro";

export type BillingFeature =
  | "basic_exports"
  | "ai_category_assist"
  | "receipt_extraction"
  | "team_management"
  | "audit_tools"
  | "advanced_reports";

export type BillingPlan = {
  id: BillingPlanId;
  dbPlan: SubscriptionPlan;
  name: string;
  amount: number;
  amountKobo: number;
  features: BillingFeature[];
};

export const billingPlans: BillingPlan[] = [
  {
    id: "starter",
    dbPlan: SubscriptionPlan.STARTER,
    name: "Starter",
    amount: 3000,
    amountKobo: 300000,
    features: ["basic_exports"],
  },
  {
    id: "growth",
    dbPlan: SubscriptionPlan.GROWTH,
    name: "Growth",
    amount: 6000,
    amountKobo: 600000,
    features: ["basic_exports", "ai_category_assist", "receipt_extraction"],
  },
  {
    id: "pro",
    dbPlan: SubscriptionPlan.PRO,
    name: "Pro",
    amount: 10000,
    amountKobo: 1000000,
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
