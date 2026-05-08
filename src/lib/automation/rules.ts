import type { InventoryItem, Debt } from "@/lib/bookkeeping/transaction-engine";

export type AutomationRule =
  | {
      type: "overdue_invoice_reminder";
      debtId: string;
      daysOverdue: number;
    }
  | {
      type: "low_stock_alert";
      itemId: string;
      quantityOnHand: number;
      lowStockLevel: number;
    }
  | {
      type: "daily_sales_summary";
      businessId: string;
      date: string;
    };

export function findOverdueReminderRules(debts: Debt[], now = new Date()): AutomationRule[] {
  return debts
    .filter((debt) => debt.type === "customer_owes_business" && debt.status === "open" && debt.dueAt)
    .map((debt) => ({
      debt,
      daysOverdue: Math.floor((now.getTime() - new Date(debt.dueAt as string).getTime()) / 86_400_000),
    }))
    .filter(({ daysOverdue }) => daysOverdue > 3)
    .map(({ debt, daysOverdue }) => ({
      type: "overdue_invoice_reminder",
      debtId: debt.id,
      daysOverdue,
    }));
}

export function findLowStockRules(items: InventoryItem[]): AutomationRule[] {
  return items
    .filter((item) => item.quantityOnHand <= item.lowStockLevel)
    .map((item) => ({
      type: "low_stock_alert",
      itemId: item.id,
      quantityOnHand: item.quantityOnHand,
      lowStockLevel: item.lowStockLevel,
    }));
}

export function shouldSendDailySummary(now = new Date(), timezone = "Africa/Lagos") {
  const hour = Number(
    new Intl.DateTimeFormat("en-NG", {
      timeZone: timezone,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now),
  );

  return hour >= 18 && hour <= 21;
}
