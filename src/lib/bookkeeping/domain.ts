import type {
  DebtType,
  PaymentStatus,
  TransactionInput,
  TransactionType,
} from "@/lib/bookkeeping/transaction-engine";

export type MoneyMovement = {
  transaction: {
    type: TransactionType;
    paymentStatus: PaymentStatus;
    amount: number;
    costOfGoods: number;
    profit: number;
    description: string;
    category?: string;
    occurredAt: Date;
  };
  accountDelta: number;
  debt?: {
    type: DebtType;
    amount: number;
  };
};

export function createMoneyMovement(input: TransactionInput, now = new Date()): MoneyMovement {
  validateMoneyInput(input);

  const costOfGoods = input.costOfGoods ?? 0;
  const amount = input.amount;
  const type = input.type;
  const paymentStatus = input.paymentStatus;
  const isPaidSale = type === "sale" && paymentStatus === "paid";
  const isPaidExpense = type === "expense" && paymentStatus === "paid";
  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : now;

  return {
    transaction: {
      type,
      paymentStatus,
      amount,
      costOfGoods,
      profit: type === "sale" ? amount - costOfGoods : 0,
      description: input.description?.trim() || "Activity",
      category: input.category?.trim() || undefined,
      occurredAt,
    },
    accountDelta: isPaidSale ? amount : isPaidExpense ? -amount : 0,
    debt: getDebtInstruction(input),
  };
}

export function createDebtCollectionMovement(amount: number, now = new Date()): MoneyMovement {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Debt collection amount must be greater than zero.");
  }

  return {
    transaction: {
      type: "sale",
      paymentStatus: "paid",
      amount,
      costOfGoods: 0,
      profit: amount,
      description: "Debt collection",
      occurredAt: now,
    },
    accountDelta: amount,
  };
}

function validateMoneyInput(input: TransactionInput) {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("Amount must be greater than zero.");
  }

  if (!input.accountId) {
    throw new Error("Choose a valid money account.");
  }

  if (input.type === "sale" && input.paymentStatus === "unpaid") {
    throw new Error("Sales are either paid now or customer credit.");
  }

  if (input.type === "expense" && input.paymentStatus === "credit") {
    throw new Error("Expenses are either paid now or supplier bills.");
  }

  if (input.costOfGoods !== undefined && input.costOfGoods < 0) {
    throw new Error("Cost of goods cannot be negative.");
  }

  if (input.occurredAt && Number.isNaN(Date.parse(input.occurredAt))) {
    throw new Error("Choose a valid transaction date.");
  }
}

function getDebtInstruction(input: TransactionInput): MoneyMovement["debt"] {
  if (input.type === "sale" && input.paymentStatus === "credit") {
    return {
      type: "customer_owes_business",
      amount: input.amount,
    };
  }

  if (input.type === "expense" && input.paymentStatus === "unpaid") {
    return {
      type: "business_owes_supplier",
      amount: input.amount,
    };
  }

  return undefined;
}
