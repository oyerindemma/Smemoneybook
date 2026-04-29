import type {
  Account,
  Debt,
  InventoryItem,
  MonthlyReport,
  PaymentStatus,
  Transaction,
  TransactionType,
} from "@/lib/bookkeeping/transaction-engine";

export type QuickAction = "sale" | "expense";

export type DashboardSummary = {
  balance: number;
  income: number;
  expenses: number;
  profit: number;
  customerDebt: number;
  supplierDebt: number;
};

export type CaptureFormData = {
  type: TransactionType;
  amount: number;
  accountId: string;
  description: string;
  paymentStatus: PaymentStatus;
  partyName?: string;
};

export type { Account, Debt, InventoryItem, MonthlyReport, Transaction };
