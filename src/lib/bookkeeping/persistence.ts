import {
  AccountType,
  DebtEventType,
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
  AgingBuckets,
  Debt,
  InventoryItem,
  MonthlyReport,
  MoneybookState,
  Transaction,
  TransactionInput,
} from "@/lib/bookkeeping/transaction-engine";
import {
  buildDuplicateFingerprint,
  createDebtCollectionMovement,
  createMoneyMovement,
  createReversalMovement,
  type MoneyMovement,
} from "@/lib/bookkeeping/domain";
import { formatNaira } from "@/lib/bookkeeping/transaction-engine";
import {
  getBusinessAccess,
  hasPermission,
  mapRole,
  requireBusinessAccess,
} from "@/lib/operations/access";
import { getPrisma } from "@/lib/prisma";
import { sendDebtReminder } from "@/lib/whatsapp/service";

type PrismaTransaction = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

const defaultAccounts = [
  { name: "Cash", type: AccountType.CASH },
  { name: "Bank", type: AccountType.BANK },
  { name: "POS", type: AccountType.POS },
] as const;

const dashboardTransactionLimit = 50;
const dashboardDebtLimit = 100;
const dashboardInventoryLimit = 200;
const dashboardAuditLogLimit = 20;
const listPageLimit = 500;
const nestedDebtLimit = 20;
const nestedEventLimit = 3;

type ReportAggregateRow = {
  salesTotal: number | string | null;
  cashReceivedTotal: number | string | null;
  creditSalesTotal: number | string | null;
  expensesTotal: number | string | null;
  saleProfit: number | string | null;
  taxableSalesTotal: number | string | null;
  transactionCount: number | bigint | string | null;
};

type TopProductRow = {
  name: string;
  quantity: number | bigint | string | null;
  salesTotal: number | string | null;
  profitTotal: number | string | null;
};

export async function createBusinessForUser(
  userId: string,
  name: string,
  options: { businessType?: string; onboardingCompleted?: boolean } = {},
) {
  return getPrisma().business.create({
    data: {
      name,
      businessType: options.businessType,
      onboardingCompleted: options.onboardingCompleted ?? false,
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

  return membership
    ? {
        ...membership.business,
        businessId: membership.business.id,
        role: membership.role,
      }
    : null;
}

export async function getDashboardStateForUser(
  userId: string,
  businessId?: string,
): Promise<MoneybookState | null> {
  const access = await getBusinessAccess(userId, businessId);

  if (!access) {
    return null;
  }

  return getDashboardState(access.businessId, access.role, userId);
}

export async function getDashboardState(
  businessId: string,
  role?: Role,
  userId?: string,
): Promise<MoneybookState> {
  const prisma = getPrisma();
  const [
    business,
    accounts,
    transactions,
    debts,
    items,
    auditLogs,
    memberships,
  ] = await Promise.all([
    prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: {
        id: true,
        name: true,
        businessType: true,
        onboardingCompleted: true,
      },
    }),
    prisma.account.findMany({
      where: { businessId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.transaction.findMany({
      where: { businessId },
      orderBy: { occurredAt: "desc" },
      take: dashboardTransactionLimit,
      include: {
        reversesTransaction: { select: { type: true } },
        reversalTransaction: { select: { id: true } },
      },
    }),
    prisma.debt.findMany({
      where: { businessId, status: DebtStatus.OPEN },
      include: {
        customer: true,
        supplier: true,
        events: { orderBy: { createdAt: "desc" }, take: nestedEventLimit },
      },
      orderBy: { createdAt: "desc" },
      take: dashboardDebtLimit,
    }),
    prisma.inventoryItem.findMany({
      where: { businessId },
      orderBy: { updatedAt: "desc" },
      take: dashboardInventoryLimit,
      include: { movements: { orderBy: { createdAt: "desc" }, take: nestedEventLimit } },
    }),
    prisma.auditLog.findMany({
      where: { businessId },
      orderBy: { createdAt: "desc" },
      take: dashboardAuditLogLimit,
    }),
    userId
      ? prisma.businessMember.findMany({
          where: { userId },
          orderBy: { createdAt: "asc" },
          include: { business: { select: { id: true, name: true } } },
        })
      : Promise.resolve([]),
  ]);

  return {
    businessId: business.id,
    businessName: business.name,
    businessType: business.businessType ?? undefined,
    onboardingCompleted: business.onboardingCompleted,
    businesses: memberships.map((membership) => ({
      id: membership.business.id,
      name: membership.business.name,
      role: mapRole(membership.role),
    })),
    businessRole: role ? mapRole(role) : undefined,
    permissions: role
      ? {
          canManageStaff: hasPermission(role, "admin"),
          canManageAccounts: hasPermission(role, "admin"),
          canSaveReports: hasPermission(role, "reports:write"),
          canExportBackup: hasPermission(role, "backup:read"),
        }
      : undefined,
    accounts: accounts.map(mapAccount),
    transactions: transactions.map(mapTransaction),
    debts: debts.map(mapDebt),
    items: items.map(mapInventoryItem),
    auditLogs: auditLogs.map((auditLog) => ({
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
  businessId,
}: {
  userId: string;
  input: TransactionInput;
  businessId?: string;
}) {
  const business = await requireBusinessAccess(userId, "money:write", businessId);

  await getPrisma().$transaction(async (tx) => {
    const account = await tx.account.findFirst({
      where: { id: input.accountId, businessId: business.businessId },
    });

    if (!account) {
      throw new Error("Choose a valid money account.");
    }

    const existingByKey = await tx.transaction.findFirst({
      where: {
        businessId: business.businessId,
        idempotencyKey: input.idempotencyKey,
      },
    });

    if (existingByKey) {
      return;
    }

    if (input.destinationAccountId) {
      const destinationAccount = await tx.account.findFirst({
        where: { id: input.destinationAccountId, businessId: business.businessId },
      });

      if (!destinationAccount) {
        throw new Error("Choose where the transfer is going.");
      }
    }

    let inventoryItem:
      | {
          id: string;
          name: string;
          sellingPrice: Prisma.Decimal;
          costPrice: Prisma.Decimal;
          quantityOnHand: number;
        }
      | null = null;
    let inventoryQuantity = input.inventoryQuantity ?? 0;

    if (input.inventoryItemId) {
      inventoryItem = await tx.inventoryItem.findFirst({
        where: { id: input.inventoryItemId, businessId: business.businessId },
      });

      if (!inventoryItem) {
        throw new Error("Choose a valid product.");
      }

      if (input.type !== "sale") {
        throw new Error("Products can only be attached to sales.");
      }

      if (inventoryQuantity <= 0) {
        inventoryQuantity = 1;
      }

      if (inventoryItem.quantityOnHand < inventoryQuantity) {
        throw new Error("You do not have enough stock for this sale.");
      }

      input.amount = inventoryItem.sellingPrice.toNumber() * inventoryQuantity;
      input.costOfGoods = inventoryItem.costPrice.toNumber() * inventoryQuantity;
    }

    const movementWithInventory = createMoneyMovement(input);
    const duplicateFingerprint = buildDuplicateFingerprint(
      input,
      movementWithInventory.transaction.occurredAt,
    );
    const existingByFingerprint = await tx.transaction.findFirst({
      where: {
        businessId: business.businessId,
        duplicateFingerprint,
      },
    });

    if (existingByFingerprint) {
      return;
    }

    const inventoryAwareAmount = new Prisma.Decimal(
      movementWithInventory.transaction.amount,
    );
    const inventoryAwareCostOfGoods = new Prisma.Decimal(
      movementWithInventory.transaction.costOfGoods,
    );
    const inventoryAwareProfit = new Prisma.Decimal(
      movementWithInventory.transaction.profit,
    );

    const type = toDbTransactionType(movementWithInventory.transaction.type);
    const paymentStatus = toDbPaymentStatus(movementWithInventory.transaction.paymentStatus);
    const amount = inventoryAwareAmount;
    const costOfGoods = inventoryAwareCostOfGoods;
    const profit = inventoryAwareProfit;

    const party = await findOrCreateParty({
      tx,
      businessId: business.businessId,
      input,
    });

    const transaction = await tx.transaction.create({
      data: {
        businessId: business.businessId,
        accountId: input.accountId,
        destinationAccountId: input.destinationAccountId,
        idempotencyKey: input.idempotencyKey,
        duplicateFingerprint,
        type,
        paymentStatus,
        amount,
        costOfGoods,
        profit,
        description: movementWithInventory.transaction.description,
        category: movementWithInventory.transaction.category,
        customerId: party.customerId,
        supplierId: party.supplierId,
        inventoryItemId: inventoryItem?.id,
        inventoryQuantity: inventoryItem ? inventoryQuantity : undefined,
        occurredAt: movementWithInventory.transaction.occurredAt,
      },
    });

    if (inventoryItem) {
      await tx.inventoryItem.update({
        where: { id: inventoryItem.id },
        data: { quantityOnHand: { decrement: inventoryQuantity } },
      });

      await tx.inventoryMovement.create({
        data: {
          itemId: inventoryItem.id,
          accountId: input.accountId,
          transactionId: transaction.id,
          type: InventoryMovementType.STOCK_OUT,
          quantity: inventoryQuantity,
          note: `Sold via ${transaction.description}`,
        },
      });
    }

    if (movementWithInventory.accountDelta > 0) {
      await tx.account.update({
        where: { id: input.accountId },
        data: { balance: { increment: amount } },
      });
    }

    if (movementWithInventory.accountDelta < 0) {
      await tx.account.update({
        where: { id: input.accountId },
        data: { balance: { decrement: amount.abs() } },
      });
    }

    if (movementWithInventory.destinationAccountDelta && input.destinationAccountId) {
      await tx.account.update({
        where: { id: input.destinationAccountId },
        data: { balance: { increment: movementWithInventory.destinationAccountDelta } },
      });
    }

    await createDebtIfNeeded({
      tx,
      businessId: business.businessId,
      transactionId: transaction.id,
      debt: movementWithInventory.debt,
      dueAt: input.dueAt,
      customerId: party.customerId,
      supplierId: party.supplierId,
      note: input.description,
    });

    await tx.auditLog.create({
      data: {
        businessId: business.businessId,
        actorId: userId,
        action: `transaction.${input.type}`,
        message: `${input.type === "sale" ? "Money in" : "Money out"} saved for ${formatNaira(input.amount)}.`,
      },
    });
  });

  return getDashboardState(business.businessId, business.role, userId);
}

export async function createAccountForUser({
  userId,
  businessId,
  name,
  type,
  openingBalance,
}: {
  userId: string;
  businessId?: string;
  name: string;
  type: Account["type"];
  openingBalance: number;
}) {
  const business = await requireBusinessAccess(userId, "admin", businessId);

  await getPrisma().account.create({
    data: {
      businessId: business.businessId,
      name,
      type: toDbAccountType(type),
      openingBalance,
      balance: openingBalance,
    },
  });

  await getPrisma().auditLog.create({
    data: {
      businessId: business.businessId,
      actorId: userId,
      action: "account.created",
      message: `${name} account opened with ${formatNaira(openingBalance)}.`,
    },
  });

  return getDashboardState(business.businessId, business.role, userId);
}

export async function reverseTransactionForUser({
  userId,
  businessId,
  transactionId,
  reason,
}: {
  userId: string;
  businessId?: string;
  transactionId: string;
  reason?: string;
}) {
  const business = await requireBusinessAccess(userId, "money:write", businessId);

  await getPrisma().$transaction(async (tx) => {
    const original = await tx.transaction.findFirst({
      where: { id: transactionId, businessId: business.businessId },
      include: { reversalTransaction: true, inventoryItem: true },
    });

    if (!original) {
      throw new Error("This record could not be found.");
    }

    if (original.reversesTransactionId || original.type === TransactionType.ADJUSTMENT) {
      throw new Error("This record is already a correction entry.");
    }

    if (original.reversalTransaction) {
      throw new Error("This record has already been reversed.");
    }

    const movement = createReversalMovement({
      type: original.type.toLowerCase() as TransactionInput["type"],
      amount: original.amount.toNumber(),
      profit: original.profit.toNumber(),
      paymentStatus: original.paymentStatus.toLowerCase() as TransactionInput["paymentStatus"],
      description: original.description,
      accountId: original.accountId,
      destinationAccountId: original.destinationAccountId,
    });

    await applyAccountDelta(tx, original.accountId, movement.accountDelta);

    if (movement.destinationAccountDelta && original.destinationAccountId) {
      await applyAccountDelta(
        tx,
        original.destinationAccountId,
        movement.destinationAccountDelta,
      );
    }

    if (original.inventoryItemId && original.inventoryQuantity) {
      await tx.inventoryItem.update({
        where: { id: original.inventoryItemId },
        data: { quantityOnHand: { increment: original.inventoryQuantity } },
      });

      await tx.inventoryMovement.create({
        data: {
          itemId: original.inventoryItemId,
          accountId: original.accountId,
          type: InventoryMovementType.ADJUSTMENT,
          quantity: original.inventoryQuantity,
          note: `Restored by reversing ${original.description}`,
        },
      });
    }

    const reversal = await tx.transaction.create({
      data: {
        businessId: business.businessId,
        accountId: original.accountId,
        destinationAccountId: original.destinationAccountId,
        idempotencyKey: `reversal-${original.id}`,
        duplicateFingerprint: `reversal-${original.id}`,
        type: TransactionType.ADJUSTMENT,
        paymentStatus: PaymentStatus.PAID,
        amount: movement.transaction.amount,
        costOfGoods: movement.transaction.costOfGoods,
        profit: movement.transaction.profit,
        description: reason
          ? `${movement.transaction.description} (${reason})`
          : movement.transaction.description,
        category: movement.transaction.category,
        occurredAt: movement.transaction.occurredAt,
        reversesTransactionId: original.id,
      },
    });

    await tx.debt.updateMany({
      where: {
        businessId: business.businessId,
        sourceTransactionId: original.id,
        status: DebtStatus.OPEN,
      },
      data: {
        status: DebtStatus.SETTLED,
        paidAmount: original.amount,
      },
    });

    await tx.auditLog.create({
      data: {
        businessId: business.businessId,
        actorId: userId,
        action: "transaction.reversed",
        message: `${original.description} was reversed.`,
        metadata: {
          originalTransactionId: original.id,
          reversalTransactionId: reversal.id,
          reason,
        },
      },
    });
  });

  return getDashboardState(business.businessId, business.role, userId);
}

export async function getOpenDebtsForUser(userId: string) {
  const business = await getFirstBusinessForUser(userId);

  if (!business) {
    return null;
  }

  const debts = await getPrisma().debt.findMany({
    where: {
      businessId: business.businessId,
      status: DebtStatus.OPEN,
    },
    include: {
      customer: true,
      supplier: true,
      events: { orderBy: { createdAt: "desc" }, take: nestedEventLimit },
    },
    orderBy: { createdAt: "desc" },
    take: dashboardDebtLimit,
  });

  return debts.map(mapDebt);
}

export async function getCustomerControlForUser(userId: string) {
  const business = await getFirstBusinessForUser(userId);

  if (!business) {
    return null;
  }

  const customers = await getPrisma().customer.findMany({
    where: { businessId: business.businessId },
    include: {
      debts: {
        where: { status: DebtStatus.OPEN },
        include: {
          customer: true,
          supplier: true,
          events: { orderBy: { createdAt: "desc" }, take: nestedEventLimit },
        },
        take: nestedDebtLimit,
      },
    },
    orderBy: { createdAt: "desc" },
    take: listPageLimit,
  });

  return customers.map((customer) => {
    const debts = customer.debts.map(mapDebt);
    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      openDebtTotal: debts.reduce((sum, debt) => sum + debt.remainingAmount, 0),
      overdueCount: debts.filter((debt) => debt.isOverdue).length,
      debts,
    };
  });
}

export async function getSupplierControlForUser(userId: string) {
  const business = await getFirstBusinessForUser(userId);

  if (!business) {
    return null;
  }

  const suppliers = await getPrisma().supplier.findMany({
    where: { businessId: business.businessId },
    include: {
      debts: {
        where: { status: DebtStatus.OPEN },
        include: {
          customer: true,
          supplier: true,
          events: { orderBy: { createdAt: "desc" }, take: nestedEventLimit },
        },
        take: nestedDebtLimit,
      },
    },
    orderBy: { createdAt: "desc" },
    take: listPageLimit,
  });

  return suppliers.map((supplier) => {
    const debts = supplier.debts.map(mapDebt);
    return {
      id: supplier.id,
      name: supplier.name,
      phone: supplier.phone,
      openDebtTotal: debts.reduce((sum, debt) => sum + debt.remainingAmount, 0),
      overdueCount: debts.filter((debt) => debt.isOverdue).length,
      debts,
    };
  });
}

export async function remindDebtForUser({
  userId,
  businessId,
  debtId,
  channel = "manual",
  note,
}: {
  userId: string;
  businessId?: string;
  debtId: string;
  channel?: "manual" | "whatsapp" | "sms";
  note?: string;
}) {
  const business = await requireBusinessAccess(userId, "money:write", businessId);

  const debt = await getPrisma().debt.findFirst({
    where: {
      id: debtId,
      businessId: business.businessId,
      status: DebtStatus.OPEN,
      type: DebtType.CUSTOMER_OWES_BUSINESS,
    },
    include: { customer: true, supplier: true },
  });

  if (!debt) {
    throw new Error("This person is no longer on your collection list.");
  }

  const partyName = debt.customer?.name ?? debt.supplier?.name ?? "Customer";
  const remainingAmount = debt.amount.minus(debt.paidAmount).toNumber();
  const whatsapp =
    channel === "whatsapp"
      ? await sendDebtReminder({
          to: debt.customer?.phone ?? "",
          customerName: partyName,
          amount: remainingAmount,
          businessName: business.businessName,
          dueDate: debt.dueAt,
          businessId: business.businessId,
          actorId: userId,
          source: "debt.reminder",
          metadata: { debtId },
        })
      : null;

  await getPrisma().debtEvent.create({
    data: {
      debtId,
      actorId: userId,
      type: DebtEventType.REMINDER,
      channel,
      note:
        note ||
        (whatsapp?.ok
          ? "WhatsApp reminder sent."
          : whatsapp?.error || `Reminder prepared via ${channel}.`),
    },
  });

  await getPrisma().auditLog.create({
    data: {
      businessId: business.businessId,
      actorId: userId,
      action: "debt.reminder",
      message: `Reminder noted for ${partyName}.`,
      metadata: {
        debtId,
        amount: remainingAmount,
        channel,
        note,
        whatsapp,
      },
    },
  });

  return {
    message: whatsapp?.ok
      ? `WhatsApp reminder sent to ${partyName}.`
      : whatsapp?.error
        ? whatsapp.error
      : `Reminder noted for ${partyName}.`,
    whatsappResult: whatsapp,
    state: await getDashboardState(business.businessId, business.role, userId),
  };
}

export async function collectDebtForUser({
  userId,
  businessId,
  debtId,
  accountId,
  idempotencyKey,
  amount,
}: {
  userId: string;
  businessId?: string;
  debtId: string;
  accountId: string;
  idempotencyKey: string;
  amount?: number;
}) {
  const business = await requireBusinessAccess(userId, "money:write", businessId);

  await getPrisma().$transaction(async (tx) => {
    const debt = await tx.debt.findFirst({
      where: {
        id: debtId,
        businessId: business.businessId,
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
        businessId: business.businessId,
      },
    });

    if (!account) {
      throw new Error("Choose where the collected money entered.");
    }

    const existing = await tx.transaction.findUnique({
      where: {
        businessId_idempotencyKey: {
          businessId: business.businessId,
          idempotencyKey,
        },
      },
    });

    if (existing) {
      return;
    }

    const remaining = debt.amount.minus(debt.paidAmount);
    const amountToCollect = amount
      ? Prisma.Decimal.min(new Prisma.Decimal(amount), remaining)
      : remaining;

    if (amountToCollect.lte(0)) {
      throw new Error("Enter an amount to collect.");
    }

    const movement = createDebtCollectionMovement(amountToCollect.toNumber());
    const partyName = debt.customer?.name ?? "Customer";

    await tx.account.update({
      where: { id: accountId },
      data: { balance: { increment: movement.accountDelta } },
    });

    const transaction = await tx.transaction.create({
      data: {
        businessId: business.businessId,
        accountId,
        customerId: debt.customerId,
        idempotencyKey,
        duplicateFingerprint: `collect-${debt.id}-${debt.paidAmount.toString()}-${amountToCollect.toString()}`,
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
        paidAmount: { increment: amountToCollect },
        status: debt.paidAmount.plus(amountToCollect).gte(debt.amount)
          ? DebtStatus.SETTLED
          : DebtStatus.OPEN,
      },
    });

    await tx.debtEvent.create({
      data: {
        debtId,
        actorId: userId,
        type: DebtEventType.CUSTOMER_COLLECTION,
        amount: amountToCollect,
        note: `Collected into ${account.name}.`,
      },
    });

    await tx.auditLog.create({
      data: {
        businessId: business.businessId,
        actorId: userId,
        action: "debt.collected",
        message: `Collected ${formatNaira(amountToCollect.toNumber())} from ${partyName}.`,
        metadata: {
          debtId,
          transactionId: transaction.id,
          accountId,
          amount: amountToCollect.toNumber(),
        },
      },
    });
  });

  return getDashboardState(business.businessId, business.role, userId);
}

export async function settleSupplierDebtForUser({
  userId,
  businessId,
  debtId,
  accountId,
  idempotencyKey,
  amount,
}: {
  userId: string;
  businessId?: string;
  debtId: string;
  accountId: string;
  idempotencyKey: string;
  amount?: number;
}) {
  const business = await requireBusinessAccess(userId, "money:write", businessId);

  await getPrisma().$transaction(async (tx) => {
    const debt = await tx.debt.findFirst({
      where: {
        id: debtId,
        businessId: business.businessId,
        status: DebtStatus.OPEN,
        type: DebtType.BUSINESS_OWES_SUPPLIER,
      },
      include: { supplier: true },
    });

    if (!debt) {
      throw new Error("This supplier bill is no longer open.");
    }

    const account = await tx.account.findFirst({
      where: { id: accountId, businessId: business.businessId },
    });

    if (!account) {
      throw new Error("Choose where the money left from.");
    }

    const existing = await tx.transaction.findUnique({
      where: {
        businessId_idempotencyKey: {
          businessId: business.businessId,
          idempotencyKey,
        },
      },
    });

    if (existing) {
      return;
    }

    const remaining = debt.amount.minus(debt.paidAmount);
    const amountToPay = amount
      ? Prisma.Decimal.min(new Prisma.Decimal(amount), remaining)
      : remaining;

    if (amountToPay.lte(0)) {
      throw new Error("Enter an amount to pay.");
    }

    const supplierName = debt.supplier?.name ?? "Supplier";

    await tx.account.update({
      where: { id: accountId },
      data: { balance: { decrement: amountToPay } },
    });

    const transaction = await tx.transaction.create({
      data: {
        businessId: business.businessId,
        accountId,
        supplierId: debt.supplierId,
        idempotencyKey,
        duplicateFingerprint: `settle-${debt.id}-${debt.paidAmount.toString()}-${amountToPay.toString()}`,
        type: TransactionType.EXPENSE,
        paymentStatus: PaymentStatus.PAID,
        amount: amountToPay,
        costOfGoods: 0,
        profit: 0,
        description: `Paid ${supplierName}`,
      },
    });

    await tx.debt.update({
      where: { id: debt.id },
      data: {
        paidAmount: { increment: amountToPay },
        status: debt.paidAmount.plus(amountToPay).gte(debt.amount)
          ? DebtStatus.SETTLED
          : DebtStatus.OPEN,
      },
    });

    await tx.debtEvent.create({
      data: {
        debtId,
        actorId: userId,
        type: DebtEventType.SUPPLIER_SETTLEMENT,
        amount: amountToPay,
        note: `Paid from ${account.name}.`,
      },
    });

    await tx.auditLog.create({
      data: {
        businessId: business.businessId,
        actorId: userId,
        action: "debt.supplier_settled",
        message: `Paid ${formatNaira(amountToPay.toNumber())} to ${supplierName}.`,
        metadata: {
          debtId,
          transactionId: transaction.id,
          accountId,
          amount: amountToPay.toNumber(),
        },
      },
    });
  });

  return getDashboardState(business.businessId, business.role, userId);
}

export async function getInventoryForUser(userId: string) {
  const business = await getFirstBusinessForUser(userId);

  if (!business) {
    return null;
  }

  const items = await getPrisma().inventoryItem.findMany({
    where: { businessId: business.businessId },
    take: listPageLimit,
    include: { movements: { orderBy: { createdAt: "desc" }, take: nestedEventLimit } },
    orderBy: { updatedAt: "desc" },
  });

  return items.map(mapInventoryItem);
}

export async function createInventoryItemForUser({
  userId,
  businessId,
  name,
  sellingPrice,
  costPrice,
  quantityOnHand,
  lowStockLevel,
  sku,
}: {
  userId: string;
  businessId?: string;
  name: string;
  sellingPrice: number;
  costPrice: number;
  quantityOnHand: number;
  lowStockLevel: number;
  sku?: string;
}) {
  const business = await requireBusinessAccess(userId, "inventory:write", businessId);

  await getPrisma().inventoryItem.create({
    data: {
      businessId: business.businessId,
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
      businessId: business.businessId,
      actorId: userId,
      action: "inventory.item.created",
      message: `${name} added to stock.`,
    },
  });

  return getDashboardState(business.businessId, business.role, userId);
}

export async function moveInventoryForUser({
  userId,
  businessId,
  itemId,
  quantity,
  direction,
  note,
}: {
  userId: string;
  businessId?: string;
  itemId: string;
  quantity: number;
  direction: "in" | "out";
  note?: string;
}) {
  const business = await requireBusinessAccess(userId, "inventory:write", businessId);

  await getPrisma().$transaction(async (tx) => {
    const item = await tx.inventoryItem.findFirst({
      where: { id: itemId, businessId: business.businessId },
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
        businessId: business.businessId,
        actorId: userId,
        action: direction === "in" ? "inventory.stock_in" : "inventory.stock_out",
        message: `${quantity} ${item.name} ${direction === "in" ? "added" : "removed"}.`,
      },
    });
  });

  return getDashboardState(business.businessId, business.role, userId);
}

export async function getMonthlyReportForUser({
  userId,
  businessId,
  month,
  year,
  period = "month",
  date,
}: {
  userId: string;
  businessId?: string;
  month: number;
  year: number;
  period?: MonthlyReport["period"];
  date?: Date;
}): Promise<MonthlyReport | null> {
  const business = await requireBusinessAccess(userId, "reports:write", businessId);

  if (!business) {
    return null;
  }

  return getMonthlyReport({ businessId: business.businessId, month, year, period, date });
}

export async function getMonthlyReport({
  businessId,
  month,
  year,
  period = "month",
  date,
}: {
  businessId: string;
  month: number;
  year: number;
  period?: MonthlyReport["period"];
  date?: Date;
}): Promise<MonthlyReport> {
  const range = getReportRange({ period, month, year, date });
  const previousRange = getPreviousReportRange(range);
  const prisma = getPrisma();
  const [business, aggregateRows, previousExpenseRows, debts, topProductRows] =
    await Promise.all([
      prisma.business.findUniqueOrThrow({
        where: { id: businessId },
        select: { name: true, vatRate: true },
      }),
      prisma.$queryRaw<ReportAggregateRow[]>`
        SELECT
          COALESCE(SUM(
            CASE
              WHEN t."type" = 'SALE' THEN t."amount"
              WHEN t."type" = 'ADJUSTMENT' AND rt."type" = 'SALE' THEN -t."amount"
              ELSE 0
            END
          ), 0)::double precision AS "salesTotal",
          COALESCE(SUM(
            CASE
              WHEN t."type" = 'SALE' AND t."paymentStatus" = 'PAID' THEN t."amount"
              WHEN t."type" = 'ADJUSTMENT' AND rt."type" = 'SALE' THEN -t."amount"
              ELSE 0
            END
          ), 0)::double precision AS "cashReceivedTotal",
          COALESCE(SUM(
            CASE
              WHEN t."type" = 'SALE' AND t."paymentStatus" = 'CREDIT' THEN t."amount"
              ELSE 0
            END
          ), 0)::double precision AS "creditSalesTotal",
          COALESCE(SUM(
            CASE
              WHEN t."type" = 'EXPENSE' THEN t."amount"
              WHEN t."type" = 'ADJUSTMENT' AND rt."type" = 'EXPENSE' THEN -t."amount"
              ELSE 0
            END
          ), 0)::double precision AS "expensesTotal",
          COALESCE(SUM(
            CASE
              WHEN t."type" = 'SALE' OR (t."type" = 'ADJUSTMENT' AND rt."type" = 'SALE') THEN t."profit"
              ELSE 0
            END
          ), 0)::double precision AS "saleProfit",
          COALESCE(SUM(
            CASE
              WHEN t."type" = 'SALE' AND LOWER(COALESCE(t."category", '')) NOT LIKE '%non-taxable%' THEN t."amount"
              ELSE 0
            END
          ), 0)::double precision AS "taxableSalesTotal",
          COUNT(*)::integer AS "transactionCount"
        FROM "Transaction" t
        LEFT JOIN "Transaction" rt ON rt."id" = t."reversesTransactionId"
        WHERE t."businessId" = ${businessId}
          AND t."occurredAt" >= ${range.start}
          AND t."occurredAt" < ${range.end}
          AND NOT EXISTS (
            SELECT 1 FROM "Transaction" child WHERE child."reversesTransactionId" = t."id"
          )
      `,
      prisma.$queryRaw<Array<{ expensesTotal: number | string | null }>>`
        SELECT COALESCE(SUM(t."amount"), 0)::double precision AS "expensesTotal"
        FROM "Transaction" t
        WHERE t."businessId" = ${businessId}
          AND t."occurredAt" >= ${previousRange.start}
          AND t."occurredAt" < ${previousRange.end}
          AND t."type" = 'EXPENSE'
          AND NOT EXISTS (
            SELECT 1 FROM "Transaction" child WHERE child."reversesTransactionId" = t."id"
          )
      `,
      prisma.debt.findMany({
        where: { businessId, status: DebtStatus.OPEN },
        select: {
          type: true,
          status: true,
          amount: true,
          paidAmount: true,
          dueAt: true,
          createdAt: true,
        },
      }),
      prisma.$queryRaw<TopProductRow[]>`
        SELECT
          i."name",
          COALESCE(SUM(t."inventoryQuantity"), 0)::integer AS "quantity",
          COALESCE(SUM(t."amount"), 0)::double precision AS "salesTotal",
          COALESCE(SUM(t."profit"), 0)::double precision AS "profitTotal"
        FROM "Transaction" t
        INNER JOIN "InventoryItem" i ON i."id" = t."inventoryItemId"
        WHERE t."businessId" = ${businessId}
          AND t."occurredAt" >= ${range.start}
          AND t."occurredAt" < ${range.end}
          AND t."type" = 'SALE'
          AND t."inventoryItemId" IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM "Transaction" child WHERE child."reversesTransactionId" = t."id"
          )
        GROUP BY i."name"
        ORDER BY SUM(t."amount") DESC
        LIMIT 1
      `,
    ]);

  const aggregate = aggregateRows[0];
  const salesTotal = new Prisma.Decimal(toNumber(aggregate?.salesTotal));
  const cashReceivedTotal = new Prisma.Decimal(toNumber(aggregate?.cashReceivedTotal));
  const creditSalesTotal = new Prisma.Decimal(toNumber(aggregate?.creditSalesTotal));
  const expensesTotal = new Prisma.Decimal(toNumber(aggregate?.expensesTotal));
  const saleProfit = new Prisma.Decimal(toNumber(aggregate?.saleProfit));
  const taxableSalesTotal = new Prisma.Decimal(toNumber(aggregate?.taxableSalesTotal));
  const customerDebtTotal = debts
    .filter(
      (debt) =>
        debt.type === DebtType.CUSTOMER_OWES_BUSINESS && debt.status === DebtStatus.OPEN,
    )
    .reduce((sum, debt) => sum.plus(debt.amount.minus(debt.paidAmount)), new Prisma.Decimal(0));
  const supplierDebtTotal = debts
    .filter(
      (debt) =>
        debt.type === DebtType.BUSINESS_OWES_SUPPLIER && debt.status === DebtStatus.OPEN,
    )
    .reduce((sum, debt) => sum.plus(debt.amount.minus(debt.paidAmount)), new Prisma.Decimal(0));
  const vatRate = business.vatRate.toNumber();
  const nonTaxableSalesTotal = salesTotal.minus(taxableSalesTotal);
  const vatTotal = taxableSalesTotal.mul(vatRate).div(100);
  const previousExpensesTotal = new Prisma.Decimal(
    toNumber(previousExpenseRows[0]?.expensesTotal),
  );
  const topProduct = topProductRows[0]
    ? {
        name: topProductRows[0].name,
        quantity: toNumber(topProductRows[0].quantity),
        salesTotal: toNumber(topProductRows[0].salesTotal),
        profitTotal: toNumber(topProductRows[0].profitTotal),
      }
    : undefined;
  const receivablesAging = getDebtAging(
    debts.filter((debt) => debt.type === DebtType.CUSTOMER_OWES_BUSINESS),
  );
  const payablesAging = getDebtAging(
    debts.filter((debt) => debt.type === DebtType.BUSINESS_OWES_SUPPLIER),
  );
  const profitTotal = saleProfit.minus(expensesTotal);
  const insights = buildReportInsights({
    salesTotal: salesTotal.toNumber(),
    cashReceivedTotal: cashReceivedTotal.toNumber(),
    creditSalesTotal: creditSalesTotal.toNumber(),
    expensesTotal: expensesTotal.toNumber(),
    previousExpensesTotal: previousExpensesTotal.toNumber(),
    customerDebtTotal: customerDebtTotal.toNumber(),
    supplierDebtTotal: supplierDebtTotal.toNumber(),
    topProduct,
  });

  return {
    businessName: business.name,
    period,
    periodLabel: range.label,
    periodStart: range.start.toISOString(),
    periodEnd: range.end.toISOString(),
    month,
    year,
    vatRate,
    salesTotal: salesTotal.toNumber(),
    cashReceivedTotal: cashReceivedTotal.toNumber(),
    creditSalesTotal: creditSalesTotal.toNumber(),
    expensesTotal: expensesTotal.toNumber(),
    profitTotal: profitTotal.toNumber(),
    taxableSalesTotal: taxableSalesTotal.toNumber(),
    nonTaxableSalesTotal: nonTaxableSalesTotal.toNumber(),
    vatTotal: vatTotal.toNumber(),
    customerDebtTotal: customerDebtTotal.toNumber(),
    supplierDebtTotal: supplierDebtTotal.toNumber(),
    receivablesAging,
    payablesAging,
    topProduct,
    insights,
    transactionCount: Math.trunc(toNumber(aggregate?.transactionCount)),
    generatedAt: new Date().toISOString(),
  };
}

export async function saveTaxRunForUser({
  userId,
  businessId,
  month,
  year,
}: {
  userId: string;
  businessId?: string;
  month: number;
  year: number;
}) {
  const business = await requireBusinessAccess(userId, "reports:write", businessId);

  const report = await getMonthlyReport({ businessId: business.businessId, month, year });

  await getPrisma().taxRun.upsert({
    where: {
      businessId_month_year: {
        businessId: business.businessId,
        month,
        year,
      },
    },
    create: {
      businessId: business.businessId,
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
      businessId: business.businessId,
      actorId: userId,
      action: "tax.summary.saved",
      message: `${month}/${year} VAT summary saved.`,
    },
  });

  return report;
}

export async function saveReportSnapshotForUser({
  userId,
  businessId,
  month,
  year,
  period = "month",
  date,
}: {
  userId: string;
  businessId?: string;
  month: number;
  year: number;
  period?: MonthlyReport["period"];
  date?: Date;
}) {
  const business = await requireBusinessAccess(userId, "reports:write", businessId);

  const report = await getMonthlyReport({
    businessId: business.businessId,
    month,
    year,
    period,
    date,
  });

  await getPrisma().reportSnapshot.create({
    data: {
      businessId: business.businessId,
      actorId: userId,
      period,
      periodStart: new Date(report.periodStart),
      periodEnd: new Date(report.periodEnd),
      data: JSON.parse(JSON.stringify(report)) as Prisma.JsonObject,
    },
  });

  await getPrisma().auditLog.create({
    data: {
      businessId: business.businessId,
      actorId: userId,
      action: "report.snapshot.saved",
      message: `${report.periodLabel} report snapshot saved.`,
    },
  });

  return report;
}

function getReportRange({
  period,
  month,
  year,
  date,
}: {
  period: MonthlyReport["period"];
  month: number;
  year: number;
  date?: Date;
}) {
  if (period === "day") {
    const day = date ?? new Date();
    const start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return {
      start,
      end,
      label: new Intl.DateTimeFormat("en-NG", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(start),
    };
  }

  if (period === "week") {
    const selected = date ?? new Date();
    const start = new Date(
      Date.UTC(selected.getUTCFullYear(), selected.getUTCMonth(), selected.getUTCDate()),
    );
    const day = start.getUTCDay() || 7;
    start.setUTCDate(start.getUTCDate() - day + 1);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    return {
      start,
      end,
      label: `Week of ${new Intl.DateTimeFormat("en-NG", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(start)}`,
    };
  }

  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
    label: `${year}-${String(month).padStart(2, "0")}`,
  };
}

function getPreviousReportRange(range: { start: Date; end: Date }) {
  const duration = range.end.getTime() - range.start.getTime();
  return {
    start: new Date(range.start.getTime() - duration),
    end: new Date(range.start),
  };
}

function toNumber(value: number | bigint | string | null | undefined) {
  if (value === null || value === undefined) {
    return 0;
  }

  return Number(value);
}

function getDebtAging(
  debts: Array<{
    amount: Prisma.Decimal;
    paidAmount: Prisma.Decimal;
    dueAt: Date | null;
    createdAt: Date;
  }>,
): AgingBuckets {
  const buckets: AgingBuckets = {
    current: 0,
    days31To60: 0,
    days61To90: 0,
    over90: 0,
  };
  const now = new Date();

  debts.forEach((debt) => {
    const remaining = debt.amount.minus(debt.paidAmount).toNumber();
    const ageDate = debt.dueAt ?? debt.createdAt;
    const ageDays = Math.floor((now.getTime() - ageDate.getTime()) / 86_400_000);

    if (ageDays <= 30) {
      buckets.current += remaining;
    } else if (ageDays <= 60) {
      buckets.days31To60 += remaining;
    } else if (ageDays <= 90) {
      buckets.days61To90 += remaining;
    } else {
      buckets.over90 += remaining;
    }
  });

  return buckets;
}

function buildReportInsights(input: {
  salesTotal: number;
  cashReceivedTotal: number;
  creditSalesTotal: number;
  expensesTotal: number;
  previousExpensesTotal: number;
  customerDebtTotal: number;
  supplierDebtTotal: number;
  topProduct?: MonthlyReport["topProduct"];
}) {
  const insights: string[] = [];

  if (input.salesTotal > 0) {
    insights.push(`You made ${formatNaira(input.salesTotal)} in sales for this period.`);
  }

  if (input.creditSalesTotal > 0) {
    insights.push(
      `${formatNaira(input.creditSalesTotal)} of sales is still customer credit.`,
    );
  }

  if (input.previousExpensesTotal > 0 && input.expensesTotal > input.previousExpensesTotal) {
    insights.push("Expenses rose compared with the previous period.");
  }

  if (input.customerDebtTotal > 0) {
    insights.push(`Customers still owe ${formatNaira(input.customerDebtTotal)}.`);
  }

  if (input.supplierDebtTotal > 0) {
    insights.push(`Open supplier bills are ${formatNaira(input.supplierDebtTotal)}.`);
  }

  if (input.topProduct) {
    insights.push(`${input.topProduct.name} is your top product for this period.`);
  }

  if (insights.length === 0) {
    insights.push("No major movement yet for this period.");
  }

  return insights;
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
      data: { businessId, name: partyName, phone: input.partyPhone },
    });
    return { customerId: customer.id, supplierId: undefined };
  }

  if (input.type === "expense" && input.paymentStatus === "unpaid") {
    const supplier = await tx.supplier.create({
      data: { businessId, name: partyName, phone: input.partyPhone },
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
  dueAt,
  customerId,
  supplierId,
  note,
}: {
  tx: PrismaTransaction;
  businessId: string;
  transactionId: string;
  debt?: MoneyMovement["debt"];
  dueAt?: string;
  customerId?: string;
  supplierId?: string;
  note?: string;
}) {
  if (!debt) {
    return;
  }

  const createdDebt = await tx.debt.create({
    data: {
      businessId,
      customerId: debt.type === "customer_owes_business" ? customerId : undefined,
      supplierId: debt.type === "business_owes_supplier" ? supplierId : undefined,
      sourceTransactionId: transactionId,
      type: toDbDebtType(debt.type),
      amount: debt.amount,
      dueAt: dueAt ? new Date(dueAt) : undefined,
    },
  });

  if (note?.trim()) {
    await tx.debtEvent.create({
      data: {
        debtId: createdDebt.id,
        type: DebtEventType.NOTE,
        note: note.trim(),
      },
    });
  }
}

async function applyAccountDelta(
  tx: PrismaTransaction,
  accountId: string,
  delta: number,
) {
  if (delta === 0) {
    return;
  }

  await tx.account.update({
    where: { id: accountId },
    data:
      delta > 0
        ? { balance: { increment: delta } }
        : { balance: { decrement: Math.abs(delta) } },
  });
}

function mapAccount(account: {
  id: string;
  name: string;
  type: AccountType;
  openingBalance: Prisma.Decimal;
  balance: Prisma.Decimal;
}): Account {
  return {
    id: account.id,
    name: account.name,
    type: account.type.toLowerCase() as Account["type"],
    openingBalance: account.openingBalance.toNumber(),
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
  inventoryItemId: string | null;
  inventoryQuantity: number | null;
  description: string;
  category: string | null;
  paymentStatus: PaymentStatus;
  costOfGoods: Prisma.Decimal;
  profit: Prisma.Decimal;
  occurredAt: Date;
  reversesTransactionId: string | null;
  reversesTransaction?: { type: TransactionType } | null;
  reversalTransaction?: { id: string } | null;
}): Transaction {
  return {
    id: transaction.id,
    idempotencyKey: transaction.idempotencyKey,
    type: transaction.type.toLowerCase() as Transaction["type"],
    amount: transaction.amount.toNumber(),
    accountId: transaction.accountId,
    destinationAccountId: transaction.destinationAccountId ?? undefined,
    inventoryItemId: transaction.inventoryItemId ?? undefined,
    inventoryQuantity: transaction.inventoryQuantity ?? undefined,
    description: transaction.description,
    category: transaction.category ?? undefined,
    paymentStatus: transaction.paymentStatus.toLowerCase() as Transaction["paymentStatus"],
    costOfGoods: transaction.costOfGoods.toNumber(),
    profit: transaction.profit.toNumber(),
    occurredAt: transaction.occurredAt.toISOString(),
    isReversal: Boolean(transaction.reversesTransactionId),
    reversedByTransactionId: transaction.reversalTransaction?.id,
    reversesTransactionId: transaction.reversesTransactionId ?? undefined,
    reversesTransactionType: transaction.reversesTransaction?.type.toLowerCase() as
      | Transaction["type"]
      | undefined,
  };
}

function mapDebt(debt: {
  id: string;
  type: DebtType;
  amount: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
  sourceTransactionId: string;
  dueAt: Date | null;
  status: DebtStatus;
  customer: { name: string; phone: string | null } | null;
  supplier: { name: string; phone: string | null } | null;
  events?: Array<{
    id: string;
    type: DebtEventType;
    amount: Prisma.Decimal | null;
    note: string | null;
    channel: string | null;
    createdAt: Date;
  }>;
}): Debt {
  const amount = debt.amount.toNumber();
  const paidAmount = debt.paidAmount.toNumber();
  const dueAt = debt.dueAt?.toISOString();

  return {
    id: debt.id,
    type: debt.type.toLowerCase() as Debt["type"],
    partyName: debt.customer?.name ?? debt.supplier?.name ?? "Someone",
    partyPhone: debt.customer?.phone ?? debt.supplier?.phone ?? undefined,
    amount,
    paidAmount,
    remainingAmount: Math.max(amount - paidAmount, 0),
    sourceTransactionId: debt.sourceTransactionId,
    dueAt,
    status: debt.status.toLowerCase() as Debt["status"],
    isOverdue:
      debt.status === DebtStatus.OPEN && debt.dueAt ? debt.dueAt < new Date() : false,
    events:
      debt.events?.map((event) => ({
        id: event.id,
        type: event.type.toLowerCase() as Debt["events"][number]["type"],
        amount: event.amount?.toNumber(),
        note: event.note ?? undefined,
        channel: event.channel ?? undefined,
        createdAt: event.createdAt.toISOString(),
      })) ?? [],
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
  movements?: Array<{
    id: string;
    type: InventoryMovementType;
    quantity: number;
    note: string | null;
    createdAt: Date;
  }>;
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
    movements:
      item.movements?.map((movement) => ({
        id: movement.id,
        type: movement.type.toLowerCase() as InventoryItem["movements"][number]["type"],
        quantity: movement.quantity,
        note: movement.note ?? undefined,
        createdAt: movement.createdAt.toISOString(),
      })) ?? [],
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

function toDbAccountType(type: Account["type"]) {
  return type.toUpperCase() as AccountType;
}
