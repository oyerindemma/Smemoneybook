import { describe, expect, it } from "vitest";
import type { MonthlyReport } from "@/lib/bookkeeping/transaction-engine";
import {
  buildReferralShareText,
  buildReportShareText,
  getReferralCode,
  getReferralLink,
} from "@/lib/viral/referral-engine";

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

  it("includes top category in report share text when available", () => {
    const report = {
      periodLabel: "2026-07",
      salesTotal: 150000,
      expensesTotal: 40000,
      profitTotal: 65000,
      categoryBreakdown: [
        {
          name: "Foodstuff",
          quantity: 8,
          salesTotal: 120000,
          profitTotal: 50000,
        },
      ],
    } as MonthlyReport;

    const text = buildReportShareText(report, "https://example.com/?ref=ADA");

    expect(text).toContain("Top category: Foodstuff");
  });
});
