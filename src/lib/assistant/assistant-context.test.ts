import { beforeEach, describe, expect, it, vi } from "vitest";

const findBusiness = vi.fn();
const findTransactions = vi.fn();
const findDebts = vi.fn();
const findItems = vi.fn();
const getMonthlyReport = vi.fn();

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    business: { findUniqueOrThrow: findBusiness },
    transaction: { findMany: findTransactions },
    debt: { findMany: findDebts },
    inventoryItem: { findMany: findItems },
  }),
}));

vi.mock("@/lib/bookkeeping/persistence", () => ({
  getMonthlyReport,
}));

const decimal = (value: number) => ({ toNumber: () => value });

describe("assistant context builder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findBusiness.mockResolvedValue({ id: "biz_1", name: "Demo Shop" });
    findTransactions.mockResolvedValue([
      { type: "SALE", amount: decimal(105000), profit: decimal(85000) },
      { type: "EXPENSE", amount: decimal(15000), profit: decimal(0) },
    ]);
    findDebts.mockResolvedValue([
      {
        type: "CUSTOMER_OWES_BUSINESS",
        amount: { minus: () => decimal(5000) },
        paidAmount: decimal(0),
        dueAt: new Date("2026-05-01"),
        sourceTransactionId: "txn_1",
        customer: { name: "John" },
        supplier: null,
      },
    ]);
    findItems.mockResolvedValue([{ name: "Clothes", quantityOnHand: 2, lowStockLevel: 5 }]);
    getMonthlyReport.mockResolvedValue({
      salesTotal: 105000,
      expensesTotal: 15000,
      profitTotal: 90000,
      vatTotal: 7875,
      transactionCount: 2,
    });
  });

  it("returns minimal safe business context", async () => {
    const { getBusinessAssistantContext } = await import("@/lib/assistant/assistant-context");
    const context = await getBusinessAssistantContext("biz_1");

    expect(context.businessName).toBe("Demo Shop");
    expect(context.today.income).toBe(105000);
    expect(context.debts.customerDebtTotal).toBe(5000);
    expect(context.stock.lowStockItems).toEqual([{ name: "Clothes", quantityOnHand: 2, lowStockLevel: 5 }]);
    expect(JSON.stringify(context)).not.toContain("password");
  });
});
