import type { BillingFeature, BillingPlanId } from "@/lib/billing/plans";

export type AccountType = "cash" | "bank" | "pos" | "mobile_money";
export type TransactionType = "sale" | "expense" | "transfer" | "adjustment";
export type PaymentStatus = "paid" | "credit" | "unpaid";
export type DebtType = "customer_owes_business" | "business_owes_supplier";
export type PaymentMethod =
  | "cash"
  | "bank_transfer"
  | "pos_terminal"
  | "card"
  | "wallet"
  | "credit"
  | "other";
export type StockAdjustmentType =
  | "stock_in"
  | "stock_out"
  | "damaged"
  | "expired"
  | "lost"
  | "theft"
  | "count_correction"
  | "personal_use"
  | "promotional_giveaway"
  | "supplier_return"
  | "customer_return"
  | "other";

export type InvoiceLineItemInput = {
  inventoryItemId: string;
  quantity: number;
  discount?: number;
};

export type InvoiceLineItem = InvoiceLineItemInput & {
  name: string;
  stockQuantity?: number;
  unitLabel?: string;
  unitPrice: number;
  total: number;
};

export type Account = {
  id: string;
  name: string;
  type: AccountType;
  openingBalance: number;
  balance: number;
};

export type TransactionInput = {
  idempotencyKey: string;
  locationId?: string;
  type: TransactionType;
  amount: number;
  accountId: string;
  destinationAccountId?: string;
  description: string;
  category?: string;
  paymentStatus: PaymentStatus;
  partyName?: string;
  partyPhone?: string;
  inventoryItemId?: string;
  inventoryQuantity?: number;
  invoiceItems?: InvoiceLineItemInput[];
  costOfGoods?: number;
  occurredAt?: string;
  dueAt?: string;
  paymentAllocations?: PaymentAllocationInput[];
};

export type PaymentAllocationInput = {
  method: PaymentMethod;
  amount: number;
  accountId?: string;
  note?: string;
};

export type Transaction = Omit<TransactionInput, "invoiceItems"> & {
  id: string;
  locationName?: string;
  invoiceItems?: InvoiceLineItem[];
  payments?: PaymentAllocationInput[];
  profit: number;
  occurredAt: string;
  isReversal?: boolean;
  reversedByTransactionId?: string;
  reversesTransactionId?: string;
  reversesTransactionType?: TransactionType;
};

export type Debt = {
  id: string;
  type: DebtType;
  partyName: string;
  partyPhone?: string;
  amount: number;
  paidAmount: number;
  remainingAmount: number;
  sourceTransactionId: string;
  dueAt?: string;
  status: "open" | "settled";
  isOverdue: boolean;
  events: DebtEvent[];
};

export type DebtEvent = {
  id: string;
  type: "reminder" | "customer_collection" | "supplier_settlement" | "note";
  amount?: number;
  note?: string;
  channel?: string;
  createdAt: string;
};

export type InventoryItem = {
  id: string;
  name: string;
  sku?: string;
  barcode?: string;
  internalCode?: string;
  unitId?: string;
  unitName?: string;
  unitSingular?: string;
  unitPlural?: string;
  allowsDecimalQuantity?: boolean;
  baseUnitId?: string;
  baseUnitName?: string;
  baseUnitSingular?: string;
  baseUnitPlural?: string;
  baseUnitAllowsDecimal?: boolean;
  sellingUnitId?: string;
  sellingUnitName?: string;
  sellingUnitSingular?: string;
  sellingUnitPlural?: string;
  sellingUnitAllowsDecimal?: boolean;
  conversionFactor?: number;
  categoryId?: string;
  categoryName?: string;
  brandId?: string;
  brandName?: string;
  sellingPrice: number;
  costPrice: number;
  quantityOnHand: number;
  quantityOnHandDecimal?: number;
  locationId?: string;
  locationName?: string;
  lowStockLevel: number;
  lowStockLevelDecimal?: number;
  profitPerItem: number;
  isLowStock: boolean;
  movements: InventoryMovement[];
};

export type InventoryMovement = {
  id: string;
  locationId?: string;
  locationName?: string;
  type: "stock_in" | "stock_out" | "adjustment";
  quantity: number;
  quantityDecimal?: number;
  beforeQuantity?: number;
  afterQuantity?: number;
  adjustmentType?: StockAdjustmentType;
  reason?: string;
  note?: string;
  createdAt: string;
};

export type ReceiptConfig = {
  logoUrl?: string;
  address?: string;
  phone?: string;
  email?: string;
  taxId?: string;
  footerMessage?: string;
  includePoweredBy: boolean;
  defaultPaperSize: "58mm" | "80mm" | "pdf";
};

export type MonthlyReport = {
  businessName: string;
  locationId?: string;
  locationName?: string;
  period: "day" | "week" | "month";
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  month: number;
  year: number;
  vatRate: number;
  salesTotal: number;
  cashReceivedTotal: number;
  creditSalesTotal: number;
  expensesTotal: number;
  profitTotal: number;
  taxableSalesTotal: number;
  nonTaxableSalesTotal: number;
  vatTotal: number;
  customerDebtTotal: number;
  supplierDebtTotal: number;
  receivablesAging: AgingBuckets;
  payablesAging: AgingBuckets;
  topProduct?: {
    name: string;
    quantity: number;
    salesTotal: number;
    profitTotal: number;
  };
  categoryBreakdown: ReportBreakdown[];
  brandBreakdown: ReportBreakdown[];
  insights: string[];
  transactionCount: number;
  generatedAt: string;
};

export type ReportBreakdown = {
  name: string;
  quantity: number;
  salesTotal: number;
  profitTotal: number;
};

export type AgingBuckets = {
  current: number;
  days31To60: number;
  days61To90: number;
  over90: number;
};

export type AuditLog = {
  id: string;
  action: string;
  message: string;
  createdAt: string;
};

export type MoneybookState = {
  businessId?: string;
  businessName: string;
  businessCategory?: string;
  businessType?: string;
  country?: string;
  currency?: string;
  onboardingCompleted?: boolean;
  businesses?: Array<{
    id: string;
    name: string;
    role: "owner" | "accountant" | "staff";
  }>;
  locations?: Array<{
    id: string;
    name: string;
    type: string;
    isDefault: boolean;
  }>;
  selectedLocationId?: string;
  selectedLocationName?: string;
  businessRole?: "owner" | "accountant" | "staff";
  permissions?: {
    canManageStaff: boolean;
    canManageAccounts: boolean;
    canSaveReports: boolean;
    canExportBackup: boolean;
    canViewLocations?: boolean;
    canManageLocations?: boolean;
    canViewTransfers?: boolean;
    canManageTransfers?: boolean;
    canApproveTransfers?: boolean;
    canReceiveTransfers?: boolean;
    canManageTax?: boolean;
    canViewStaffPerformance?: boolean;
    canExportStaffPerformance?: boolean;
  };
  billing?: {
    planId: BillingPlanId | "free";
    planName: string;
    features: BillingFeature[];
  };
  accounts: Account[];
  transactions: Transaction[];
  debts: Debt[];
  items: InventoryItem[];
  receiptConfig?: ReceiptConfig;
  auditLogs: AuditLog[];
};

export function createDefaultBusiness(name: string): MoneybookState {
  return {
    businessId: "demo",
    businessName: name,
    businessCategory: "Retail",
    businessType: "Retail",
    country: "NG",
    currency: "NGN",
    onboardingCompleted: true,
    businesses: [{ id: "demo", name, role: "owner" }],
    businessRole: "owner",
    permissions: {
      canManageStaff: true,
      canManageAccounts: true,
      canSaveReports: true,
      canExportBackup: true,
      canViewLocations: true,
      canManageLocations: true,
      canViewTransfers: true,
      canManageTransfers: true,
      canApproveTransfers: true,
      canReceiveTransfers: true,
      canManageTax: true,
      canViewStaffPerformance: true,
      canExportStaffPerformance: true,
    },
    billing: {
      planId: "pro",
      planName: "Pro",
      features: [
        "basic_exports",
        "advanced_reports",
        "multi_location",
        "warehouse_transfers",
        "professional_pdf_exports",
        "invoice_branding",
        "tax_management",
        "granular_permissions",
        "team_management",
        "audit_tools",
      ],
    },
    accounts: [
      { id: "cash", name: "Cash", type: "cash", openingBalance: 125000, balance: 125000 },
      { id: "bank", name: "Bank", type: "bank", openingBalance: 840000, balance: 840000 },
      { id: "pos", name: "POS", type: "pos", openingBalance: 180000, balance: 180000 },
    ],
    transactions: [],
    debts: [],
    items: [],
    auditLogs: [
      {
        id: cryptoId("audit"),
        action: "business.created",
        message: `${name} was created with Cash, Bank and POS accounts.`,
        createdAt: new Date().toISOString(),
      },
    ],
  };
}

export function recordTransaction(
  state: MoneybookState,
  input: TransactionInput,
): MoneybookState {
  if (input.amount <= 0) {
    throw new Error("Amount must be greater than zero.");
  }

  if (
    state.transactions.some(
      (transaction) => transaction.idempotencyKey === input.idempotencyKey,
    )
  ) {
    return state;
  }

  const account = state.accounts.find((item) => item.id === input.accountId);
  if (!account) {
    throw new Error("Choose a valid money account.");
  }

  if (input.type === "transfer") {
    if (!input.destinationAccountId) {
      throw new Error("Choose where the transfer is going.");
    }

    if (input.destinationAccountId === input.accountId) {
      throw new Error("Choose two different accounts for a transfer.");
    }
  }

  const transaction: Transaction = {
    ...input,
    id: cryptoId("txn"),
    invoiceItems: input.invoiceItems?.map((item) => ({
      ...item,
      name: "Product",
      unitPrice: 0,
      total: 0,
    })),
    profit: input.type === "sale" ? input.amount - (input.costOfGoods ?? 0) : 0,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
  };

  const accounts = state.accounts.map((item) =>
    applyAccountMovement(item, transaction),
  );

  const transferAccounts =
    transaction.type === "transfer" && transaction.destinationAccountId
      ? accounts.map((item) =>
          item.id === transaction.destinationAccountId
            ? { ...item, balance: item.balance + transaction.amount }
            : item,
        )
      : accounts;

  const debt = createDebtFromTransaction(transaction);
  const auditLog: AuditLog = {
    id: cryptoId("audit"),
    action: `transaction.${transaction.type}`,
    message: `${humanTransactionType(transaction.type)} recorded for ${formatNaira(transaction.amount)}.`,
    createdAt: new Date().toISOString(),
  };

  return {
    ...state,
    accounts: transferAccounts,
    transactions: [transaction, ...state.transactions],
    debts: debt ? [debt, ...state.debts] : state.debts,
    auditLogs: [auditLog, ...state.auditLogs],
  };
}

export function getDashboardSummary(state: MoneybookState) {
  const activeTransactions = state.transactions.filter(
    (transaction) => !transaction.reversedByTransactionId,
  );
  const income = activeTransactions.reduce((sum, transaction) => {
    if (transaction.type === "sale") {
      return sum + transaction.amount;
    }

    if (transaction.type === "adjustment" && transaction.reversesTransactionType === "sale") {
      return sum - transaction.amount;
    }

    return sum;
  }, 0);
  const expenses = activeTransactions.reduce((sum, transaction) => {
    if (transaction.type === "expense") {
      return sum + transaction.amount;
    }

    if (
      transaction.type === "adjustment" &&
      transaction.reversesTransactionType === "expense"
    ) {
      return sum - transaction.amount;
    }

    return sum;
  }, 0);
  const profit =
    activeTransactions.reduce((sum, transaction) => sum + transaction.profit, 0) -
    expenses;
  const balance = state.accounts.reduce((sum, account) => sum + account.balance, 0);
  const customerDebt = state.debts
    .filter((debt) => debt.type === "customer_owes_business")
    .reduce((sum, debt) => sum + debt.remainingAmount, 0);
  const supplierDebt = state.debts
    .filter((debt) => debt.type === "business_owes_supplier")
    .reduce((sum, debt) => sum + debt.remainingAmount, 0);

  return {
    balance,
    income,
    expenses,
    profit,
    customerDebt,
    supplierDebt,
  };
}

export function formatNaira(amount: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}

function applyAccountMovement(account: Account, transaction: Transaction): Account {
  if (account.id !== transaction.accountId) {
    return account;
  }

  if (transaction.type === "sale" && transaction.paymentStatus === "paid") {
    return { ...account, balance: account.balance + transaction.amount };
  }

  if (transaction.type === "expense" && transaction.paymentStatus === "paid") {
    return { ...account, balance: account.balance - transaction.amount };
  }

  if (transaction.type === "transfer") {
    return { ...account, balance: account.balance - transaction.amount };
  }

  return account;
}

function createDebtFromTransaction(transaction: Transaction): Debt | null {
  if (transaction.type === "sale" && transaction.paymentStatus === "credit") {
    return {
      id: cryptoId("debt"),
      type: "customer_owes_business",
      partyName: transaction.partyName || "Customer",
      partyPhone: transaction.partyPhone,
      amount: transaction.amount,
      paidAmount: 0,
      remainingAmount: transaction.amount,
      sourceTransactionId: transaction.id,
      dueAt: transaction.dueAt,
      status: "open",
      isOverdue: false,
      events: [],
    };
  }

  if (transaction.type === "expense" && transaction.paymentStatus === "unpaid") {
    return {
      id: cryptoId("debt"),
      type: "business_owes_supplier",
      partyName: transaction.partyName || "Supplier",
      partyPhone: transaction.partyPhone,
      amount: transaction.amount,
      paidAmount: 0,
      remainingAmount: transaction.amount,
      sourceTransactionId: transaction.id,
      dueAt: transaction.dueAt,
      status: "open",
      isOverdue: false,
      events: [],
    };
  }

  return null;
}

function humanTransactionType(type: TransactionType) {
  return {
    sale: "Sale",
    expense: "Expense",
    transfer: "Transfer",
    adjustment: "Adjustment",
  }[type];
}

function cryptoId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
