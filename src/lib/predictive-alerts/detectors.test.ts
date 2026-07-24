import { afterEach, describe, expect, it } from "vitest";
import { isPredictiveAlertsFeatureEnabledForServer } from "@/lib/predictive-alerts/authorization";
import { buildPredictiveAlertDedupeKey } from "@/lib/predictive-alerts/deduplication";
import { detectPredictiveAlerts, legacySeverity } from "@/lib/predictive-alerts/detectors";
import type { PredictiveAlertInput } from "@/lib/predictive-alerts/definitions";

const generatedAt = new Date("2026-07-24T12:00:00.000Z");
const originalEnv = { ...process.env };

describe("Phase 3E Predictive Alert detectors", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("requires both exact rollout flags on the server", () => {
    process.env.NEXT_PUBLIC_PHASE3_PREDICTIVE_ALERTS_ENABLED = "true";
    process.env.PHASE3_PREDICTIVE_ALERTS_ENABLED = "false";
    expect(isPredictiveAlertsFeatureEnabledForServer()).toBe(false);

    process.env.PHASE3_PREDICTIVE_ALERTS_ENABLED = "true";
    expect(isPredictiveAlertsFeatureEnabledForServer()).toBe(true);

    process.env.PHASE3_AI_GLOBAL_KILL_SWITCH = "true";
    expect(isPredictiveAlertsFeatureEnabledForServer()).toBe(false);
  });

  it("detects every required deterministic rule with evidence, formulas, and disabled external delivery", () => {
    const alerts = detectPredictiveAlerts(fullInput());
    const ruleKeys = new Set(alerts.map((alert) => alert.ruleKey));
    const categories = new Set(alerts.map((alert) => alert.category));

    expect(ruleKeys).toEqual(new Set([
      "sales_decline",
      "expense_spike",
      "receivables_concentration",
      "overdue_debt_increase",
      "supplier_payment_pressure",
      "low_stock_risk",
      "stock_out_forecast",
      "slow_moving_stock",
      "reconciliation_backlog",
      "duplicate_import_risk",
      "tax_readiness_gap",
      "missing_data_risk",
      "staff_attribution_anomaly",
      "cash_pressure_indicator",
      "subscription_setup_risk",
    ]));
    expect(categories).toEqual(new Set([
      "cash_flow_pressure",
      "unusual_expense_increase",
      "sales_decline",
      "customer_debt_risk",
      "supplier_payment_pressure",
      "low_stock",
      "stock_out_risk",
      "slow_moving_stock",
      "reconciliation_backlog",
      "duplicate_bank_entries",
      "tax_readiness_issues",
      "missing_data_risk",
      "staff_attribution_anomalies",
      "subscription_or_setup_risks",
    ]));

    for (const alert of alerts) {
      expect(alert.evidence.formula.length).toBeGreaterThan(10);
      expect(alert.evidence.sourceData.length).toBeGreaterThan(0);
      expect(alert.formulaReference).toContain("predictive.");
      expect(alert.delivery.email).toBe(false);
      expect(alert.delivery.whatsapp).toBe(false);
      expect(alert.explanation.toLowerCase()).not.toContain("fraud");
    }
  });

  it("suppresses trend alerts when minimum data and thresholds are not met", () => {
    const alerts = detectPredictiveAlerts({
      businessId: "biz_1",
      generatedAt,
      periodDays: 30,
      transactions: [
        sale("sale_1", 10_000, "2026-07-10"),
        sale("sale_2", 11_000, "2026-06-10"),
      ],
      debts: [],
      inventoryItems: [],
      bankRows: [],
      taxReviewItems: [],
      setup: completeSetup(),
    });

    expect(alerts.some((alert) => ["sales_decline", "expense_spike"].includes(alert.ruleKey))).toBe(false);
    expect(alerts).toHaveLength(0);
  });

  it("applies business preferences for disabling, overrides, and in-app delivery", () => {
    const alerts = detectPredictiveAlerts({
      ...fullInput(),
      preferences: [
        { ruleKey: "sales_decline", enabled: false },
        { ruleKey: "expense_spike", severityOverride: "critical", inAppEnabled: false },
      ],
    });
    const ruleKeys = alerts.map((alert) => alert.ruleKey);
    const expenseSpike = alerts.find((alert) => alert.ruleKey === "expense_spike");

    expect(ruleKeys).not.toContain("sales_decline");
    expect(expenseSpike?.severity).toBe("critical");
    expect(expenseSpike?.delivery).toEqual({ inApp: false, email: false, whatsapp: false });
  });

  it("builds stable dedupe keys and maps legacy severity for stored-alert compatibility", () => {
    const first = detectPredictiveAlerts(fullInput());
    const second = detectPredictiveAlerts(fullInput());

    expect(new Set(first.map((alert) => alert.dedupeKey)).size).toBe(first.length);
    expect(second.map((alert) => alert.dedupeKey)).toEqual(first.map((alert) => alert.dedupeKey));
    expect(first.find((alert) => alert.ruleKey === "cash_pressure_indicator")?.dedupeKey).toBe(
      buildPredictiveAlertDedupeKey({
        businessId: "biz_1",
        ruleKey: "cash_pressure_indicator",
        category: "cash_flow_pressure",
        entityKey: "cash_pressure",
      }),
    );
    expect(legacySeverity("critical")).toBe("critical");
    expect(legacySeverity("high")).toBe("warning");
    expect(legacySeverity("information")).toBe("info");
  });
});

function fullInput(): PredictiveAlertInput {
  return {
    businessId: "biz_1",
    generatedAt,
    periodDays: 30,
    transactions: [
      sale("sale_current_1", 10_000, "2026-07-10", "Current sale", "item_fast", 10),
      sale("sale_current_2", 10_000, "2026-07-11", "Current sale", "item_fast", 10),
      sale("sale_current_3", 10_000, "2026-07-12", "Current sale", "item_fast", 10),
      sale("sale_previous_1", 40_000, "2026-06-01"),
      sale("sale_previous_2", 40_000, "2026-06-02"),
      sale("sale_previous_3", 40_000, "2026-06-03"),
      expense("expense_current_1", 50_000, "2026-07-08"),
      expense("expense_current_2", 50_000, "2026-07-09"),
      expense("expense_current_3", 50_000, "2026-07-10"),
      expense("expense_previous_1", 10_000, "2026-06-08", "Utilities", "sup_previous"),
      expense("expense_previous_2", 10_000, "2026-06-09", "Utilities", "sup_previous"),
    ],
    debts: [
      customerDebt("debt_ada", 100_000, 0, "cust_ada", "Ada Retail", "2026-07-01", "2026-06-30"),
      customerDebt("debt_bola", 20_000, 0, "cust_bola", "Bola Foods", "2026-06-20", "2026-06-10"),
      supplierDebt("supplier_1", 40_000, 0, "sup_1", "North Supplier", "2026-07-26", "2026-07-10"),
    ],
    inventoryItems: [
      { id: "item_fast", name: "Fast Rice", quantityOnHand: 5, lowStockLevel: 10, costPrice: 2_000, sellingPrice: 3_000 },
      { id: "item_slow", name: "Slow Freezer", quantityOnHand: 20, lowStockLevel: 3, costPrice: 3_000, sellingPrice: 5_000 },
    ],
    bankRows: [
      bankRow("bank_1", 20_000, "unmatched", "unique", "2026-07-01"),
      bankRow("bank_2", 20_000, "suggested", "unique", "2026-07-02"),
      bankRow("bank_3", 20_000, "unmatched", "unique", "2026-07-03"),
      bankRow("bank_dup", 15_000, "duplicate", "probable_duplicate", "2026-07-04"),
    ],
    taxReviewItems: [
      {
        id: "tax_1",
        issueType: "missing_receipt",
        severity: "high",
        status: "open",
        explanation: "Receipt missing.",
        createdAt: "2026-07-10T00:00:00.000Z",
      },
    ],
    staffAttribution: {
      totalActivityCount: 5,
      attributedActivityCount: 1,
      unattributedActivityCount: 4,
      totalSalesAmount: 30_000,
      attributedSalesAmount: 5_000,
      dataQualityNotes: ["Some sale activity has no reliable staff attribution."],
    },
    setup: {
      onboardingCompleted: false,
      planId: "pro",
      hasPredictiveAlertsEntitlement: true,
      taxProfileConfigured: false,
      bankImportCount: 1,
    },
  };
}

function completeSetup() {
  return {
    onboardingCompleted: true,
    planId: "pro",
    hasPredictiveAlertsEntitlement: true,
    taxProfileConfigured: true,
    bankImportCount: 1,
  };
}

function sale(
  id: string,
  amount: number,
  date: string,
  description = "Sale",
  inventoryItemId?: string,
  inventoryQuantity?: number,
) {
  return {
    id,
    type: "SALE",
    amount,
    description,
    category: "Sales",
    paymentStatus: "PAID",
    occurredAt: new Date(`${date}T10:00:00.000Z`),
    inventoryItemId,
    inventoryQuantity,
  };
}

function expense(
  id: string,
  amount: number,
  date: string,
  category: string | null = null,
  supplierId: string | null = null,
) {
  return {
    id,
    type: "EXPENSE",
    amount,
    description: "Expense",
    category,
    paymentStatus: "PAID",
    supplierId,
    occurredAt: new Date(`${date}T10:00:00.000Z`),
  };
}

function customerDebt(
  id: string,
  amount: number,
  paidAmount: number,
  customerId: string,
  customerName: string,
  dueAt: string,
  createdAt: string,
) {
  return {
    id,
    type: "CUSTOMER_OWES_BUSINESS",
    amount,
    paidAmount,
    status: "OPEN",
    customerId,
    customerName,
    dueAt: new Date(`${dueAt}T00:00:00.000Z`),
    createdAt: new Date(`${createdAt}T00:00:00.000Z`),
  };
}

function supplierDebt(
  id: string,
  amount: number,
  paidAmount: number,
  supplierId: string,
  supplierName: string,
  dueAt: string,
  createdAt: string,
) {
  return {
    id,
    type: "BUSINESS_OWES_SUPPLIER",
    amount,
    paidAmount,
    status: "OPEN",
    supplierId,
    supplierName,
    dueAt: new Date(`${dueAt}T00:00:00.000Z`),
    createdAt: new Date(`${createdAt}T00:00:00.000Z`),
  };
}

function bankRow(
  id: string,
  amount: number,
  status: string,
  duplicateStatus: string,
  postedAt: string,
) {
  return {
    id,
    amount,
    status,
    duplicateStatus,
    postedAt: new Date(`${postedAt}T00:00:00.000Z`),
    importedAt: new Date(`${postedAt}T01:00:00.000Z`),
  };
}
