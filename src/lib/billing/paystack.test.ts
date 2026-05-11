import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { billingFeatureDetails, billingPlans, getPlanFeatureDetails, hasFeatureAccess } from "@/lib/billing/plans";
import { verifyPaystackSignature } from "@/lib/billing/paystack";

describe("Paystack billing", () => {
  it("defines the expected Nigerian billing plans in kobo", () => {
    expect(billingPlans.map((plan) => [plan.id, plan.amountKobo])).toEqual([
      ["starter", 300000],
      ["growth", 600000],
      ["pro", 1000000],
    ]);
  });

  it("gates premium features by plan", () => {
    expect(hasFeatureAccess("starter", "basic_exports")).toBe(true);
    expect(hasFeatureAccess("starter", "receipt_extraction")).toBe(false);
    expect(hasFeatureAccess("growth", "receipt_extraction")).toBe(true);
    expect(hasFeatureAccess("pro", "team_management")).toBe(true);
  });

  it("maps every paid feature to owner-facing plan copy", () => {
    const featureIds = Object.keys(billingFeatureDetails).sort();

    expect(featureIds).toEqual([
      "advanced_reports",
      "ai_category_assist",
      "audit_tools",
      "basic_exports",
      "receipt_extraction",
      "team_management",
    ]);
    expect(getPlanFeatureDetails(billingPlans[1]).map((feature) => feature.name)).toEqual([
      "Accountant exports",
      "AI category assist",
      "Receipt extraction",
    ]);
  });

  it("verifies signed Paystack webhook payloads", () => {
    const body = JSON.stringify({ event: "charge.success", data: { reference: "ref_123" } });
    const secret = "sk_test_secret";
    const signature = createHmac("sha512", secret).update(body).digest("hex");

    expect(verifyPaystackSignature(body, signature, secret)).toBe(true);
    expect(verifyPaystackSignature(body, signature, "wrong_secret")).toBe(false);
  });
});
