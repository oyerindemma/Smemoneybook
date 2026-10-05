import { describe, expect, it } from "vitest";
import {
  calculateExecutiveDashboard,
  resolveExecutiveDashboardPeriod,
} from "@/lib/phase3/executive-dashboard";

function period() {
  return resolveExecutiveDashboardPeriod({
    preset: "custom",
    from: "2026-07-01T00:00:00.000Z",
    to: "2026-08-01T00:00:00.000Z",
    now: new Date("2026-07-24T12:00:00.000Z"),
  });
}

describe("Phase 3D Executive Dashboard", () => {
  it("calculates owner metrics, comparisons, quality states, and attention items", () => {
    const resolved = period();
    const dashboard = calculateExecutiveDashboard({
      business: { id: "biz_1", name: "Preview Shop", currency: "NGN" },
      location: { id: null, name: "All locations" },
      period: resolved.period,
      comparisonPeriod: resolved.comparisonPeriod,
      generatedAt: new Date("2026-07-24T12:00:00.000Z"),
      transactions: [
        {
          id: "sale_1",
          type: "SALE",
          amount: "100.10",
          profit: "30.05",
          costOfGoods: "70.05",
          description: "Paid sale",
          category: "Sales",
          paymentStatus: "PAID",
          occurredAt: "2026-07-10T10:00:00.000Z",
          customerId: "customer_1",
          inventoryItemId: "item_1",
        },
        {
          id: "sale_2",
          type: "SALE",
          amount: "50.00",
          profit: "20.00",
          costOfGoods: "30.00",
          description: "Credit sale",
          category: "Sales",
          paymentStatus: "CREDIT",
          occurredAt: "2026-07-11T10:00:00.000Z",
          customerId: "customer_2",
        },
        {
          id: "expense_1",
          type: "EXPENSE",
          amount: "25.05",
          profit: "0",
          costOfGoods: "0",
          description: "Uncategorized expense",
          paymentStatus: "PAID",
          occurredAt: "2026-07-12T10:00:00.000Z",
        },
        {
          id: "old_sale",
          type: "SALE",
          amount: "80",
          profit: "30",
          costOfGoods: "50",
          description: "June sale",
          category: "Sales",
          paymentStatus: "PAID",
          occurredAt: "2026-06-10T10:00:00.000Z",
          customerId: "customer_1",
        },
        {
          id: "old_expense",
          type: "EXPENSE",
          amount: "10",
          profit: "0",
          costOfGoods: "0",
          description: "June expense",
          category: "Rent",
          paymentStatus: "PAID",
          occurredAt: "2026-06-12T10:00:00.000Z",
        },
        {
          id: "reversed",
          type: "SALE",
          amount: "9999",
          profit: "9999",
          costOfGoods: "0",
          description: "Reversed sale",
          category: "Sales",
          paymentStatus: "PAID",
          occurredAt: "2026-07-13T10:00:00.000Z",
          reversed: true,
        },
      ],
      debts: [
        {
          id: "debt_1",
          type: "CUSTOMER_OWES_BUSINESS",
          amount: "200",
          paidAmount: "50",
          status: "OPEN",
          dueAt: "2026-07-01T00:00:00.000Z",
          createdAt: "2026-06-01T00:00:00.000Z",
          partyName: "Adebayo Stores",
        },
        {
          id: "debt_2",
          type: "BUSINESS_OWES_SUPPLIER",
          amount: "75",
          paidAmount: "0",
          status: "OPEN",
          dueAt: "2026-07-05T00:00:00.000Z",
          createdAt: "2026-07-01T00:00:00.000Z",
          partyName: "Supply Co",
        },
      ],
      inventoryItems: [
        { id: "item_1", name: "Rice", quantityOnHand: "2.5", lowStockLevel: "3", costPrice: "10", sellingPrice: "15" },
        { id: "item_2", name: "Beans", quantityOnHand: "4", lowStockLevel: "2", costPrice: "5", sellingPrice: "5" },
      ],
      locations: [{ id: "loc_1", name: "Main shop" }],
      pendingTransfers: 2,
      bankRows: [
        { id: "row_1", amount: "100", status: "MATCHED", duplicateStatus: "UNIQUE", postedAt: "2026-07-10T00:00:00.000Z" },
        { id: "row_2", amount: "25", status: "UNMATCHED", duplicateStatus: "UNIQUE", postedAt: "2026-07-12T00:00:00.000Z" },
        { id: "row_3", amount: "5", status: "DUPLICATE", duplicateStatus: "PROBABLE_DUPLICATE", postedAt: "2026-07-13T00:00:00.000Z" },
        { id: "row_4", amount: "80", status: "MATCHED", duplicateStatus: "UNIQUE", postedAt: "2026-06-10T00:00:00.000Z" },
      ],
      taxSummary: {
        figures: {
          netVatEstimate: 6000,
          whtDeductedByCustomers: 500,
          whtDeductedFromSuppliers: 0,
          dataCompletenessRate: 88,
        },
        counts: { reviewItemCount: 2 },
        source: { ruleSetVersion: "ng-federal-2026-preview-v1", ruleSetStatus: "verified" },
        missingInformation: [],
        reviewItems: [
          { issueType: "missing_receipt", severity: "warning", explanation: "Receipt missing." },
          { issueType: "unreconciled_transaction", severity: "information", explanation: "Bank match missing." },
        ],
      },
      staffSummary: {
        summaryCards: {
          attributedSalesAmount: 100.1,
          activeStaff: 2,
          unattributedRecords: 1,
        },
        totals: {
          salesTransactions: 1,
          expensesRecorded: 1,
          stockInOperations: 0,
          stockOutOperations: 0,
          warehouseTransferActions: 0,
          debtCollectionsRecorded: 0,
          supplierSettlementsRecorded: 0,
          reversalsCorrections: 0,
        },
        rows: [
          { staff: { userId: "user_1", name: "Owner", role: "OWNER" }, metrics: { lastRecordedActivity: "2026-07-10T00:00:00.000Z" } },
          { staff: { userId: "user_2", name: "Cashier", role: "STAFF" }, metrics: { lastRecordedActivity: "2026-07-11T00:00:00.000Z" } },
        ],
        dataQualityNotes: ["1 sale is unattributed."],
      },
    });

    expect(dashboard.metricVersion).toBe("executive-dashboard-v2");
    expect(dashboard.headline.sales.value).toBe(150.1);
    expect(dashboard.headline.sales.comparisonValue).toBe(80);
    expect(dashboard.revenue.paidSales.value).toBe(100.1);
    expect(dashboard.revenue.creditSales.value).toBe(50);
    expect(dashboard.expenses.totalExpenses.value).toBe(25.05);
    expect(dashboard.profit.recordedGrossProfit.value).toBe(50.05);
    expect(dashboard.profit.estimatedNetOperatingResult.value).toBe(25);
    expect(dashboard.profit.marginPercentage.value).toBe(33.34);
    expect(dashboard.receivables.totalCustomerDebt.value).toBe(150);
    expect(dashboard.payables.supplierObligations.value).toBe(75);
    expect(dashboard.stock.stockCostValue.value).toBe(45);
    expect(dashboard.stock.potentialRevenue.value).toBe(57.5);
    expect(dashboard.reconciliation.reconciliationRate.value).toBe(76.92);
    expect(dashboard.taxReadiness.verifiedRuleSetVersion.value).toBe("ng-federal-2026-preview-v1");
    expect(dashboard.staff.activeStaff.value).toBe(2);
    expect(dashboard.dataQuality.status).toBe("partial");
    expect(dashboard.attentionQueue.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        "attention:overdue_customer_debt",
        "attention:unreconciled_bank_entries",
        "attention:tax_readiness",
      ]),
    );
  });

  it("returns insufficient-data states without fabricating trends", () => {
    const resolved = period();
    const dashboard = calculateExecutiveDashboard({
      business: { id: "biz_1", name: "Empty Shop", currency: "NGN" },
      location: { id: null, name: "All locations" },
      period: resolved.period,
      comparisonPeriod: resolved.comparisonPeriod,
      generatedAt: new Date("2026-07-24T12:00:00.000Z"),
      transactions: [],
      debts: [],
      inventoryItems: [],
      locations: [],
      pendingTransfers: 0,
      bankRows: [],
      taxSummary: null,
      taxError: "Tax Assistant profile is not configured.",
      staffSummary: null,
      staffRestricted: true,
    });

    expect(dashboard.headline.sales.value).toBe(0);
    expect(dashboard.revenue.averageSaleValue.dataQualityStatus).toBe("insufficient_data");
    expect(dashboard.taxReadiness.verifiedRuleSetVersion.value).toBe("setup_required");
    expect(dashboard.dataQuality.status).toBe("setup_required");
    expect(dashboard.freshness.latestTransactionAt).toBeNull();
  });

  it("resolves preset periods with deterministic comparison windows", () => {
    const resolved = resolveExecutiveDashboardPeriod({
      preset: "last_7_days",
      now: new Date("2026-07-24T15:00:00.000Z"),
    });

    expect(resolved.period.start).toBe("2026-07-18T00:00:00.000Z");
    expect(resolved.period.end).toBe("2026-07-25T00:00:00.000Z");
    expect(resolved.comparisonPeriod.start).toBe("2026-07-11T00:00:00.000Z");
    expect(resolved.comparisonPeriod.end).toBe("2026-07-18T00:00:00.000Z");
  });
});
