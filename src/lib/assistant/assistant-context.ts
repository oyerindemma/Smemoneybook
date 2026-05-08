import { DebtStatus, DebtType, PaymentStatus, TransactionType } from "@prisma/client";
import { getMonthlyReport } from "@/lib/bookkeeping/persistence";
import { getPrisma } from "@/lib/prisma";
import type { AssistantContext } from "@/lib/assistant/assistant-types";

export async function getBusinessAssistantContext(businessId: string): Promise<AssistantContext> {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const tomorrow = new Date(todayStart);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [business, todayTransactions, debts, lowStockItems, report] = await Promise.all([
    getPrisma().business.findUniqueOrThrow({
      where: { id: businessId },
      select: { id: true, name: true },
    }),
    getPrisma().transaction.findMany({
      where: {
        businessId,
        occurredAt: { gte: todayStart, lt: tomorrow },
        reversalTransaction: null,
      },
      select: { type: true, amount: true, profit: true },
    }),
    getPrisma().debt.findMany({
      where: { businessId, status: DebtStatus.OPEN },
      include: {
        customer: { select: { name: true } },
        supplier: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    getPrisma().inventoryItem.findMany({
      where: { businessId },
      orderBy: { updatedAt: "desc" },
      select: {
        name: true,
        quantityOnHand: true,
        lowStockLevel: true,
      },
    }),
    getMonthlyReport({
      businessId,
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      period: "month",
    }),
  ]);

  const income = todayTransactions
    .filter((transaction) => transaction.type === TransactionType.SALE)
    .reduce((sum, transaction) => sum + transaction.amount.toNumber(), 0);
  const expenses = todayTransactions
    .filter((transaction) => transaction.type === TransactionType.EXPENSE)
    .reduce((sum, transaction) => sum + transaction.amount.toNumber(), 0);
  const profit = todayTransactions.reduce((sum, transaction) => sum + transaction.profit.toNumber(), 0);

  const customerDebts = debts.filter((debt) => debt.type === DebtType.CUSTOMER_OWES_BUSINESS);
  const supplierDebts = debts.filter((debt) => debt.type === DebtType.BUSINESS_OWES_SUPPLIER);
  const customerDebtTotal = customerDebts.reduce(
    (sum, debt) => sum + debt.amount.minus(debt.paidAmount).toNumber(),
    0,
  );
  const supplierDebtTotal = supplierDebts.reduce(
    (sum, debt) => sum + debt.amount.minus(debt.paidAmount).toNumber(),
    0,
  );
  const low = lowStockItems.filter((item) => item.quantityOnHand <= item.lowStockLevel);
  const unpaidInvoices = customerDebts.filter((debt) => debt.sourceTransactionId);

  return {
    businessId: business.id,
    businessName: business.name,
    currency: "NGN",
    today: {
      income,
      expenses,
      profit,
      transactionCount: todayTransactions.length,
    },
    debts: {
      customerDebtTotal,
      supplierDebtTotal,
      overdueCount: customerDebts.filter((debt) => debt.dueAt && debt.dueAt < now).length,
      topDebtors: customerDebts.slice(0, 5).map((debt) => ({
        name: debt.customer?.name ?? debt.supplier?.name ?? "Customer",
        amount: debt.amount.minus(debt.paidAmount).toNumber(),
        overdue: Boolean(debt.dueAt && debt.dueAt < now),
      })),
    },
    stock: {
      lowStockCount: low.length,
      lowStockItems: low.slice(0, 8),
    },
    invoices: {
      unpaidCount: unpaidInvoices.length,
      unpaidTotal: customerDebtTotal,
    },
    report: {
      monthIncome: report.salesTotal,
      monthExpenses: report.expensesTotal,
      monthProfit: report.profitTotal,
      vatEstimate: report.vatTotal,
      transactionCount: report.transactionCount,
    },
  };
}

export function summarizePaymentStatus(status: PaymentStatus) {
  return status.toLowerCase();
}
