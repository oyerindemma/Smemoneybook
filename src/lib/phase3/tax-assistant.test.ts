import { describe, expect, it } from "vitest";
import {
  calculateTaxAssistantSummary,
  taxAssistantRuleSetVersion,
  type TaxAssistantInput,
} from "@/lib/phase3/tax-assistant";
import {
  allowedTaxAssistantTools,
  prohibitedTaxAssistantTools,
  selectTaxAssistantTools,
} from "@/lib/tax-assistant/context";

const periodStart = new Date("2026-07-01T00:00:00.000Z");
const periodEnd = new Date("2026-08-01T00:00:00.000Z");
const now = new Date("2026-07-23T12:00:00.000Z");

describe("Phase 3C Tax Assistant calculator", () => {
  it("calculates VAT-exclusive output VAT, input VAT, net VAT, WHT and readiness traces", () => {
    const summary = calculateTaxAssistantSummary(baseInput({
      transactions: [
        sale({ id: "sale_1", amount: 100_000, customerId: "cust_1", taxTreatment: "taxable", confirmedReconciliationCount: 1 }),
        expense({ id: "expense_1", amount: 20_000, supplierId: "sup_1", receiptId: "receipt_1", taxTreatment: "taxable", confirmedReconciliationCount: 1 }),
        sale({ id: "sale_2", amount: 50_000, withholdingTaxRate: 5, customerId: "cust_2", taxTreatment: "taxable", confirmedReconciliationCount: 1 }),
      ],
    }));

    expect(summary.ruleSetVersion).toBe(taxAssistantRuleSetVersion);
    expect(summary.figures.taxableSales).toBe(150_000);
    expect(summary.figures.outputVatEstimate).toBe(11_250);
    expect(summary.figures.eligibleInputVatEstimate).toBe(1_500);
    expect(summary.figures.netVatEstimate).toBe(9_750);
    expect(summary.figures.whtDeductedByCustomers).toBe(2_500);
    expect(summary.figures.estimatedTaxDue).toBe(7_250);
    expect(summary.formulas.map((formula) => formula.label)).toContain("Output VAT");
    expect(summary.disclaimer).toContain("not a filed tax return");
  });

  it("calculates VAT-inclusive records from gross amounts", () => {
    const summary = calculateTaxAssistantSummary(baseInput({
      profile: { ...baseProfile(), pricingMode: "tax_inclusive" },
      transactions: [
        sale({ id: "inclusive_sale", amount: 107_500, customerId: "cust_1", taxTreatment: "taxable" }),
      ],
    }));

    expect(summary.figures.taxableSales).toBe(100_000);
    expect(summary.figures.outputVatEstimate).toBe(7_500);
  });

  it("handles verified rule thresholds without guessing liabilities below the threshold", () => {
    const summary = calculateTaxAssistantSummary(baseInput({
      ruleSet: baseRuleSet({
        rules: [
          { taxType: "VAT", transactionType: "SALE", rate: 7.5, threshold: 100_000, status: "verified" },
          { taxType: "VAT_INPUT", transactionType: "EXPENSE", rate: 7.5, status: "verified" },
        ],
      }),
      transactions: [
        sale({ id: "small_sale", amount: 90_000, customerId: "cust_1", taxTreatment: "taxable" }),
      ],
    }));

    expect(summary.figures.taxableSales).toBe(0);
    expect(summary.figures.outputVatEstimate).toBe(0);
  });

  it("excludes reversed and probable duplicate records from estimates", () => {
    const summary = calculateTaxAssistantSummary(baseInput({
      transactions: [
        sale({ id: "sale_1", amount: 100_000, description: "POS settlement", taxTreatment: "taxable", customerId: "cust_1" }),
        sale({ id: "sale_2", amount: 100_000, description: "POS settlement", taxTreatment: "taxable", customerId: "cust_1" }),
        sale({ id: "reversed_sale", amount: 75_000, isOriginalReversed: true, taxTreatment: "taxable", customerId: "cust_1" }),
      ],
    }));

    expect(summary.figures.taxableSales).toBe(100_000);
    expect(summary.counts.probableDuplicateCount).toBe(1);
    expect(summary.counts.excludedReversedCount).toBe(1);
    expect(summary.reviewItems.some((item) => item.issueType === "duplicate_transaction")).toBe(true);
    expect(summary.reviewItems.some((item) => item.issueType === "reversed_record_excluded")).toBe(true);
  });

  it("returns insufficient setup and review items without exposing full tax identifiers", () => {
    const summary = calculateTaxAssistantSummary(baseInput({
      profile: {
        ...baseProfile(),
        taxIdentificationNumber: "1234567890",
        setupRequired: ["VAT registration status is missing."],
      },
      ruleSet: baseRuleSet({ status: "draft", lastVerifiedAt: null }),
      transactions: [
        sale({ id: "sale_missing", amount: 50_000, category: null, taxTreatment: null, customerId: null, taxSnapshotCount: 0 }),
        expense({ id: "expense_missing", amount: 25_000, category: null, taxTreatment: null, supplierId: null, receiptId: null }),
      ],
      unreconciledBankEntries: [{ id: "bank_1", amount: 15_000, direction: "credit" }],
    }));

    expect(summary.profile.maskedTaxIdentificationNumber).toBe("******7890");
    expect(summary.taxRuleRequiresVerification).toBe(true);
    expect(summary.reviewItems.map((item) => item.issueType)).toEqual(
      expect.arrayContaining([
        "missing_vat_registration_status",
        "tax_rule_version_not_verified",
        "missing_category",
        "missing_receipt",
        "missing_supplier",
        "missing_customer_or_invoice",
        "unreconciled_bank_entry",
      ]),
    );
    expect(summary.figures.taxReadinessScore).toBeLessThan(100);
  });

  it("selects only approved read tools and keeps prohibited write tools absent", () => {
    const tools = selectTaxAssistantTools("Explain VAT, WHT, missing receipts and rule source.");

    expect(tools).toEqual(
      expect.arrayContaining([
        "get_tax_summary",
        "get_vat_estimate",
        "get_wht_summary",
        "get_tax_review_items",
        "get_tax_rule_source",
      ]),
    );
    expect(allowedTaxAssistantTools).not.toEqual(expect.arrayContaining([...prohibitedTaxAssistantTools]));
  });
});

function baseInput(overrides: Partial<TaxAssistantInput> = {}): TaxAssistantInput {
  return {
    businessId: "biz_1",
    businessName: "Preview Shop",
    country: "NG",
    currency: "NGN",
    periodStart,
    periodEnd,
    filingFrequency: "MONTHLY",
    generatedAt: now,
    profile: baseProfile(),
    ruleSet: baseRuleSet(),
    transactions: [],
    unreconciledBankEntries: [],
    ...overrides,
  };
}

function baseProfile(overrides: Partial<TaxAssistantInput["profile"]> = {}): TaxAssistantInput["profile"] {
  return {
    businessId: "biz_1",
    jurisdiction: "NG-FED",
    taxIdentificationNumber: "VAT-123456",
    vatRegistered: true,
    vatRegistrationDate: new Date("2026-01-01T00:00:00.000Z"),
    filingFrequency: "MONTHLY",
    fiscalYearStartMonth: 1,
    defaultCurrency: "NGN",
    pricingMode: "tax_exclusive",
    whtApplicable: true,
    businessType: "Retail",
    industryCategory: "General trade",
    setupRequired: [],
    ...overrides,
  };
}

function baseRuleSet(overrides: Partial<NonNullable<TaxAssistantInput["ruleSet"]>> = {}): NonNullable<TaxAssistantInput["ruleSet"]> {
  return {
    version: taxAssistantRuleSetVersion,
    status: "verified",
    jurisdiction: "NG-FED",
    sourceTitle: "Nigeria Tax Act 2025",
    sourceAuthority: "Nigeria Revenue Service",
    sourceReference: "https://www.nrs.gov.ng/uploads/NIGERIA_TAX_ACT_2025_ef6bb812a5.pdf",
    lastVerifiedAt: new Date("2026-07-23T00:00:00.000Z"),
    verificationOwner: "SME MoneyBook engineering",
    rules: [
      { taxType: "VAT", transactionType: "SALE", rate: 7.5, status: "verified" },
      { taxType: "VAT_INPUT", transactionType: "EXPENSE", rate: 7.5, status: "verified" },
      { taxType: "WHT", transactionType: "RECORDED_ONLY", rate: 0, status: "verified" },
    ],
    ...overrides,
  };
}

function sale(overrides: Partial<TaxAssistantInput["transactions"][number]> = {}): TaxAssistantInput["transactions"][number] {
  return {
    id: "sale",
    businessId: "biz_1",
    type: "SALE",
    amount: 100_000,
    description: "Retail sale",
    category: "Sales",
    paymentStatus: "PAID",
    occurredAt: new Date("2026-07-10T00:00:00.000Z"),
    customerId: "cust_1",
    supplierId: null,
    receiptId: null,
    taxTreatment: "taxable",
    vatInclusive: null,
    taxSnapshotCount: 1,
    confirmedReconciliationCount: 0,
    ...overrides,
  };
}

function expense(overrides: Partial<TaxAssistantInput["transactions"][number]> = {}): TaxAssistantInput["transactions"][number] {
  return {
    id: "expense",
    businessId: "biz_1",
    type: "EXPENSE",
    amount: 20_000,
    description: "Supplier expense",
    category: "Purchases",
    paymentStatus: "PAID",
    occurredAt: new Date("2026-07-11T00:00:00.000Z"),
    customerId: null,
    supplierId: "sup_1",
    receiptId: "receipt_1",
    taxTreatment: "taxable",
    vatInclusive: null,
    taxSnapshotCount: 0,
    confirmedReconciliationCount: 0,
    ...overrides,
  };
}
