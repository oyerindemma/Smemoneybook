import {
  AccountType,
  DebtStatus,
  DebtType,
  InventoryMovementType,
  PaymentStatus,
  Prisma,
  PrismaClient,
  Role,
  TransactionType,
} from "@prisma/client";
import type {
  Account,
  Debt,
  InventoryItem,
  MonthlyReport,
  MoneybookState,
  Transaction,
  TransactionInput,
} from "@/lib/bookkeeping/transaction-engine";
import {
  createDebtCollectionMovement,
  createMoneyMovement,
  type MoneyMovement,
} from "@/lib/bookkeeping/domain";
import { formatNaira } from "@/lib/bookkeeping/transaction-engine";
import { getPrisma } from "@/lib/prisma";

type PrismaTransaction = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

const defaultAccounts = [
  { name: "Cash", type: AccountType.CASH },
  { name: "Bank", type: AccountType.BANK },
  { name: "POS", type: AccountType.POS },
] as const;

export async function createBusinessForUser(userId: string, name: string) {
  return getPrisma().business.create({
    data: {
      name,
      members: {
        create: {
          userId,
          role: Role.OWNER,
        },
      },
      accounts: {
        create: defaultAccounts.map((account) => ({
          name: account.name,
          type: account.type,
          openingBalance: 0,
          balance: 0,
        })),
      },
      auditLogs: {
        create: {
          actorId: userId,
          action: "business.created",
          message: `${name} was created with Cash, Bank and POS accounts.`,
        },
      },
    },
    include: { accounts: true },
  });
}

export async function getFirstBusinessForUser(userId: string) {
  const membership = await getPrisma().businessMember.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: { business: true },
  });

  return membership?.business ?? null;
}

export async function getDashboardStateForUser(
  userId: string,
): Promise<MoneybookState | null> {
  const business = await getFirstBusinessForUser(userId);

  if (!business) {
    return null;
  }

  return getDashboardState(business.id);
}

export async function getDashboardState(businessId: string): Promise<MoneybookState> {
  const business = await getPrisma().business.findUniqueOrThrow({
    where: { id: businessId },
    include: {
      accounts: { orderBy: { createdAt: "asc" } },
      transactions: { orderBy: { occurredAt: "desc" }, take: 50 },
      debts: {
        where: { status: DebtStatus.OPEN },
        include: { customer: true, supplier: true },
        orderBy: { createdAt: "desc" },
      },
      items: { orderBy: { updatedAt: "desc" } },
      auditLogs: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });

  return {
    businessName: business.name,
    accounts: business.accounts.map(mapAccount),
    transactions: business.transactions.map(mapTransaction),
    debts: business.debts.map(mapDebt),
    items: business.items.map(mapInventoryItem),
    auditLogs: business.auditLogs.map((auditLog) => ({
      id: auditLog.id,
      action: auditLog.action,
      message: auditLog.message,
      createdAt: auditLog.createdAt.toISOString(),
    })),
  };
}

export async function recordPersistentTransaction({
  userId,
  input,
}: {
  userId: string;
  input: TransactionInput;
}) {
  const business = await getFirstBusinessForUser(userId);

  if (!business) {
    throw new Error("Create a business before recording money.");
  }

  await getPrisma().$transaction(async (tx) => {
    const account = await tx.account.findFirst({
      where: { id: input.accountId, businessId: business.id },
    });

    if (!account) {
      throw new Error("Choose a valid money account.");
    }

    const existing = await tx.transaction.findUnique({
      where: {
        businessId_idempotencyKey: {
          businessId: business.id,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });

    if (existing) {
      return;
    }

    const movement = createMoneyMovement(input);
    const type = toDbTransactionType(movement.transaction.type);
    const paymentStatus = toDbPaymentStatus(movement.transaction.paymentStatus);
    const amount = new Prisma.Decimal(movement.transaction.amount);
    const costOfGoods = new Prisma.Decimal(movement.transaction.costOfGoods);
    const profit = new Prisma.Decimal(movement.transaction.profit);

    const party = await findOrCreateParty({
      tx,
      businessId: business.id,
      input,
    });

    const transaction = await tx.transaction.create({
      data: {
        businessId: business.id,
        accountId: input.accountId,
        idempotencyKey: input.idempotencyKey,
        type,
        paymentStatus,
        amount,
        costOfGoods,
        profit,
        description: movement.transaction.description,
        category: movement.transaction.category,
        customerId: party.customerId,
        supplierId: party.supplierId,
        occurredAt: movement.transaction.occurredAt,
      },
    });

    if (movement.accountDelta > 0) {
      await tx.account.update({
        where: { id: input.accountId },
        data: { balance: { increment: amount } },
      });
    }

    if (movement.accountDelta < 0) {
      await tx.account.update({
        where: { id: input.accountId },
        data: { balance: { decrement: amount.abs() } },
      });
    }

    await createDebtIfNeeded({
      tx,
      businessId: business.id,
      transactionId: transaction.id,
      debt: movement.debt,
      customerId: party.customerId,
      supplierId: party.supplierId,
    });

    await tx.auditLog.create({
      data: {
        businessId: business.id,
        actorId: userId,
        action: `transaction.${input.type}`,
        message: `${input.type === "sale" ? "Money in" : "Money out"} saved for ${formatNaira(input.amount)}.`,
      },
    });
  });

  return getDashboardState(business.id);
}

export async function getOpenDebtsForUser(userId: string) {
  const business = await getFirstBusinessForUser(userId);

  if (!business) {
    return null;
  }

  const debts = await getPrisma().debt.findMany({
    where: {
      businessId: business.id,
      status: DebtStatus.OPEN,
    },
    include: { customer: true, supplier: true },
    orderBy: { createdAt: "desc" },
  });

  return debts.map(mapDebt);
}

export async function remindDebtForUser({
  userId,
  debtId,
}: {
  userId: string;
  debtId: string;
}) {
  const business = await getFirstBusinessForUser(userId);

  if (!business) {
    throw new Error("Create a business before sending reminders.");
  }

  const debt = await getPrisma().debt.findFirst({
    where: {
      id: debtId,
      businessId: business.id,
      status: DebtStatus.OPEN,
      type: DebtType.CUSTOMER_OWES_BUSINESS,
    },
    include: { customer: true },
  });

  if (!debt) {
    throw new Error("This person is no longer on your collection list.");
  }

  const partyName = debt.customer?.name ?? "Customer";

  await getPrisma().auditLog.create({
    data: {
      businessId: business.id,
      actorId: userId,
      action: "debt.reminder",
      message: `Reminder noted for ${partyName}.`,
      metadata: {
        debtId,
        amount: debt.amount.toNumber(),
      },
    },
  });

  return {
    message: `Reminder noted for ${partyName}.`,
    state: await getDashboardState(business.id),
  };
}

export async function collectDebtForUser({
  userId,
  debtId,
  accountId,
  idempotencyKey,
}: {
  userId: string;
  debtId: string;
  accountId: string;
  idempotencyKey: string;
}) {
  const business = await getFirstBusinessForUser(userId);

  if (!business) {
    throw new Error("Create a business before collecting money.");
  }

  await getPrisma().$transaction(async (tx) => {
    const debt = await tx.debt.findFirst({
      where: {
        id: debtId,
        businessId: business.id,
        status: DebtStatus.OPEN,
        type: DebtType.CUSTOMER_OWES_BUSINESS,
      },
      include: { customer: true },
    });

    if (!debt) {
      throw new Error("This person is no longer on your collection list.");
    }

    const account = await tx.account.findFirst({
      where: {
        id: accountId,
        businessId: business.id,
      },
    });

    if (!account) {
      throw new Error("Choose where the collected money entered.");
    }

    const existing = await tx.transaction.findUnique({
      where: {
        businessId_idempotencyKey: {
          businessId: business.id,
          idempotencyKey,
        },
      },
    });

    if (existing) {
      return;
    }

    const amount = debt.amount.minus(debt.paidAmount);
    const movement = createDebtCollectionMovement(amount.toNumber());
    const partyName = debt.customer?.name ?? "Customer";

    await tx.account.update({
      where: { id: accountId },
      data: { balance: { increment: movement.accountDelta } },
    });

    const transaction = await tx.transaction.create({
      data: {
        businessId: business.id,
        accountId,
        customerId: debt.customerId,
        idempotencyKey,
        type: toDbTransactionType(movement.transaction.type),
        paymentStatus: toDbPaymentStatus(movement.transaction.paymentStatus),
        amount: movement.transaction.amount,
        costOfGoods: movement.transaction.costOfGoods,
        profit: movement.transaction.profit,
        description: `Collected from ${partyName}`,
        occurredAt: movement.transaction.occurredAt,
      },
    });

    await tx.debt.update({
      where: { id: debt.id },
      data: {
        paidAmount: debt.amount,
        status: DebtStatus.SETTLED,
      },
    });

    await tx.auditLog.create({
      data: {
        businessId: business.id,
        actorId: userId,
        action: "debt.collected",
        message: `Collected ${formatNaira(amount.toNumber())} from ${partyName}.`,
        metadata: {
          debtId,
          transactionId: transaction.id,
          accountId,
        },
      },
    });
  });

  return getDashboardState(business.id);
}

export async function getInventoryForUser(userId: string) {
  const business = await getFirstBusinessForUser(userId);

  if (!business) {
    return null;
  }

  const items = await getPrisma().inventoryItem.findMany({
    where: { businessId: business.id },
    orderBy: { updatedAt: "desc" },
  });

  return items.map(mapInventoryItem);
}

export async function createInventoryItemForUser({
  userId,
  name,
  sellingPrice,
  costPrice,
  quantityOnHand,
  lowStockLevel,
  sku,
}: {
  userId: string;
  name: string;
  sellingPrice: number;
  costPrice: number;
  quantityOnHand: number;
  lowStockLevel: number;
  sku?: string;
}) {
  const business = await getFirstBusinessForUser(userId);

  if (!business) {
    throw new Error("Create a business before adding products.");
  }

  await getPrisma().inventoryItem.create({
    data: {
      businessId: business.id,
      name,
      sku: sku || null,
      sellingPrice,
      costPrice,
      quantityOnHand,
      lowStockLevel,
      movements:
        quantityOnHand > 0
          ? {
              create: {
                type: InventoryMovementType.STOCK_IN,
                quantity: quantityOnHand,
                note: "Opening stock",
              },
            }
          : undefined,
    },
  });

  await getPrisma().auditLog.create({
    data: {
      businessId: business.id,
      actorId: userId,
      action: "inventory.item.created",
      message: `${name} added to stock.`,
    },
  });

  return getDashboardState(business.id);
}

export async function moveInventoryForUser({
  userId,
  itemId,
  quantity,
  direction,
  note,
}: {
  userId: string;
  itemId: string;
  quantity: number;
  direction: "in" | "out";
  note?: string;
}) {
  const business = await getFirstBusinessForUser(userId);

  if (!business) {
    throw new Error("Create a business before updating stock.");
  }

  await getPrisma().$transaction(async (tx) => {
    const item = await tx.inventoryItem.findFirst({
      where: { id: itemId, businessId: business.id },
    });

    if (!item) {
      throw new Error("Choose a valid product.");
    }

    if (direction === "out" && item.quantityOnHand < quantity) {
      throw new Error("You do not have enough stock for this.");
    }

    await tx.inventoryItem.update({
      where: { id: itemId },
      data: {
        quantityOnHand:
          direction === "in" ? { increment: quantity } : { decrement: quantity },
      },
    });

    await tx.inventoryMovement.create({
      data: {
        itemId,
        type:
          direction === "in"
            ? InventoryMovementType.STOCK_IN
            : InventoryMovementType.STOCK_OUT,
        quantity,
        note: note || (direction === "in" ? "Stock added" : "Stock removed"),
      },
    });

    await tx.auditLog.create({
      data: {
        businessId: business.id,
        actorId: userId,
        action: direction === "in" ? "inventory.stock_in" : "inventory.stock_out",
        message: `${quantity} ${item.name} ${direction === "in" ? "added" : "removed"}.`,
      },
    });
  });

  return getDashboardState(business.id);
}

export async function getMonthlyReportForUser({
  userId,
  month,
  year,
}: {
  userId: string;
  month: number;
  year: number;
}): Promise<MonthlyReport | null> {
  const business = await getFirstBusinessForUser(userId);

  if (!business) {
    return null;
  }

  return getMonthlyReport({ businessId: business.id, month, year });
}

export async function getMonthlyReport({
  businessId,
  month,
  year,
}: {
  businessId: string;
  month: number;
  year: number;
}): Promise<MonthlyReport> {
  const business = await getPrisma().business.findUniqueOrThrow({
    where: { id: businessId },
    select: {
      name: true,
      vatRate: true,
      transactions: {
        where: {
          occurredAt: {
            gte: new Date(Date.UTC(year, month - 1, 1)),
            lt: new Date(Date.UTC(year, month, 1)),
          },
        },
      },
      debts: {
        where: {
          createdAt: {
            gte: new Date(Date.UTC(year, month - 1, 1)),
            lt: new Date(Date.UTC(year, month, 1)),
          },
        },
      },
    },
  });

  const salesTotal = business.transactions
    .filter((transaction) => transaction.type === TransactionType.SALE)
    .reduce((sum, transaction) => sum.plus(transaction.amount), new Prisma.Decimal(0));
  const expensesTotal = business.transactions
    .filter((transaction) => transaction.type === TransactionType.EXPENSE)
    .reduce((sum, transaction) => sum.plus(transaction.amount), new Prisma.Decimal(0));
  const saleProfit = business.transactions
    .filter((transaction) => transaction.type === TransactionType.SALE)
    .reduce((sum, transaction) => sum.plus(transaction.profit), new Prisma.Decimal(0));
  const customerDebtTotal = business.debts
    .filter((debt) => debt.type === DebtType.CUSTOMER_OWES_BUSINESS)
    .reduce((sum, debt) => sum.plus(debt.amount), new Prisma.Decimal(0));
  const supplierDebtTotal = business.debts
    .filter((debt) => debt.type === DebtType.BUSINESS_OWES_SUPPLIER)
    .reduce((sum, debt) => sum.plus(debt.amount), new Prisma.Decimal(0));
  const vatRate = business.vatRate.toNumber();
  const vatTotal = salesTotal.mul(vatRate).div(100);

  return {
    businessName: business.name,
    month,
    year,
    vatRate,
    salesTotal: salesTotal.toNumber(),
    expensesTotal: expensesTotal.toNumber(),
    profitTotal: saleProfit.minus(expensesTotal).toNumber(),
    vatTotal: vatTotal.toNumber(),
    customerDebtTotal: customerDebtTotal.toNumber(),
    supplierDebtTotal: supplierDebtTotal.toNumber(),
    transactionCount: business.transactions.length,
    generatedAt: new Date().toISOString(),
  };
}

export async function saveTaxRunForUser({
  userId,
  month,
  year,
}: {
  userId: string;
  month: number;
  year: number;
}) {
  const business = await getFirstBusinessForUser(userId);

  if (!business) {
    throw new Error("Create a business before saving tax summaries.");
  }

  const report = await getMonthlyReport({ businessId: business.id, month, year });

  await getPrisma().taxRun.upsert({
    where: {
      businessId_month_year: {
        businessId: business.id,
        month,
        year,
      },
    },
    create: {
      businessId: business.id,
      month,
      year,
      vatRate: report.vatRate,
      salesTotal: report.salesTotal,
      vatTotal: report.vatTotal,
    },
    update: {
      vatRate: report.vatRate,
      salesTotal: report.salesTotal,
      vatTotal: report.vatTotal,
    },
  });

  await getPrisma().auditLog.create({
    data: {
      businessId: business.id,
      actorId: userId,
      action: "tax.summary.saved",
      message: `${month}/${year} VAT summary saved.`,
    },
  });

  return report;
}

async function findOrCreateParty({
  tx,
  businessId,
  input,
}: {
  tx: PrismaTransaction;
  businessId: string;
  input: TransactionInput;
}) {
  const partyName = input.partyName?.trim() || input.description?.trim();

  if (!partyName || input.paymentStatus === "paid") {
    return { customerId: undefined, supplierId: undefined };
  }

  if (input.type === "sale" && input.paymentStatus === "credit") {
    const customer = await tx.customer.create({
      data: { businessId, name: partyName },
    });
    return { customerId: customer.id, supplierId: undefined };
  }

  if (input.type === "expense" && input.paymentStatus === "unpaid") {
    const supplier = await tx.supplier.create({
      data: { businessId, name: partyName },
    });
    return { customerId: undefined, supplierId: supplier.id };
  }

  return { customerId: undefined, supplierId: undefined };
}

async function createDebtIfNeeded({
  tx,
  businessId,
  transactionId,
  debt,
  customerId,
  supplierId,
}: {
  tx: PrismaTransaction;
  businessId: string;
  transactionId: string;
  debt?: MoneyMovement["debt"];
  customerId?: string;
  supplierId?: string;
}) {
  if (!debt) {
    return;
  }

  await tx.debt.create({
    data: {
      businessId,
      customerId: debt.type === "customer_owes_business" ? customerId : undefined,
      supplierId: debt.type === "business_owes_supplier" ? supplierId : undefined,
      sourceTransactionId: transactionId,
      type: toDbDebtType(debt.type),
      amount: debt.amount,
    },
  });
}

function mapAccount(account: {
  id: string;
  name: string;
  type: AccountType;
  balance: Prisma.Decimal;
}): Account {
  return {
    id: account.id,
    name: account.name,
    type: account.type.toLowerCase() as Account["type"],
    balance: account.balance.toNumber(),
  };
}

function mapTransaction(transaction: {
  id: string;
  idempotencyKey: string;
  type: TransactionType;
  amount: Prisma.Decimal;
  accountId: string;
  destinationAccountId: string | null;
  description: string;
  category: string | null;
  paymentStatus: PaymentStatus;
  costOfGoods: Prisma.Decimal;
  profit: Prisma.Decimal;
  occurredAt: Date;
}): Transaction {
  return {
    id: transaction.id,
    idempotencyKey: transaction.idempotencyKey,
    type: transaction.type.toLowerCase() as Transaction["type"],
    amount: transaction.amount.toNumber(),
    accountId: transaction.accountId,
    destinationAccountId: transaction.destinationAccountId ?? undefined,
    description: transaction.description,
    category: transaction.category ?? undefined,
    paymentStatus: transaction.paymentStatus.toLowerCase() as Transaction["paymentStatus"],
    costOfGoods: transaction.costOfGoods.toNumber(),
    profit: transaction.profit.toNumber(),
    occurredAt: transaction.occurredAt.toISOString(),
  };
}

function mapDebt(debt: {
  id: string;
  type: DebtType;
  amount: Prisma.Decimal;
  sourceTransactionId: string;
  dueAt: Date | null;
  status: DebtStatus;
  customer: { name: string } | null;
  supplier: { name: string } | null;
}): Debt {
  return {
    id: debt.id,
    type: debt.type.toLowerCase() as Debt["type"],
    partyName: debt.customer?.name ?? debt.supplier?.name ?? "Someone",
    amount: debt.amount.toNumber(),
    sourceTransactionId: debt.sourceTransactionId,
    dueAt: debt.dueAt?.toISOString(),
    status: debt.status.toLowerCase() as Debt["status"],
  };
}

function mapInventoryItem(item: {
  id: string;
  name: string;
  sku: string | null;
  sellingPrice: Prisma.Decimal;
  costPrice: Prisma.Decimal;
  quantityOnHand: number;
  lowStockLevel: number;
}): InventoryItem {
  const sellingPrice = item.sellingPrice.toNumber();
  const costPrice = item.costPrice.toNumber();

  return {
    id: item.id,
    name: item.name,
    sku: item.sku ?? undefined,
    sellingPrice,
    costPrice,
    quantityOnHand: item.quantityOnHand,
    lowStockLevel: item.lowStockLevel,
    profitPerItem: sellingPrice - costPrice,
    isLowStock: item.quantityOnHand <= item.lowStockLevel,
  };
}

function toDbTransactionType(type: TransactionInput["type"]) {
  return type.toUpperCase() as TransactionType;
}

function toDbPaymentStatus(status: TransactionInput["paymentStatus"]) {
  return status.toUpperCase() as PaymentStatus;
}

function toDbDebtType(type: Debt["type"]) {
  return type.toUpperCase() as DebtType;
}
