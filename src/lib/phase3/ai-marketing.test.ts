import { describe, expect, it } from "vitest";
import {
  assertMarketingDraftCanBeApproved,
  generateMarketingDraft,
} from "@/lib/phase3/ai-marketing";

describe("Phase 3M AI marketing assistant", () => {
  it("creates draft-only content that requires review", () => {
    const draft = generateMarketingDraft({
      businessName: "Ada Stores",
      channel: "whatsapp",
      goal: "announce weekend stock",
      audience: "regular customers",
      tone: "friendly",
      offer: "Visit today for fresh arrivals.",
    });

    expect(draft.status).toBe("DRAFT");
    expect(draft.requiresReview).toBe(true);
    expect(draft.modelVersion).toBe("marketing-draft-template-v1");
    expect(draft.content).toContain("Please review before sending");
  });

  it("uses product price and stock only when product permission is granted", () => {
    const withoutPermission = generateMarketingDraft({
      businessName: "Ada Stores",
      channel: "instagram",
      goal: "promote rice",
      audience: "families",
      tone: "clear",
      product: {
        id: "item_1",
        name: "Rice",
        sellingPrice: 12000,
        quantityOnHand: 5,
        permissionGranted: false,
      },
    });
    const withPermission = generateMarketingDraft({
      businessName: "Ada Stores",
      channel: "instagram",
      goal: "promote rice",
      audience: "families",
      tone: "clear",
      product: {
        id: "item_1",
        name: "Rice",
        sellingPrice: 12000,
        quantityOnHand: 5,
        permissionGranted: true,
      },
    });

    expect(withoutPermission.content).not.toContain("12,000");
    expect(withoutPermission.sourceInputs.productDataUsed).toBe(false);
    expect(withPermission.content).toContain("Rice");
    expect(withPermission.content).toContain("12,000");
    expect(withPermission.sourceInputs.productDataUsed).toBe(true);
  });

  it("requires explicit review before approval", () => {
    expect(() =>
      assertMarketingDraftCanBeApproved({
        reviewConfirmed: false,
        safetyWarnings: [],
      }),
    ).toThrow("require user review");
  });

  it("blocks approval when critical warnings exist", () => {
    const draft = generateMarketingDraft({
      businessName: "Ada Stores",
      channel: "facebook",
      goal: "guaranteed free money promo",
      audience: "new customers",
      tone: "bold",
    });

    expect(draft.safetyWarnings.some((warning) => warning.severity === "critical")).toBe(true);
    expect(() =>
      assertMarketingDraftCanBeApproved({
        reviewConfirmed: true,
        safetyWarnings: draft.safetyWarnings,
      }),
    ).toThrow("critical marketing safety warnings");
  });
});
