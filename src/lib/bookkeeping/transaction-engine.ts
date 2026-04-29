export type AccountType = "cash" | "bank" | "pos" | "mobile_money";
export type TransactionType = "sale" | "expense" | "transfer" | "adjustment";
export type PaymentStatus = "paid" | "credit" | "unpaid";
export type DebtType = "customer_owes_business" | "business_owes_supplier";

export type Account = {
  id: string;
  name: string;
  type: AccountType;
  balance: number;
};

export type TransactionInput = {
  idempotencyKey: string;
  type: TransactionType;
  amount: number;
  accountId: string;
  destinationAccountId?: string;
  description: string;
  category?: string;
  paymentStatus: PaymentStatus;
  partyName?: string;
  costOfGoods?: number;
  occurredAt?: string;
};

export type Transaction = TransactionInput & {
  id: string;
  profit: number;
  occurredAt: string;
};

export type Debt = {
  id: string;
  type: DebtType;
  partyName: string;
  amount: number;
  sourceTransactionId: string;
  dueAt?: string;
  status: "open" | "settled";
};

export type InventoryItem = {
  id: string;
  name: string;
  sku?: string;
  sellingPrice: number;
  costPrice: number;
  quantityOnHand: number;
  lowStockLevel: number;
  profitPerItem: number;
  isLowStock: boolean;
};

export type MonthlyReport = {
  businessName: string;
  month: number;
  year: number;
  vatRate: number;
  salesTotal: number;
  expensesTotal: number;
  profitTotal: number;
  vatTotal: number;
  customerDebtTotal: number;
  supplierDebtTotal: number;
  transactionCount: number;
  generatedAt: string;
};

export type AuditLog = {
  id: string;
  action: string;
  message: string;
  createdAt: string;
};

export type MoneybookState = {
  businessName: string;
  accounts: Account[];
  transactions: Transaction[];
  debts: Debt[];
  items: InventoryItem[];
  auditLogs: AuditLog[];
};

export function createDefaultBusiness(name: string): MoneybookState {
  return {
    businessName: name,
    accounts: [
      { id: "cash", name: "Cash", type: "cash", balance: 125000 },
      { id: "bank", name: "Bank", type: "bank", balance: 840000 },
      { id: "pos", name: "POS", type: "pos", balance: 180000 },
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
    throw new Error("This transaction has already been recorded.");
  }

  const account = state.accounts.find((item) => item.id === input.accountId);
  if (!account) {
    throw new Error("Choose a valid money account.");
  }

  const transaction: Transaction = {
    ...input,
    id: cryptoId("txn"),
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
  const income = state.transactions
    .filter((transaction) => transaction.type === "sale")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const expenses = state.transactions
    .filter((transaction) => transaction.type === "expense")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const profit =
    state.transactions.reduce((sum, transaction) => sum + transaction.profit, 0) -
    expenses;
  const balance = state.accounts.reduce((sum, account) => sum + account.balance, 0);
  const customerDebt = state.debts
    .filter((debt) => debt.type === "customer_owes_business")
    .reduce((sum, debt) => sum + debt.amount, 0);
  const supplierDebt = state.debts
    .filter((debt) => debt.type === "business_owes_supplier")
    .reduce((sum, debt) => sum + debt.amount, 0);

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
      amount: transaction.amount,
      sourceTransactionId: transaction.id,
      status: "open",
    };
  }

  if (transaction.type === "expense" && transaction.paymentStatus === "unpaid") {
    return {
      id: cryptoId("debt"),
      type: "business_owes_supplier",
      partyName: transaction.partyName || "Supplier",
      amount: transaction.amount,
      sourceTransactionId: transaction.id,
      status: "open",
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
