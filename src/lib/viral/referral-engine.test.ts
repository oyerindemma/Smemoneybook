import { describe, expect, it } from "vitest";
import { buildReferralShareText, getReferralCode, getReferralLink } from "@/lib/viral/referral-engine";

describe("referral engine", () => {
  it("builds a readable referral code and link", () => {
    const code = getReferralCode({ businessId: "biz_1234abcd", businessName: "Ada Store" });
    const link = getReferralLink({
      origin: "https://example.com",
      businessId: "biz_1234abcd",
      businessName: "Ada Store",
    });

    expect(code).toBe("ADASTOREABCD");
    expect(link).toBe("https://example.com/?ref=ADASTOREABCD");
  });

  it("builds WhatsApp-friendly referral text", () => {
    const text = buildReferralShareText({
      businessName: "Ada Store",
      referralLink: "https://example.com/?ref=ADA",
    });

    expect(text).toContain("SME MoneyBook");
    expect(text).toContain("https://example.com/?ref=ADA");
  });
});
