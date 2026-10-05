import { beforeEach, describe, expect, it, vi } from "vitest";

const createAudit = vi.fn();
const getBusinessAccess = vi.fn();

vi.mock("@/lib/assistant/assistant-context", () => ({
  getBusinessAssistantContext: vi.fn().mockResolvedValue({
    businessId: "biz_1",
    businessName: "Hesed Business Solution",
    currency: "NGN",
    generatedAt: "2026-07-19T05:00:00.000Z",
    periods: {
      today: {
        start: "2026-07-19T00:00:00.000Z",
        end: "2026-07-20T00:00:00.000Z",
        label: "today",
      },
      month: {
        start: "2026-07-01T00:00:00.000Z",
        end: "2026-08-01T00:00:00.000Z",
        label: "this month",
      },
    },
    today: { income: 105000, expenses: 0, profit: 105000, transactionCount: 1 },
    debts: {
      customerDebtTotal: 5000,
      supplierDebtTotal: 0,
      overdueCount: 1,
      topDebtors: [{ name: "John", amount: 5000, overdue: true }],
    },
    stock: {
      lowStockCount: 1,
      lowStockItems: [{ name: "Clothes", quantityOnHand: 2, lowStockLevel: 5 }],
    },
    invoices: { unpaidCount: 1, unpaidTotal: 5000 },
    report: {
      monthIncome: 105000,
      monthExpenses: 0,
      monthProfit: 105000,
      vatEstimate: 7875,
      transactionCount: 1,
    },
  }),
}));

vi.mock("@/lib/operations/access", () => ({
  getBusinessAccess,
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    auditLog: {
      create: createAudit,
    },
  }),
}));

describe("assistant read-only tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBusinessAccess.mockResolvedValue({ businessId: "biz_1" });
  });

  it("executes read-only summary tools and audits usage", async () => {
    const { executeAssistantTool } = await import("@/lib/assistant/assistant-tools");
    const result = await executeAssistantTool({
      toolName: "get_today_summary",
      businessId: "biz_1",
      userId: "user_1",
    });

    expect(result).toMatchObject({ ok: true, tool: "get_today_summary" });
    expect(result.citations?.[0]).toMatchObject({
      metricVersion: "phase3b-advisor-v1",
      kind: "recorded",
      sourceTables: ["Transaction"],
    });
    expect(createAudit).toHaveBeenCalled();
  });

  it("refuses read-only tools when the user cannot access the business", async () => {
    getBusinessAccess.mockResolvedValue(null);
    const { executeAssistantTool } = await import("@/lib/assistant/assistant-tools");
    const result = await executeAssistantTool({
      toolName: "get_today_summary",
      businessId: "biz_2",
      userId: "user_1",
    });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/access/i);
    expect(createAudit).not.toHaveBeenCalled();
  });

  it("blocks mutation tools behind pending confirmation", async () => {
    const { executeAssistantTool } = await import("@/lib/assistant/assistant-tools");
    const result = await executeAssistantTool({
      toolName: "record_payment",
      businessId: "biz_1",
      userId: "user_1",
    });

    expect(result.ok).toBe(false);
    expect(result.pendingActionRequired).toBe(true);
    expect(createAudit).not.toHaveBeenCalled();
  });
});
