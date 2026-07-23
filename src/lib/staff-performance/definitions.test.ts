import { describe, expect, it } from "vitest";
import {
  aggregateStaffPerformance,
  emptyUnattributedRecords,
  resolveStaffPerformancePeriod,
  staffPerformanceDisclaimer,
} from "@/lib/staff-performance/definitions";

const period = {
  preset: "custom" as const,
  label: "July",
  periodStart: new Date("2026-07-01T00:00:00.000Z"),
  periodEnd: new Date("2026-08-01T00:00:00.000Z"),
};
const comparisonPeriod = {
  periodStart: new Date("2026-06-01T00:00:00.000Z"),
  periodEnd: new Date("2026-07-01T00:00:00.000Z"),
};
const business = { id: "biz_1", name: "Demo Shop", currency: "NGN" };

describe("staff performance definitions", () => {
  it("calculates canonical factual metrics without a composite score", () => {
    const summary = aggregateStaffPerformance({
      business,
      period,
      comparisonPeriod,
      members: [
        { userId: "owner_1", name: "Ada", role: "OWNER" },
        { userId: "staff_1", name: "Tunde", role: "STAFF" },
      ],
      currentEvents: [
        attributed("sale_1", "staff_1", "sale", "2026-07-05T10:00:00.000Z", 12_000),
        attributed("sale_2", "staff_1", "sale", "2026-07-06T10:00:00.000Z", 8_000),
        attributed("sale_3", "staff_1", "sale", "2026-07-06T12:00:00.000Z", null, false),
        attributed("invoice_1", "staff_1", "invoice", "2026-07-07T10:00:00.000Z"),
        attributed("expense_1", "staff_1", "expense", "2026-07-08T10:00:00.000Z"),
        attributed("debt_1", "staff_1", "debt_collection", "2026-07-09T10:00:00.000Z", 4_000),
        attributed("supplier_1", "owner_1", "supplier_settlement", "2026-07-10T10:00:00.000Z", 3_000),
        attributed("stock_in_1", "staff_1", "stock_in", "2026-07-11T10:00:00.000Z"),
        attributed("stock_out_1", "staff_1", "stock_out", "2026-07-12T10:00:00.000Z"),
        attributed("transfer_1", "staff_1", "transfer", "2026-07-13T10:00:00.000Z"),
        attributed("reversal_1", "staff_1", "reversal", "2026-07-14T10:00:00.000Z"),
      ],
      comparisonEvents: [
        attributed("prev_sale_1", "staff_1", "sale", "2026-06-12T10:00:00.000Z", 5_000),
      ],
      totalBusinessSalesAmount: 40_000,
      totalBusinessSalesTransactions: 4,
      unattributedRecords: {
        ...emptyUnattributedRecords(),
        salesAmountRecords: 1,
      },
      generatedAt: new Date("2026-07-15T10:00:00.000Z"),
    });

    const staff = summary.rows.find((row) => row.staff.userId === "staff_1");

    expect(summary.formulaVersion).toBe("staff-performance-v1");
    expect(summary.disclaimer).toBe(staffPerformanceDisclaimer);
    expect(staff?.metrics.salesAmountRecorded).toBe(20_000);
    expect(staff?.metrics.salesTransactions).toBe(3);
    expect(staff?.metrics.salesTransactionsWithAmount).toBe(2);
    expect(staff?.metrics.averageTransactionValue).toBe(10_000);
    expect(staff?.metrics.invoicesCreated).toBe(1);
    expect(staff?.metrics.expensesRecorded).toBe(1);
    expect(staff?.metrics.debtCollectionsAmount).toBe(4_000);
    expect(staff?.metrics.supplierSettlementsRecorded).toBe(0);
    expect(staff?.metrics.stockInOperations).toBe(1);
    expect(staff?.metrics.stockOutOperations).toBe(1);
    expect(staff?.metrics.warehouseTransferActions).toBe(1);
    expect(staff?.metrics.reversalsCorrections).toBe(1);
    expect(staff?.metrics.activeDays).toBe(9);
    expect(staff?.metrics.salesContributionPercent).toBe(50);
    expect(staff?.comparison.salesAmountRecorded).toBe(5_000);
    expect(Object.keys(summary)).not.toContain("score");
  });

  it("returns a valid empty state", () => {
    const summary = aggregateStaffPerformance({
      business,
      period,
      comparisonPeriod,
      members: [{ userId: "staff_1", name: "Tunde", role: "STAFF" }],
      currentEvents: [],
      totalBusinessSalesAmount: 0,
      totalBusinessSalesTransactions: 0,
      unattributedRecords: emptyUnattributedRecords(),
    });

    expect(summary.rows).toHaveLength(1);
    expect(summary.summaryCards.activeStaff).toBe(0);
    expect(summary.rows[0]?.metrics.lastRecordedActivity).toBeNull();
  });

  it("supports required date ranges and bounds custom ranges", () => {
    const thisMonth = resolveStaffPerformancePeriod({
      preset: "this_month",
      now: new Date("2026-07-23T12:00:00.000Z"),
    });
    const previousMonth = resolveStaffPerformancePeriod({
      preset: "previous_month",
      now: new Date("2026-07-23T12:00:00.000Z"),
    });
    const custom = resolveStaffPerformancePeriod({
      preset: "custom",
      from: "2026-07-01",
      to: "2026-07-31",
    });

    expect(thisMonth.periodStart.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(previousMonth.periodStart.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(custom.periodEnd.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(() =>
      resolveStaffPerformancePeriod({
        preset: "custom",
        from: "2025-01-01",
        to: "2026-07-31",
      }),
    ).toThrow("366 days");
  });
});

function attributed(
  id: string,
  actorId: string,
  kind: Parameters<typeof aggregateStaffPerformance>[0]["currentEvents"][number]["kind"],
  occurredAt: string,
  amount?: number | null,
  hasReliableAmount = amount !== undefined && amount !== null,
) {
  return {
    id,
    actorId,
    kind,
    occurredAt,
    amount,
    source: "test",
    hasReliableAmount,
  };
}
