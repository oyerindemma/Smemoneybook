import type {
  Account,
  Debt,
  InventoryItem,
  MonthlyReport,
  PaymentStatus,
  Transaction,
  TransactionType,
} from "@/lib/bookkeeping/transaction-engine";

export type QuickAction = "sale" | "expense" | "transfer";

export type RecordMoneyMode = "money" | "sale" | "expense" | "invoice";

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
  businessId?: string;
  destinationAccountId?: string;
  description: string;
  category?: string;
  paymentStatus: PaymentStatus;
  partyName?: string;
  partyPhone?: string;
  inventoryItemId?: string;
  inventoryQuantity?: number;
  invoiceItems?: Array<{
    inventoryItemId: string;
    quantity: number;
  }>;
  costOfGoods?: number;
  occurredAt?: string;
  dueAt?: string;
};

export type { Account, Debt, InventoryItem, MonthlyReport, Transaction };
