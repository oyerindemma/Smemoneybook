import { describe, expect, it } from "vitest";
import { calculateTaxAssistantSummary } from "@/lib/phase3/tax-assistant";

const now = new Date("2026-07-19T12:00:00.000Z");

describe("calculateTaxAssistantSummary", () => {
  it("estimates tax from configured settings and recorded sales", () => {
    const summary = calculateTaxAssistantSummary({
      businessId: "biz_1",
      periodStart: new Date("2026-07-01T00:00:00.000Z"),
      periodEnd: new Date("2026-08-01T00:00:00.000Z"),
      generatedAt: now,
      taxConfig: {
        country: "NG",
        enabled: true,
        registrationNumber: "VAT-123",
        inclusiveByDefault: false,
      },
      rates: [{ label: "VAT", rate: 7.5, type: "vat", isDefault: true }],
      transactions: [
        { type: "sale", amount: 100_000, paymentStatus: "paid", occurredAt: now, hasTaxSnapshot: true },
        { type: "expense", amount: 20_000, paymentStatus: "paid", occurredAt: now },
      ],
      documentTaxSnapshots: [
        { label: "VAT", rate: 7.5, taxableAmount: 100_000, taxAmount: 7_500, inclusive: false, createdAt: now },
      ],
      priorTaxRuns: [],
    });

    expect(summary.ruleVersion).toBe("tax-assistant-ng-v1");
    expect(summary.taxableSales).toBe(100_000);
    expect(summary.estimatedTax).toBe(7_500);
    expect(summary.confidence).toBe("medium");
    expect(summary.disclaimer).toContain("not tax advice");
  });

  it("reports missing settings instead of pretending tax is configured", () => {
    const summary = calculateTaxAssistantSummary({
      businessId: "biz_2",
      periodStart: new Date("2026-07-01T00:00:00.000Z"),
      periodEnd: new Date("2026-08-01T00:00:00.000Z"),
      generatedAt: now,
      taxConfig: null,
      rates: [],
      transactions: [{ type: "sale", amount: 50_000, paymentStatus: "paid", occurredAt: now }],
      documentTaxSnapshots: [],
      priorTaxRuns: [],
    });

    expect(summary.confidence).toBe("insufficient_data");
    expect(summary.estimatedTax).toBe(0);
    expect(summary.missingSettings).toContain("Tax settings are not configured.");
  });

  it("flags sale records without tax snapshots", () => {
    const summary = calculateTaxAssistantSummary({
      businessId: "biz_3",
      periodStart: new Date("2026-07-01T00:00:00.000Z"),
      periodEnd: new Date("2026-08-01T00:00:00.000Z"),
      generatedAt: now,
      taxConfig: {
        country: "NG",
        enabled: true,
        registrationNumber: "VAT-123",
        inclusiveByDefault: false,
      },
      rates: [{ label: "VAT", rate: 7.5, type: "vat", isDefault: true }],
      transactions: [{ type: "sale", amount: 50_000, paymentStatus: "paid", occurredAt: now, hasTaxSnapshot: false }],
      documentTaxSnapshots: [],
      priorTaxRuns: [],
    });

    expect(summary.inconsistencies[0]).toContain("sale records have no document tax snapshot");
  });
});
