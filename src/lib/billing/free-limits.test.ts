import { beforeEach, describe, expect, it, vi } from "vitest";

const hasAnyMinimumPlan = vi.fn();
const hasMinimumPlan = vi.fn();
const businessMemberCount = vi.fn();
const transactionCount = vi.fn();
const transactionFindMany = vi.fn();
const customerCount = vi.fn();
const supplierCount = vi.fn();
const inventoryItemCount = vi.fn();

vi.mock("@/lib/billing/subscriptions", () => ({
  hasAnyMinimumPlan,
  hasMinimumPlan,
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    businessMember: { count: businessMemberCount },
    transaction: { count: transactionCount, findMany: transactionFindMany },
    customer: { count: customerCount },
    supplier: { count: supplierCount },
    inventoryItem: { count: inventoryItemCount },
  }),
}));

describe("free usage limits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasAnyMinimumPlan.mockResolvedValue(false);
    hasMinimumPlan.mockResolvedValue(false);
    businessMemberCount.mockResolvedValue(0);
    transactionCount.mockResolvedValue(0);
    transactionFindMany.mockResolvedValue([]);
    customerCount.mockResolvedValue(0);
    supplierCount.mockResolvedValue(0);
    inventoryItemCount.mockResolvedValue(0);
  });

  it("blocks extra businesses on Free but not paid plans", async () => {
    const { requireBusinessWorkspaceAllowance } = await import("@/lib/billing/free-limits");

    businessMemberCount.mockResolvedValueOnce(1);
    const blocked = await requireBusinessWorkspaceAllowance("user_1");
    expect(blocked?.status).toBe(402);

    hasAnyMinimumPlan.mockResolvedValueOnce(true);
    const allowed = await requireBusinessWorkspaceAllowance("user_1");
    expect(allowed).toBeNull();
  });

  it("blocks Free users at the transaction and active-day limits", async () => {
    const { requireTransactionAllowance } = await import("@/lib/billing/free-limits");

    transactionCount.mockResolvedValueOnce(30);
    const countBlocked = await requireTransactionAllowance("user_1", "biz_1");
    expect(countBlocked?.status).toBe(402);

    transactionCount.mockResolvedValueOnce(2);
    transactionFindMany.mockResolvedValueOnce(
      Array.from({ length: 14 }, (_, index) => ({
        occurredAt: new Date(Date.UTC(2026, 0, index + 1)),
      })),
    );
    const dayBlocked = await requireTransactionAllowance("user_1", "biz_1");
    expect(dayBlocked?.status).toBe(402);
  });

  it("blocks Free users at people and inventory limits", async () => {
    const { requirePeopleAllowance, requireInventoryItemAllowance } = await import(
      "@/lib/billing/free-limits"
    );

    customerCount.mockResolvedValueOnce(6);
    supplierCount.mockResolvedValueOnce(4);
    const peopleBlocked = await requirePeopleAllowance("user_1", "biz_1");
    expect(peopleBlocked?.status).toBe(402);

    inventoryItemCount.mockResolvedValueOnce(10);
    const stockBlocked = await requireInventoryItemAllowance("user_1", "biz_1");
    expect(stockBlocked?.status).toBe(402);
  });
});
