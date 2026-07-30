import { describe, expect, it } from "vitest";
import {
  aiMarketingSegmentKeys,
  calculateAiMarketingSegments,
  getMarketingSegment,
  serializeMarketingSegmentDefinition,
  type MarketingCustomerProfile,
} from "@/lib/ai-marketing/segments";

const periodStart = new Date("2026-07-01T00:00:00.000Z");
const periodEnd = new Date("2026-08-01T00:00:00.000Z");
const generatedAt = new Date("2026-07-30T12:00:00.000Z");

describe("AI Marketing deterministic segments", () => {
  it("returns every Phase 3H segment with consent-aware recipient counts", () => {
    const segments = calculateAiMarketingSegments({
      customers: customers(),
      periodStart,
      periodEnd,
      generatedAt,
    });

    expect(segments.map((segment) => segment.key)).toEqual([...aiMarketingSegmentKeys]);
    expect(getMarketingSegment(segments, "new_customers")).toMatchObject({
      customerCount: 1,
      consentEligibleCount: 1,
    });
    expect(getMarketingSegment(segments, "frequent_customers")).toMatchObject({
      customerCount: 1,
      consentEligibleCount: 1,
    });
    expect(getMarketingSegment(segments, "high_value_customers")).toMatchObject({
      customerCount: 1,
      consentEligibleCount: 1,
    });
    expect(getMarketingSegment(segments, "dormant_customers")).toMatchObject({
      customerCount: 1,
      consentEligibleCount: 1,
    });
    expect(getMarketingSegment(segments, "repeat_customers")).toMatchObject({
      customerCount: 1,
      consentEligibleCount: 1,
    });
    expect(getMarketingSegment(segments, "unpaid_invoices")).toMatchObject({
      customerCount: 1,
      consentEligibleCount: 1,
    });
    expect(getMarketingSegment(segments, "overdue_debt")).toMatchObject({
      customerCount: 1,
      consentEligibleCount: 1,
    });
    expect(getMarketingSegment(segments, "active_in_range")).toMatchObject({
      customerCount: 4,
      consentEligibleCount: 2,
      excludedCount: 2,
    });
    expect(getMarketingSegment(segments, "verified_marketing_consent")).toMatchObject({
      customerCount: 3,
      consentEligibleCount: 3,
    });
  });

  it("tracks product/category purchase matches without sensitive demographic targeting", () => {
    const segment = getMarketingSegment(
      calculateAiMarketingSegments({ customers: customers(), periodStart, periodEnd, generatedAt }),
      "purchased_product_category",
    );

    expect(segment?.customerCount).toBe(1);
    expect(segment?.breakdown).toMatchObject({ groceries: 1, "rice bag": 1 });
    expect(segment?.definition.toLowerCase()).not.toContain("income");
    expect(segment?.definition.toLowerCase()).not.toContain("religion");
  });

  it("serializes segment definitions without customer identifiers", () => {
    const segment = getMarketingSegment(
      calculateAiMarketingSegments({ customers: customers(), periodStart, periodEnd, generatedAt }),
      "active_in_range",
    );

    expect(segment?.matchingCustomerIds).toContain("customer_1");
    const serialized = serializeMarketingSegmentDefinition(segment!);

    expect(serialized).toMatchObject({
      version: "phase3h-ai-marketing-segments-v1",
      segmentKey: "active_in_range",
      customerCount: 4,
    });
    expect(JSON.stringify(serialized)).not.toContain("customer_1");
  });
});

function customers(): MarketingCustomerProfile[] {
  return [
    {
      id: "customer_1",
      name: "Ada",
      phone: "+2348012345000",
      createdAt: "2026-07-05T09:00:00.000Z",
      marketingConsentStatus: "consented",
      preferredChannel: "whatsapp",
      transactions: [
        sale("sale_1", 40000, "2026-07-06T09:00:00.000Z", "paid", "Rice bag", "Groceries"),
        sale("sale_2", 50000, "2026-07-09T09:00:00.000Z", "paid"),
        sale("sale_3", 30000, "2026-07-15T09:00:00.000Z", "paid"),
      ],
    },
    {
      id: "customer_2",
      name: "Bala",
      phone: "+2348012345001",
      createdAt: "2026-06-05T09:00:00.000Z",
      marketingConsentStatus: "unknown",
      preferredChannel: "whatsapp",
      transactions: [sale("sale_4", 15000, "2026-07-12T09:00:00.000Z", "paid")],
    },
    {
      id: "customer_3",
      name: "Chi",
      phone: "+2348012345002",
      createdAt: "2026-06-10T09:00:00.000Z",
      marketingConsentStatus: "opted_out",
      preferredChannel: "whatsapp",
      transactions: [sale("sale_5", 12000, "2026-07-14T09:00:00.000Z", "paid")],
    },
    {
      id: "customer_4",
      name: "Dami",
      phone: "+2348012345003",
      createdAt: "2025-12-10T09:00:00.000Z",
      marketingConsentStatus: "consented",
      preferredChannel: "whatsapp",
      transactions: [sale("sale_6", 10000, "2026-03-01T09:00:00.000Z", "paid")],
    },
    {
      id: "customer_5",
      name: "Efe",
      phone: "+2348012345004",
      createdAt: "2026-06-10T09:00:00.000Z",
      marketingConsentStatus: "consented",
      preferredChannel: "whatsapp",
      transactions: [sale("sale_7", 45000, "2026-07-18T09:00:00.000Z", "credit")],
      debts: [
        {
          id: "debt_1",
          type: "customer_owes_business",
          status: "open",
          amount: 45000,
          paidAmount: 0,
          dueAt: "2026-07-01T09:00:00.000Z",
          createdAt: "2026-06-28T09:00:00.000Z",
        },
      ],
      issuedDocuments: [
        {
          id: "doc_1",
          status: "issued",
          total: 45000,
          balanceDue: 45000,
          dueDate: "2026-07-01T09:00:00.000Z",
          createdAt: "2026-06-28T09:00:00.000Z",
        },
      ],
    },
    {
      id: "customer_6",
      name: "Fola",
      phone: "+2348012345005",
      createdAt: "2026-06-10T09:00:00.000Z",
      marketingConsentStatus: "consented",
      preferredChannel: "whatsapp",
      doNotContact: true,
      transactions: [sale("sale_8", 5000, "2026-06-20T09:00:00.000Z", "paid")],
    },
  ];
}

function sale(
  id: string,
  amount: number,
  occurredAt: string,
  paymentStatus: string,
  productName?: string,
  productCategory?: string,
) {
  return {
    id,
    type: "sale",
    amount,
    occurredAt,
    paymentStatus,
    productName,
    productCategory,
  };
}
