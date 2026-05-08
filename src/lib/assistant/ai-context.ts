import { getDashboardState } from "@/lib/bookkeeping/persistence";

export async function buildAssistantBusinessContext(businessId: string) {
  const state = await getDashboardState(businessId);

  return {
    businessId: state.businessId,
    businessName: state.businessName,
    debts: state.debts.map((debt) => ({
      id: debt.id,
      partyName: debt.partyName,
      remainingAmount: debt.remainingAmount,
      isOverdue: debt.isOverdue,
    })),
    lowStockItems: state.items.filter((item) => item.isLowStock || item.quantityOnHand <= 0),
    recentTransactions: state.transactions.slice(0, 20),
  };
}
