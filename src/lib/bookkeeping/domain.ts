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
  destinationAccountDelta?: number;
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
  const isTransfer = type === "transfer";
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
    accountDelta: isTransfer ? -amount : isPaidSale ? amount : isPaidExpense ? -amount : 0,
    destinationAccountDelta: isTransfer ? amount : undefined,
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

export function createReversalMovement(original: {
  type: TransactionType;
  amount: number;
  profit: number;
  paymentStatus: PaymentStatus;
  description: string;
  accountId: string;
  destinationAccountId?: string | null;
}): MoneyMovement {
  const accountDelta = getOriginalAccountDelta(original) * -1;

  return {
    transaction: {
      type: "adjustment",
      paymentStatus: "paid",
      amount: original.amount,
      costOfGoods: 0,
      profit: -original.profit,
      description: `Reversal: ${original.description}`,
      category: "Reversal",
      occurredAt: new Date(),
    },
    accountDelta,
    destinationAccountDelta:
      original.type === "transfer" && original.destinationAccountId
        ? original.amount * -1
        : undefined,
  };
}

export function buildDuplicateFingerprint(
  input: TransactionInput,
  occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date(),
) {
  const minute = new Date(occurredAt);
  minute.setSeconds(0, 0);

  return [
    input.type,
    input.amount.toFixed(2),
    input.accountId,
    input.destinationAccountId ?? "",
    input.inventoryItemId ?? "",
    input.inventoryQuantity ?? "",
    JSON.stringify(input.invoiceItems ?? []),
    input.paymentStatus,
    JSON.stringify(input.paymentAllocations ?? []),
    input.description.trim().toLowerCase(),
    input.category?.trim().toLowerCase() ?? "",
    minute.toISOString(),
  ].join("|");
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

  if (input.type === "transfer" && !input.destinationAccountId) {
    throw new Error("Choose where the transfer is going.");
  }

  if (input.type === "transfer" && input.paymentStatus !== "paid") {
    throw new Error("Transfers must move money now.");
  }

  if (input.type === "transfer" && input.destinationAccountId === input.accountId) {
    throw new Error("Choose two different accounts for a transfer.");
  }

  if (input.costOfGoods !== undefined && input.costOfGoods < 0) {
    throw new Error("Cost of goods cannot be negative.");
  }

  if (input.occurredAt && Number.isNaN(Date.parse(input.occurredAt))) {
    throw new Error("Choose a valid transaction date.");
  }

  if (input.paymentAllocations?.length) {
    if (input.type !== "sale") {
      throw new Error("Split payments are only available for sales.");
    }

    const paidTotal = input.paymentAllocations
      .filter((allocation) => allocation.method !== "credit")
      .reduce((sum, allocation) => sum + allocation.amount, 0);

    if (paidTotal - input.amount > 0.01) {
      throw new Error("Payment amounts cannot be more than the sale total.");
    }
  }
}

function getOriginalAccountDelta(original: {
  type: TransactionType;
  amount: number;
  paymentStatus: PaymentStatus;
}) {
  if (original.type === "sale" && original.paymentStatus === "paid") {
    return original.amount;
  }

  if (original.type === "expense" && original.paymentStatus === "paid") {
    return -original.amount;
  }

  if (original.type === "transfer") {
    return -original.amount;
  }

  return 0;
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
