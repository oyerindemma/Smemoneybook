import {
  AccountType,
  DebtEventType,
  DebtStatus,
  DebtType,
  InventoryMovementType,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  PrismaClient,
  Role,
  StockAdjustmentType,
  SubscriptionStatus,
  TransactionType,
} from "@prisma/client";
import type {
  Account,
  AgingBuckets,
  Debt,
  InvoiceLineItem,
  InventoryItem,
  MonthlyReport,
  MoneybookState,
  ReceiptConfig,
  ReportBreakdown,
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
import { getBillingPlanByDbPlan } from "@/lib/billing/plans";
import {
  applyInventoryBalanceChange,
  ensureDefaultLocationInTransaction,
  resolveInventoryLocation,
} from "@/lib/inventory/location-balances";
import {
  getBusinessAccess,
  hasPermission,
  mapRole,
  requireBusinessAccess,
  requireLocationAccess,
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

type CustomerTransactionForHistory = {
  id: string;
  amount: Prisma.Decimal;
  profit: Prisma.Decimal;
  description: string;
  paymentStatus: PaymentStatus;
  occurredAt: Date;
  inventoryQuantity: number | null;
  invoiceItems: Prisma.JsonValue | null;
  inventoryItem: {
    id: string;
    name: string;
  } | null;
};

type InventoryMetadataForReport = {
  id: string;
  name: string;
  category: { name: string } | null;
  brand: { name: string } | null;
};

type ReportSalesBreakdownTransaction = {
  amount: Prisma.Decimal;
  profit: Prisma.Decimal;
  inventoryQuantity: number | null;
  invoiceItems: Prisma.JsonValue | null;
  inventoryItem: InventoryMetadataForReport | null;
};

type ResolvedInvoiceLineItem = InvoiceLineItem & {
  costPrice: number;
  stockQuantity: number;
  quantityOnHandDecimal: number;
};

export async function createBusinessForUser(
  userId: string,
  name: string,
  options: {
    businessType?: string;
    businessCategory?: string;
    country?: string;
    currency?: string;
    onboardingCompleted?: boolean;
  } = {},
) {
  return getPrisma().business.create({
    data: {
      name,
      businessCategory: options.businessCategory,
      businessType: options.businessType,
      country: options.country ?? "NG",
      currency: options.currency ?? "NGN",
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
  locationId?: string,
): Promise<MoneybookState | null> {
  const access = await getBusinessAccess(userId, businessId);

  if (!access) {
    return null;
  }

  return getDashboardState(access.businessId, access.role, userId, locationId);
}

export async function getDashboardState(
  businessId: string,
  role?: Role,
  userId?: string,
  locationId?: string,
): Promise<MoneybookState> {
  const prisma = getPrisma();
  const selectedLocation = await prisma.$transaction((tx) =>
    role && userId
      ? resolveInventoryLocation({ tx, userId, businessId, role, locationId })
      : ensureDefaultLocationInTransaction(tx, businessId),
  );
  const [
    business,
    accounts,
    transactions,
    debts,
    items,
    receiptConfig,
    auditLogs,
    memberships,
    locations,
    activeSubscription,
  ] = await Promise.all([
    prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: {
        id: true,
        name: true,
        businessCategory: true,
        businessType: true,
        country: true,
        currency: true,
        onboardingCompleted: true,
      },
    }),
    prisma.account.findMany({
      where: { businessId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.transaction.findMany({
      where: { businessId, locationId: selectedLocation.id },
      orderBy: { occurredAt: "desc" },
      take: dashboardTransactionLimit,
      include: {
        payments: true,
        location: { select: { id: true, name: true } },
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
      where: { businessId, archivedAt: null },
      orderBy: { updatedAt: "desc" },
      take: dashboardInventoryLimit,
      include: {
        unit: true,
        baseUnit: true,
        sellingUnit: true,
        category: true,
        brand: true,
        locationBalances: {
          where: { locationId: selectedLocation.id },
          take: 1,
          include: {
            location: { select: { id: true, name: true } },
          },
        },
        movements: {
          where: { locationId: selectedLocation.id },
          orderBy: { createdAt: "desc" },
          take: nestedEventLimit,
          include: {
            location: { select: { id: true, name: true } },
          },
        },
      },
    }),
    prisma.receiptConfig.findUnique({
      where: { businessId },
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
    userId && role
      ? prisma.businessLocation.findMany({
          where:
            role === Role.OWNER
              ? { businessId, archivedAt: null }
              : { businessId, archivedAt: null, members: { some: { userId } } },
          orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
          select: {
            id: true,
            name: true,
            type: true,
            isDefault: true,
          },
        })
      : Promise.resolve([]),
    userId
      ? prisma.subscription.findFirst({
          where: {
            businessId,
            status: SubscriptionStatus.ACTIVE,
            OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: new Date() } }],
          },
          orderBy: { updatedAt: "desc" },
        })
      : Promise.resolve(null),
  ]);
  const activePlan = activeSubscription
    ? getBillingPlanByDbPlan(activeSubscription.plan)
    : null;

  return {
    businessId: business.id,
    businessName: business.name,
    businessCategory: business.businessCategory ?? undefined,
    businessType: business.businessType ?? undefined,
    country: business.country,
    currency: business.currency,
    onboardingCompleted: business.onboardingCompleted,
    businesses: memberships.map((membership) => ({
      id: membership.business.id,
      name: membership.business.name,
      role: mapRole(membership.role),
    })),
    locations: locations.map((location) => ({
      id: location.id,
      name: location.name,
      type: location.type.toLowerCase(),
      isDefault: location.isDefault,
    })),
    selectedLocationId: selectedLocation.id,
    selectedLocationName: selectedLocation.name,
    businessRole: role ? mapRole(role) : undefined,
    permissions: role
      ? {
          canManageStaff: hasPermission(role, "admin"),
          canManageAccounts: hasPermission(role, "admin"),
          canSaveReports: hasPermission(role, "reports:write"),
          canExportBackup: hasPermission(role, "backup:read"),
          canViewLocations: hasPermission(role, "locations:view"),
          canManageLocations: hasPermission(role, "locations:create"),
          canViewTransfers: hasPermission(role, "transfers:view"),
          canManageTransfers: hasPermission(role, "transfers:create"),
          canApproveTransfers: hasPermission(role, "transfers:approve"),
          canReceiveTransfers: hasPermission(role, "transfers:receive"),
          canManageTax: hasPermission(role, "admin"),
          canViewStaffPerformance: hasPermission(role, "staff_performance:read"),
          canExportStaffPerformance: hasPermission(role, "staff_performance:export"),
          canViewBankReconciliation: hasPermission(role, "bank_reconciliation:read"),
          canImportBankReconciliation: hasPermission(role, "bank_reconciliation:import"),
          canReviewBankReconciliation:
            hasPermission(role, "bank_reconciliation:review") ||
            hasPermission(role, "bank_reconciliation:match"),
          canExportBankReconciliation: hasPermission(role, "bank_reconciliation:export"),
          canViewTaxAssistant: hasPermission(role, "tax_assistant:read"),
          canAskTaxAssistant: hasPermission(role, "tax_assistant:ask"),
          canReviewTaxAssistant: hasPermission(role, "tax_assistant:review"),
          canExportTaxAssistant: hasPermission(role, "tax_assistant:export"),
          canManageTaxAssistantSettings: hasPermission(role, "tax_assistant:manage_settings"),
        }
      : undefined,
    billing: {
      planId: activePlan?.id ?? "free",
      planName: activePlan?.name ?? "Free",
      features: activePlan?.features ?? [],
    },
    accounts: accounts.map(mapAccount),
    transactions: transactions.map(mapTransaction),
    debts: debts.map(mapDebt),
    items: items.map(mapInventoryItem),
    receiptConfig: receiptConfig ? mapReceiptConfig(receiptConfig) : undefined,
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
  let selectedLocationId = input.locationId;

  await getPrisma().$transaction(async (tx) => {
    const location = await resolveInventoryLocation({
      tx,
      userId,
      businessId: business.businessId,
      role: business.role,
      locationId: input.locationId,
    });
    selectedLocationId = location.id;
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

    const invoiceItems = normalizeInvoiceItems(input);
    const hasInventoryItems = invoiceItems.length > 0;

    if (hasInventoryItems && input.type !== "sale") {
      throw new Error("Products can only be attached to sales.");
    }

    const resolvedInvoiceItems = hasInventoryItems
      ? await resolveInvoiceItems({
          tx,
          businessId: business.businessId,
          invoiceItems,
        })
      : [];
    const primaryInvoiceItem = resolvedInvoiceItems[0];

    if (hasInventoryItems) {
      input.invoiceItems = invoiceItems;
      input.inventoryItemId = primaryInvoiceItem.inventoryItemId;
      input.inventoryQuantity = primaryInvoiceItem.stockQuantity;
      input.amount = sumLineItems(resolvedInvoiceItems, "total");
      input.costOfGoods = sumLineItems(resolvedInvoiceItems, "costTotal");
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
    const amount = inventoryAwareAmount;
    const costOfGoods = inventoryAwareCostOfGoods;
    const profit = inventoryAwareProfit;
    const paymentAllocations = await resolvePaymentAllocations({
      tx,
      businessId: business.businessId,
      input,
      totalAmount: amount,
    });
    const paidAmount = paymentAllocations.reduce(
      (sum, allocation) => sum.plus(allocation.amount),
      new Prisma.Decimal(0),
    );
    const customerBalance = Prisma.Decimal.max(amount.minus(paidAmount), 0);
    const paymentStatus =
      paymentAllocations.length > 0 && input.type === "sale"
        ? customerBalance.gt(0)
          ? PaymentStatus.CREDIT
          : PaymentStatus.PAID
        : toDbPaymentStatus(movementWithInventory.transaction.paymentStatus);

    const party = await findOrCreateParty({
      tx,
      businessId: business.businessId,
      input:
        customerBalance.gt(0) && input.paymentStatus === "paid"
          ? { ...input, paymentStatus: "credit" }
          : input,
    });

    const transaction = await tx.transaction.create({
      data: {
        businessId: business.businessId,
        accountId: input.accountId,
        destinationAccountId: input.destinationAccountId,
        locationId: location.id,
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
        inventoryItemId: primaryInvoiceItem?.inventoryItemId,
        inventoryQuantity:
          primaryInvoiceItem?.quantity === undefined
            ? undefined
            : Math.trunc(primaryInvoiceItem.quantity),
        invoiceItems: hasInventoryItems
          ? resolvedInvoiceItems.map((item) => ({
              inventoryItemId: item.inventoryItemId,
              name: item.name,
              quantity: item.quantity,
              stockQuantity: item.stockQuantity,
              unitPrice: item.unitPrice,
              total: item.total,
            }))
          : undefined,
        occurredAt: movementWithInventory.transaction.occurredAt,
      },
    });

    for (const item of resolvedInvoiceItems) {
      const stockQuantity = new Prisma.Decimal(item.stockQuantity);
      const stockChange = await applyInventoryBalanceChange({
        tx,
        businessId: business.businessId,
        location,
        itemId: item.inventoryItemId,
        changeQuantity: stockQuantity.neg(),
        notEnoughMessage: `You do not have enough stock for ${item.name}.`,
      });

      await tx.inventoryMovement.create({
        data: {
          businessId: business.businessId,
          actorId: userId,
          itemId: item.inventoryItemId,
          accountId: input.accountId,
          locationId: location.id,
          transactionId: transaction.id,
          type: InventoryMovementType.STOCK_OUT,
          adjustmentType: StockAdjustmentType.STOCK_OUT,
          quantity: Math.trunc(item.stockQuantity),
          quantityDecimal: stockQuantity,
          beforeQuantityDecimal: stockChange.beforeLocationQuantity,
          afterQuantityDecimal: stockChange.afterLocationQuantity,
          note: `Sold via ${transaction.description}`,
        },
      });
    }

    if (paymentAllocations.length > 0) {
      for (const allocation of paymentAllocations) {
        if (allocation.accountId) {
          await tx.account.update({
            where: { id: allocation.accountId },
            data: { balance: { increment: allocation.amount } },
          });
        }

        await tx.transactionPayment.create({
          data: {
            businessId: business.businessId,
            transactionId: transaction.id,
            accountId: allocation.accountId,
            locationId: location.id,
            method: allocation.method,
            amount: allocation.amount,
            note: allocation.note,
            idempotencyKey: `${input.idempotencyKey}-${allocation.index}`,
          },
        });
      }
    } else {
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

      if (
        (type === TransactionType.SALE || type === TransactionType.EXPENSE) &&
        paymentStatus === PaymentStatus.PAID
      ) {
        await tx.transactionPayment.create({
          data: {
            businessId: business.businessId,
            transactionId: transaction.id,
            accountId: input.accountId,
            locationId: location.id,
            method: paymentMethodFromAccountType(account.type),
            amount,
            idempotencyKey: `${input.idempotencyKey}-paid`,
          },
        });
      }
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
      debt:
        paymentAllocations.length > 0 && customerBalance.gt(0)
          ? { type: "customer_owes_business", amount: customerBalance.toNumber() }
          : movementWithInventory.debt,
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

  return getDashboardState(business.businessId, business.role, userId, selectedLocationId);
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
  let selectedLocationId: string | undefined;

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

    const location = await resolveInventoryLocation({
      tx,
      userId,
      businessId: business.businessId,
      role: business.role,
      locationId: original.locationId,
    });
    selectedLocationId = location.id;

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

    const itemsToRestore = parseStoredInvoiceItems(original.invoiceItems);

    if (itemsToRestore.length > 0) {
      for (const item of itemsToRestore) {
        const stockQuantity = item.stockQuantity ?? item.quantity;
        const stockChange = await applyInventoryBalanceChange({
          tx,
          businessId: business.businessId,
          location,
          itemId: item.inventoryItemId,
          changeQuantity: stockQuantity,
        });

        await tx.inventoryMovement.create({
          data: {
            businessId: business.businessId,
            actorId: userId,
            itemId: item.inventoryItemId,
            accountId: original.accountId,
            locationId: location.id,
            type: InventoryMovementType.ADJUSTMENT,
            adjustmentType: StockAdjustmentType.CUSTOMER_RETURN,
            quantity: Math.trunc(stockQuantity),
            quantityDecimal: stockQuantity,
            beforeQuantityDecimal: stockChange.beforeLocationQuantity,
            afterQuantityDecimal: stockChange.afterLocationQuantity,
            note: `Restored by reversing ${original.description}`,
          },
        });
      }
    } else if (original.inventoryItemId && original.inventoryQuantity) {
      const stockChange = await applyInventoryBalanceChange({
        tx,
        businessId: business.businessId,
        location,
        itemId: original.inventoryItemId,
        changeQuantity: original.inventoryQuantity,
      });

      await tx.inventoryMovement.create({
        data: {
          businessId: business.businessId,
          actorId: userId,
          itemId: original.inventoryItemId,
          accountId: original.accountId,
          locationId: location.id,
          type: InventoryMovementType.ADJUSTMENT,
          adjustmentType: StockAdjustmentType.CUSTOMER_RETURN,
          quantity: original.inventoryQuantity,
          quantityDecimal: original.inventoryQuantity,
          beforeQuantityDecimal: stockChange.beforeLocationQuantity,
          afterQuantityDecimal: stockChange.afterLocationQuantity,
          note: `Restored by reversing ${original.description}`,
        },
      });
    }

    const reversal = await tx.transaction.create({
      data: {
        businessId: business.businessId,
        accountId: original.accountId,
        destinationAccountId: original.destinationAccountId,
        locationId: location.id,
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
          locationId: location.id,
          reason,
        },
      },
    });
  });

  return getDashboardState(business.businessId, business.role, userId, selectedLocationId);
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
      transactions: {
        where: { type: TransactionType.SALE },
        include: { inventoryItem: true },
        orderBy: { occurredAt: "desc" },
        take: nestedDebtLimit,
      },
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
    const productCounts = new Map<string, { quantity: number; salesTotal: number }>();
    const pricingByProduct = new Map<
      string,
      {
        inventoryItemId: string;
        productName: string;
        purchases: number;
        quantity: number;
        salesTotal: number;
        lastUnitPrice: number;
        lowestUnitPrice: number;
        highestUnitPrice: number;
        lastPurchasedAt: string;
      }
    >();

    for (const transaction of customer.transactions) {
      const lineItems = getCustomerSaleLineItems(transaction);

      for (const line of lineItems) {
        const current = productCounts.get(line.name) ?? { quantity: 0, salesTotal: 0 };
        productCounts.set(line.name, {
          quantity: current.quantity + line.quantity,
          salesTotal: current.salesTotal + line.total,
        });

        const pricingKey = line.inventoryItemId || line.name;
        const unitPrice =
          line.unitPrice || (line.quantity > 0 ? line.total / line.quantity : 0);
        const existingPricing = pricingByProduct.get(pricingKey);

        if (existingPricing) {
          pricingByProduct.set(pricingKey, {
            ...existingPricing,
            purchases: existingPricing.purchases + 1,
            quantity: existingPricing.quantity + line.quantity,
            salesTotal: existingPricing.salesTotal + line.total,
            lowestUnitPrice: Math.min(existingPricing.lowestUnitPrice, unitPrice),
            highestUnitPrice: Math.max(existingPricing.highestUnitPrice, unitPrice),
          });
        } else {
          pricingByProduct.set(pricingKey, {
            inventoryItemId: line.inventoryItemId,
            productName: line.name,
            purchases: 1,
            quantity: line.quantity,
            salesTotal: line.total,
            lastUnitPrice: unitPrice,
            lowestUnitPrice: unitPrice,
            highestUnitPrice: unitPrice,
            lastPurchasedAt: transaction.occurredAt.toISOString(),
          });
        }
      }
    }

    const mostBoughtProduct = Array.from(productCounts.entries()).sort(
      (first, second) => second[1].quantity - first[1].quantity,
    )[0]?.[0];
    const purchaseHistory = customer.transactions.map((transaction) => ({
      id: transaction.id,
      occurredAt: transaction.occurredAt.toISOString(),
      description: transaction.description,
      total: transaction.amount.toNumber(),
      profit: transaction.profit.toNumber(),
      paymentStatus: transaction.paymentStatus.toLowerCase(),
      items: getCustomerSaleLineItems(transaction).slice(0, 5),
    }));
    const pricingHistory = Array.from(pricingByProduct.values()).sort(
      (first, second) =>
        new Date(second.lastPurchasedAt).getTime() - new Date(first.lastPurchasedAt).getTime(),
    );

    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      totalBought: customer.transactions.reduce(
        (sum, transaction) => sum + transaction.amount.toNumber(),
        0,
      ),
      lastPurchase: customer.transactions[0]?.occurredAt.toISOString(),
      mostBoughtProduct,
      purchaseHistory,
      pricingHistory,
      openDebtTotal: debts.reduce((sum, debt) => sum + debt.remainingAmount, 0),
      overdueCount: debts.filter((debt) => debt.isOverdue).length,
      debts,
    };
  });
}

function getCustomerSaleLineItems(transaction: CustomerTransactionForHistory) {
  const storedLineItems = parseStoredInvoiceItems(transaction.invoiceItems);

  if (storedLineItems.length > 0) {
    return storedLineItems.map((item) => ({
      inventoryItemId: item.inventoryItemId,
      name: item.name,
      quantity: item.quantity,
      stockQuantity: item.stockQuantity,
      unitLabel: item.unitLabel,
      unitPrice: item.unitPrice,
      total: item.total,
    }));
  }

  if (!transaction.inventoryItem) {
    return [];
  }

  const quantity = transaction.inventoryQuantity ?? 1;
  const total = transaction.amount.toNumber();

  return [
    {
      inventoryItemId: transaction.inventoryItem.id,
      name: transaction.inventoryItem.name,
      quantity,
      stockQuantity: undefined,
      unitLabel: undefined,
      unitPrice: quantity > 0 ? total / quantity : total,
      total,
    },
  ];
}

export async function createCustomerForUser({
  userId,
  businessId,
  name,
  phone,
}: {
  userId: string;
  businessId?: string;
  name: string;
  phone?: string;
}) {
  const business = await requireBusinessAccess(userId, "money:write", businessId);

  await getPrisma().customer.create({
    data: {
      businessId: business.businessId,
      name,
      phone: phone || null,
    },
  });

  await getPrisma().auditLog.create({
    data: {
      businessId: business.businessId,
      actorId: userId,
      action: "customer.created",
      message: `${name} added as a customer.`,
    },
  });

  return getDashboardState(business.businessId, business.role, userId);
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
    where: { businessId: business.businessId, archivedAt: null },
    take: listPageLimit,
    include: {
      unit: true,
      baseUnit: true,
      sellingUnit: true,
      category: true,
      brand: true,
      movements: { orderBy: { createdAt: "desc" }, take: nestedEventLimit },
    },
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
  barcode,
  unitId,
  unitName,
  baseUnitId,
  baseUnitName,
  sellingUnitId,
  sellingUnitName,
  conversionFactor,
  categoryId,
  categoryName,
  brandId,
  brandName,
  locationId,
}: {
  userId: string;
  businessId?: string;
  name: string;
  sellingPrice: number;
  costPrice: number;
  quantityOnHand: number;
  lowStockLevel: number;
  sku?: string;
  barcode?: string;
  unitId?: string;
  unitName?: string;
  baseUnitId?: string;
  baseUnitName?: string;
  sellingUnitId?: string;
  sellingUnitName?: string;
  conversionFactor?: number;
  categoryId?: string;
  categoryName?: string;
  brandId?: string;
  brandName?: string;
  locationId?: string;
}) {
  const business = await requireBusinessAccess(userId, "inventory:write", businessId);
  const prisma = getPrisma();

  const unit = await resolveProductUnit({ businessId: business.businessId, unitId, unitName });
  const baseUnit = await resolveProductUnit({
    businessId: business.businessId,
    unitId: baseUnitId,
    unitName: baseUnitName,
  });
  const sellingUnit = await resolveProductUnit({
    businessId: business.businessId,
    unitId: sellingUnitId,
    unitName: sellingUnitName,
  });
  const [category, brand] = await Promise.all([
    resolveProductCategory({ businessId: business.businessId, categoryId, categoryName }),
    resolveProductBrand({ businessId: business.businessId, brandId, brandName }),
  ]);
  const stockUnit = baseUnit ?? unit;
  const salesUnit = sellingUnit ?? stockUnit;
  const usesConvertedSaleUnit =
    Boolean(stockUnit && salesUnit && stockUnit.id !== salesUnit.id);
  const normalizedConversionFactor = usesConvertedSaleUnit ? conversionFactor : undefined;

  if (barcode && sku && barcode === sku) {
    throw new Error("Use a SKU that is different from the barcode.");
  }

  if (barcode) {
    const existingCode = await prisma.inventoryItem.findFirst({
      where: {
        businessId: business.businessId,
        OR: [{ barcode }, { sku: barcode }, { internalCode: barcode }],
        archivedAt: null,
      },
      select: { id: true, name: true },
    });

    if (existingCode) {
      throw new Error(`This barcode is already assigned to ${existingCode.name}.`);
    }
  }

  if (sku) {
    const existingSku = await prisma.inventoryItem.findFirst({
      where: {
        businessId: business.businessId,
        OR: [{ sku }, { barcode: sku }, { internalCode: sku }],
        archivedAt: null,
      },
      select: { id: true, name: true },
    });

    if (existingSku) {
      throw new Error(`This SKU is already assigned to ${existingSku.name}.`);
    }
  }

  let selectedLocationId = locationId;

  await prisma.$transaction(async (tx) => {
    const location = await resolveInventoryLocation({
      tx,
      userId,
      businessId: business.businessId,
      role: business.role,
      locationId,
    });
    selectedLocationId = location.id;
    const item = await tx.inventoryItem.create({
      data: {
        businessId: business.businessId,
        name,
        sku: sku || null,
        barcode: barcode || null,
        internalCode: barcode ? null : createInternalProductCode(),
        sellingPrice,
        costPrice,
        quantityOnHand: Math.trunc(quantityOnHand),
        quantityOnHandDecimal: quantityOnHand,
        lowStockLevel: Math.trunc(lowStockLevel),
        lowStockLevelDecimal: lowStockLevel,
        unitId: stockUnit?.id,
        baseUnitId: stockUnit?.id,
        sellingUnitId: salesUnit?.id,
        conversionFactor: normalizedConversionFactor,
        categoryId: category?.id,
        brandId: brand?.id,
      },
    });

    await tx.inventoryBalance.create({
      data: {
        businessId: business.businessId,
        locationId: location.id,
        inventoryItemId: item.id,
        quantityOnHandDecimal: quantityOnHand,
        lowStockLevelDecimal: lowStockLevel,
      },
    });

    if (quantityOnHand > 0) {
      await tx.inventoryMovement.create({
        data: {
          businessId: business.businessId,
          actorId: userId,
          itemId: item.id,
          locationId: location.id,
          type: InventoryMovementType.STOCK_IN,
          adjustmentType: StockAdjustmentType.STOCK_IN,
          quantity: Math.trunc(quantityOnHand),
          quantityDecimal: quantityOnHand,
          beforeQuantityDecimal: 0,
          afterQuantityDecimal: quantityOnHand,
          note: "Opening stock",
        },
      });
    }

    await tx.auditLog.create({
      data: {
        businessId: business.businessId,
        actorId: userId,
        action: "inventory.item.created",
        message: `${name} added to stock.`,
        metadata: {
          itemId: item.id,
          locationId: location.id,
          openingQuantity: quantityOnHand,
        },
      },
    });
  });

  return getDashboardState(business.businessId, business.role, userId, selectedLocationId);
}

export async function moveInventoryForUser({
  userId,
  businessId,
  itemId,
  quantity,
  direction,
  adjustmentType,
  reason,
  note,
  attachmentUrl,
  idempotencyKey,
  locationId,
}: {
  userId: string;
  businessId?: string;
  itemId: string;
  quantity: number;
  direction: "in" | "out";
  locationId?: string;
  adjustmentType?: string;
  reason?: string;
  note?: string;
  attachmentUrl?: string;
  idempotencyKey?: string;
}) {
  const business = await requireBusinessAccess(userId, "inventory:write", businessId);
  let selectedLocationId = locationId;

  await getPrisma().$transaction(async (tx) => {
    const location = await resolveInventoryLocation({
      tx,
      userId,
      businessId: business.businessId,
      role: business.role,
      locationId,
    });
    selectedLocationId = location.id;

    if (idempotencyKey) {
      const existing = await tx.inventoryMovement.findUnique({
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
    }

    const changeQuantity = new Prisma.Decimal(quantity);
    const stockChange = await applyInventoryBalanceChange({
      tx,
      businessId: business.businessId,
      location,
      itemId,
      changeQuantity: direction === "in" ? changeQuantity : changeQuantity.neg(),
      notEnoughMessage: "You do not have enough stock for this.",
    });

    await tx.inventoryMovement.create({
      data: {
        businessId: business.businessId,
        actorId: userId,
        itemId,
        locationId: location.id,
        type:
          direction === "in"
            ? InventoryMovementType.STOCK_IN
            : InventoryMovementType.STOCK_OUT,
        adjustmentType: toDbStockAdjustmentType(adjustmentType, direction),
        quantity: Math.trunc(quantity),
        quantityDecimal: quantity,
        beforeQuantityDecimal: stockChange.beforeLocationQuantity,
        afterQuantityDecimal: stockChange.afterLocationQuantity,
        reason: reason || undefined,
        note: note || (direction === "in" ? "Stock added" : "Stock removed"),
        attachmentUrl: attachmentUrl || undefined,
        idempotencyKey,
      },
    });

    await tx.auditLog.create({
      data: {
        businessId: business.businessId,
        actorId: userId,
        action: direction === "in" ? "inventory.stock_in" : "inventory.stock_out",
        message: `${quantity} ${stockChange.item.name} ${direction === "in" ? "added" : "removed"}.`,
        metadata: {
          itemId,
          locationId: location.id,
          beforeQuantity: stockChange.beforeLocationQuantity.toNumber(),
          changeQuantity: quantity,
          afterQuantity: stockChange.afterLocationQuantity.toNumber(),
          adjustmentType,
          reason,
          idempotencyKey,
        },
      },
    });
  });

  return getDashboardState(business.businessId, business.role, userId, selectedLocationId);
}

export async function getMonthlyReportForUser({
  userId,
  businessId,
  locationId,
  month,
  year,
  period = "month",
  date,
}: {
  userId: string;
  businessId?: string;
  locationId?: string;
  month: number;
  year: number;
  period?: MonthlyReport["period"];
  date?: Date;
}): Promise<MonthlyReport | null> {
  const business = await requireBusinessAccess(userId, "reports:write", businessId);

  if (!business) {
    return null;
  }

  if (locationId) {
    await requireLocationAccess({
      userId,
      businessId: business.businessId,
      locationId,
      permission: "reports:write",
    });
  }

  return getMonthlyReport({
    businessId: business.businessId,
    locationId,
    month,
    year,
    period,
    date,
  });
}

export async function getMonthlyReport({
  businessId,
  locationId,
  month,
  year,
  period = "month",
  date,
}: {
  businessId: string;
  locationId?: string;
  month: number;
  year: number;
  period?: MonthlyReport["period"];
  date?: Date;
}): Promise<MonthlyReport> {
  const range = getReportRange({ period, month, year, date });
  const previousRange = getPreviousReportRange(range);
  const prisma = getPrisma();
  const locationSql = locationId
    ? Prisma.sql`AND t."locationId" = ${locationId}`
    : Prisma.empty;
  const [
    business,
    location,
    aggregateRows,
    previousExpenseRows,
    debts,
    topProductRows,
    salesBreakdownTransactions,
    inventoryMetadata,
  ] =
    await Promise.all([
      prisma.business.findUniqueOrThrow({
        where: { id: businessId },
        select: { name: true, vatRate: true },
      }),
      locationId
        ? prisma.businessLocation.findFirst({
            where: { id: locationId, businessId, archivedAt: null },
            select: { id: true, name: true },
          })
        : Promise.resolve(null),
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
          ${locationSql}
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
          ${locationSql}
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
          ${locationSql}
          AND t."type" = 'SALE'
          AND t."inventoryItemId" IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM "Transaction" child WHERE child."reversesTransactionId" = t."id"
          )
        GROUP BY i."name"
        ORDER BY SUM(t."amount") DESC
        LIMIT 1
      `,
      prisma.transaction.findMany({
        where: {
          businessId,
          ...(locationId ? { locationId } : {}),
          occurredAt: { gte: range.start, lt: range.end },
          type: TransactionType.SALE,
          reversalTransaction: { is: null },
        },
        select: {
          amount: true,
          profit: true,
          inventoryQuantity: true,
          invoiceItems: true,
          inventoryItem: {
            select: {
              id: true,
              name: true,
              category: { select: { name: true } },
              brand: { select: { name: true } },
            },
          },
        },
      }),
      prisma.inventoryItem.findMany({
        where: { businessId },
        select: {
          id: true,
          name: true,
          category: { select: { name: true } },
          brand: { select: { name: true } },
        },
      }),
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
  const { categoryBreakdown, brandBreakdown } = buildProductReportBreakdowns(
    salesBreakdownTransactions,
    inventoryMetadata,
  );
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
    topCategory: categoryBreakdown[0],
    topBrand: brandBreakdown[0],
  });

  return {
    businessName: business.name,
    locationId: location?.id,
    locationName: location?.name,
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
    categoryBreakdown,
    brandBreakdown,
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
  locationId,
  month,
  year,
  period = "month",
  date,
}: {
  userId: string;
  businessId?: string;
  locationId?: string;
  month: number;
  year: number;
  period?: MonthlyReport["period"];
  date?: Date;
}) {
  const business = await requireBusinessAccess(userId, "reports:write", businessId);

  if (locationId) {
    await requireLocationAccess({
      userId,
      businessId: business.businessId,
      locationId,
      permission: "reports:write",
    });
  }

  const report = await getMonthlyReport({
    businessId: business.businessId,
    locationId,
    month,
    year,
    period,
    date,
  });

  await getPrisma().reportSnapshot.create({
    data: {
      businessId: business.businessId,
      locationId,
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

function buildProductReportBreakdowns(
  transactions: ReportSalesBreakdownTransaction[],
  inventoryItems: InventoryMetadataForReport[],
) {
  const inventoryById = new Map(inventoryItems.map((item) => [item.id, item]));
  const categoryByName = new Map<string, ReportBreakdown>();
  const brandByName = new Map<string, ReportBreakdown>();

  for (const transaction of transactions) {
    for (const line of getReportBreakdownLines(transaction, inventoryById)) {
      addReportBreakdown(categoryByName, line.categoryName, line);
      addReportBreakdown(brandByName, line.brandName, line);
    }
  }

  return {
    categoryBreakdown: sortReportBreakdowns(categoryByName),
    brandBreakdown: sortReportBreakdowns(brandByName),
  };
}

function getReportBreakdownLines(
  transaction: ReportSalesBreakdownTransaction,
  inventoryById: Map<string, InventoryMetadataForReport>,
) {
  const storedLineItems = parseStoredInvoiceItems(transaction.invoiceItems);
  const amount = transaction.amount.toNumber();
  const profit = transaction.profit.toNumber();

  if (storedLineItems.length > 0) {
    return storedLineItems.flatMap((line) => {
      const metadata = inventoryById.get(line.inventoryItemId);

      if (!metadata) {
        return [];
      }

      const salesTotal = line.total;
      const profitTotal = amount > 0 ? profit * (salesTotal / amount) : 0;

      return [
        {
          categoryName: metadata.category?.name ?? "Uncategorized",
          brandName: metadata.brand?.name ?? "Unbranded",
          quantity: line.quantity,
          salesTotal,
          profitTotal,
        },
      ];
    });
  }

  if (!transaction.inventoryItem) {
    return [];
  }

  return [
    {
      categoryName: transaction.inventoryItem.category?.name ?? "Uncategorized",
      brandName: transaction.inventoryItem.brand?.name ?? "Unbranded",
      quantity: transaction.inventoryQuantity ?? 1,
      salesTotal: amount,
      profitTotal: profit,
    },
  ];
}

function addReportBreakdown(
  breakdowns: Map<string, ReportBreakdown>,
  name: string,
  line: { quantity: number; salesTotal: number; profitTotal: number },
) {
  const current = breakdowns.get(name) ?? {
    name,
    quantity: 0,
    salesTotal: 0,
    profitTotal: 0,
  };

  breakdowns.set(name, {
    name,
    quantity: current.quantity + line.quantity,
    salesTotal: current.salesTotal + line.salesTotal,
    profitTotal: current.profitTotal + line.profitTotal,
  });
}

function sortReportBreakdowns(breakdowns: Map<string, ReportBreakdown>) {
  return Array.from(breakdowns.values())
    .sort((first, second) => second.salesTotal - first.salesTotal)
    .slice(0, 10);
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
  topCategory?: ReportBreakdown;
  topBrand?: ReportBreakdown;
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

  if (input.topCategory) {
    insights.push(`${input.topCategory.name} is your top category by sales.`);
  }

  if (input.topBrand) {
    insights.push(`${input.topBrand.name} is your top brand by sales.`);
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

async function resolvePaymentAllocations({
  tx,
  businessId,
  input,
  totalAmount,
}: {
  tx: PrismaTransaction;
  businessId: string;
  input: TransactionInput;
  totalAmount: Prisma.Decimal;
}) {
  if (!input.paymentAllocations?.length) {
    return [];
  }

  const paidAllocations = input.paymentAllocations
    .map((allocation, index) => ({
      index,
      method: toDbPaymentMethod(allocation.method),
      amount: new Prisma.Decimal(allocation.amount),
      accountId: allocation.accountId || input.accountId,
      note: allocation.note?.trim() || undefined,
    }))
    .filter((allocation) => allocation.method !== PaymentMethod.CREDIT);
  const paidTotal = paidAllocations.reduce(
    (sum, allocation) => sum.plus(allocation.amount),
    new Prisma.Decimal(0),
  );

  if (paidTotal.gt(totalAmount)) {
    throw new Error("Payment amounts cannot be more than the sale total.");
  }

  const accountIds = Array.from(
    new Set(paidAllocations.map((allocation) => allocation.accountId).filter(Boolean)),
  ) as string[];

  if (accountIds.length > 0) {
    const accountCount = await tx.account.count({
      where: {
        businessId,
        id: { in: accountIds },
      },
    });

    if (accountCount !== accountIds.length) {
      throw new Error("Choose valid money accounts for the payments.");
    }
  }

  return paidAllocations;
}

async function resolveProductUnit({
  businessId,
  unitId,
  unitName,
}: {
  businessId: string;
  unitId?: string;
  unitName?: string;
}) {
  const prisma = getPrisma();

  if (unitId) {
    const unit = await prisma.productUnit.findFirst({
      where: {
        id: unitId,
        archivedAt: null,
        OR: [{ businessId }, { businessId: null }],
      },
    });

    if (!unit) {
      throw new Error("Choose a valid product unit.");
    }

    return unit;
  }

  const name = unitName?.trim();

  if (!name) {
    return null;
  }

  const existing = await prisma.productUnit.findFirst({
    where: {
      businessId,
      archivedAt: null,
      name,
    },
  });

  if (existing) {
    return existing;
  }

  return prisma.productUnit.create({
    data: {
      businessId,
      name,
      singularLabel: name,
      pluralLabel: `${name}s`,
      allowsDecimal: false,
    },
  });
}

async function resolveProductCategory({
  businessId,
  categoryId,
  categoryName,
}: {
  businessId: string;
  categoryId?: string;
  categoryName?: string;
}) {
  const prisma = getPrisma();

  if (categoryId) {
    const category = await prisma.productCategory.findFirst({
      where: { id: categoryId, businessId, archivedAt: null },
    });

    if (!category) {
      throw new Error("Choose a valid product category.");
    }

    return category;
  }

  const name = categoryName?.trim();

  if (!name) {
    return null;
  }

  return prisma.productCategory.upsert({
    where: { businessId_name: { businessId, name } },
    create: { businessId, name },
    update: { archivedAt: null },
  });
}

async function resolveProductBrand({
  businessId,
  brandId,
  brandName,
}: {
  businessId: string;
  brandId?: string;
  brandName?: string;
}) {
  const prisma = getPrisma();

  if (brandId) {
    const brand = await prisma.productBrand.findFirst({
      where: { id: brandId, businessId, archivedAt: null },
    });

    if (!brand) {
      throw new Error("Choose a valid product brand.");
    }

    return brand;
  }

  const name = brandName?.trim();

  if (!name) {
    return null;
  }

  return prisma.productBrand.upsert({
    where: { businessId_name: { businessId, name } },
    create: { businessId, name },
    update: { archivedAt: null },
  });
}

function normalizeInvoiceItems(input: TransactionInput) {
  const rawItems =
    input.invoiceItems && input.invoiceItems.length > 0
      ? input.invoiceItems
      : input.inventoryItemId
        ? [
            {
              inventoryItemId: input.inventoryItemId,
              quantity: input.inventoryQuantity ?? 1,
            },
          ]
        : [];
  const quantityByItemId = new Map<string, number>();

  for (const item of rawItems) {
    const inventoryItemId = item.inventoryItemId?.trim();
    const quantity = Math.max(Number(item.quantity) || 0, 0);

    if (!inventoryItemId || quantity <= 0) {
      continue;
    }

    quantityByItemId.set(
      inventoryItemId,
      (quantityByItemId.get(inventoryItemId) ?? 0) + quantity,
    );
  }

  return Array.from(quantityByItemId, ([inventoryItemId, quantity]) => ({
    inventoryItemId,
    quantity,
  }));
}

async function resolveInvoiceItems({
  tx,
  businessId,
  invoiceItems,
}: {
  tx: PrismaTransaction;
  businessId: string;
  invoiceItems: Array<{ inventoryItemId: string; quantity: number }>;
}): Promise<ResolvedInvoiceLineItem[]> {
  const inventoryRecords = await tx.inventoryItem.findMany({
    where: {
      businessId,
      id: { in: invoiceItems.map((item) => item.inventoryItemId) },
    },
  });
  const inventoryById = new Map(inventoryRecords.map((item) => [item.id, item]));

  return invoiceItems.map((item) => {
    const inventoryItem = inventoryById.get(item.inventoryItemId);

    if (!inventoryItem) {
      throw new Error("Choose a valid product.");
    }

    const saleQuantity = new Prisma.Decimal(item.quantity);
    const stockQuantity = saleQuantity.mul(getInventoryConversionFactor(inventoryItem));

    if (inventoryItem.quantityOnHandDecimal.lt(stockQuantity)) {
      throw new Error(`You do not have enough stock for ${inventoryItem.name}.`);
    }

    const unitPrice = inventoryItem.sellingPrice.toNumber();
    const costPrice = inventoryItem.costPrice.toNumber();

    return {
      inventoryItemId: item.inventoryItemId,
      name: inventoryItem.name,
      quantity: saleQuantity.toNumber(),
      stockQuantity: stockQuantity.toNumber(),
      unitPrice,
      costPrice,
      total: unitPrice * saleQuantity.toNumber(),
      quantityOnHandDecimal: inventoryItem.quantityOnHandDecimal.toNumber(),
    };
  });
}

function sumLineItems(
  items: ResolvedInvoiceLineItem[],
  field: "total" | "costTotal",
) {
  return items.reduce((total, item) => {
    if (field === "costTotal") {
      return total + item.costPrice * item.quantity;
    }

    return total + item.total;
  }, 0);
}

function parseStoredInvoiceItems(value: Prisma.JsonValue | null | undefined): InvoiceLineItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const candidate = item as Record<string, unknown>;
    const inventoryItemId =
      typeof candidate.inventoryItemId === "string" ? candidate.inventoryItemId : "";
    const name = typeof candidate.name === "string" ? candidate.name : "";
    const quantity = Number(candidate.quantity);
    const stockQuantity = Number(candidate.stockQuantity);
    const unitLabel = typeof candidate.unitLabel === "string" ? candidate.unitLabel : undefined;
    const unitPrice = Number(candidate.unitPrice);
    const total = Number(candidate.total);

    if (!inventoryItemId || !name || !Number.isFinite(quantity) || quantity <= 0) {
      return [];
    }

    return [
      {
        inventoryItemId,
        name,
        quantity,
        stockQuantity: Number.isFinite(stockQuantity) && stockQuantity > 0 ? stockQuantity : undefined,
        unitLabel,
        unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
        total: Number.isFinite(total) ? total : 0,
      },
    ];
  });
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

function getInventoryConversionFactor(item: { conversionFactor: Prisma.Decimal | null }) {
  return item.conversionFactor && item.conversionFactor.gt(0)
    ? item.conversionFactor
    : new Prisma.Decimal(1);
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

function mapReceiptConfig(config: {
  logoUrl: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  taxId: string | null;
  footerMessage: string | null;
  includePoweredBy: boolean;
  defaultPaperSize: string;
}): ReceiptConfig {
  const defaultPaperSize = ["58mm", "80mm", "pdf"].includes(config.defaultPaperSize)
    ? (config.defaultPaperSize as ReceiptConfig["defaultPaperSize"])
    : "80mm";

  return {
    logoUrl: config.logoUrl ?? undefined,
    address: config.address ?? undefined,
    phone: config.phone ?? undefined,
    email: config.email ?? undefined,
    taxId: config.taxId ?? undefined,
    footerMessage: config.footerMessage ?? undefined,
    includePoweredBy: config.includePoweredBy,
    defaultPaperSize,
  };
}

function mapTransaction(transaction: {
  id: string;
  idempotencyKey: string;
  type: TransactionType;
  amount: Prisma.Decimal;
  accountId: string;
  destinationAccountId: string | null;
  locationId?: string | null;
  location?: { id: string; name: string } | null;
  inventoryItemId: string | null;
  inventoryQuantity: number | null;
  invoiceItems: Prisma.JsonValue | null;
  description: string;
  category: string | null;
  paymentStatus: PaymentStatus;
  costOfGoods: Prisma.Decimal;
  profit: Prisma.Decimal;
  occurredAt: Date;
  reversesTransactionId: string | null;
  reversesTransaction?: { type: TransactionType } | null;
  reversalTransaction?: { id: string } | null;
  payments?: Array<{
    method: PaymentMethod;
    amount: Prisma.Decimal;
    accountId: string | null;
    note: string | null;
  }>;
}): Transaction {
  return {
    id: transaction.id,
    idempotencyKey: transaction.idempotencyKey,
    type: transaction.type.toLowerCase() as Transaction["type"],
    amount: transaction.amount.toNumber(),
    accountId: transaction.accountId,
    destinationAccountId: transaction.destinationAccountId ?? undefined,
    locationId: transaction.locationId ?? transaction.location?.id ?? undefined,
    locationName: transaction.location?.name,
    inventoryItemId: transaction.inventoryItemId ?? undefined,
    inventoryQuantity: transaction.inventoryQuantity ?? undefined,
    invoiceItems: parseStoredInvoiceItems(transaction.invoiceItems),
    payments: transaction.payments?.map((payment) => ({
      method: payment.method
        .toLowerCase() as NonNullable<Transaction["payments"]>[number]["method"],
      amount: payment.amount.toNumber(),
      accountId: payment.accountId ?? undefined,
      note: payment.note ?? undefined,
    })),
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
  barcode?: string | null;
  internalCode?: string | null;
  sellingPrice: Prisma.Decimal;
  costPrice: Prisma.Decimal;
  quantityOnHand: number;
  quantityOnHandDecimal?: Prisma.Decimal;
  lowStockLevel: number;
  lowStockLevelDecimal?: Prisma.Decimal;
  unitId?: string | null;
  baseUnitId?: string | null;
  sellingUnitId?: string | null;
  conversionFactor?: Prisma.Decimal | null;
  categoryId?: string | null;
  brandId?: string | null;
  unit?: {
    name: string;
    singularLabel: string;
    pluralLabel: string;
    allowsDecimal: boolean;
  } | null;
  baseUnit?: {
    name: string;
    singularLabel: string;
    pluralLabel: string;
    allowsDecimal: boolean;
  } | null;
  sellingUnit?: {
    name: string;
    singularLabel: string;
    pluralLabel: string;
    allowsDecimal: boolean;
  } | null;
  category?: { name: string } | null;
  brand?: { name: string } | null;
  movements?: Array<{
    id: string;
    type: InventoryMovementType;
    quantity: number;
    quantityDecimal?: Prisma.Decimal;
    beforeQuantityDecimal?: Prisma.Decimal | null;
    afterQuantityDecimal?: Prisma.Decimal | null;
    adjustmentType?: StockAdjustmentType | null;
    reason?: string | null;
    note: string | null;
    locationId?: string | null;
    location?: { id: string; name: string } | null;
    createdAt: Date;
  }>;
  locationBalances?: Array<{
    locationId: string;
    quantityOnHandDecimal: Prisma.Decimal;
    lowStockLevelDecimal: Prisma.Decimal;
    location?: { id: string; name: string } | null;
  }>;
}): InventoryItem {
  const sellingPrice = item.sellingPrice.toNumber();
  const costPrice = item.costPrice.toNumber();
  const baseUnit = item.baseUnit ?? item.unit;
  const sellingUnit = item.sellingUnit ?? item.unit;
  const selectedBalance = item.locationBalances?.[0];
  const quantityOnHandDecimal =
    selectedBalance?.quantityOnHandDecimal ?? item.quantityOnHandDecimal;
  const lowStockLevelDecimal =
    selectedBalance?.lowStockLevelDecimal ?? item.lowStockLevelDecimal;
  const quantityOnHand = Math.trunc(quantityOnHandDecimal?.toNumber() ?? item.quantityOnHand);

  return {
    id: item.id,
    name: item.name,
    sku: item.sku ?? undefined,
    barcode: item.barcode ?? undefined,
    internalCode: item.internalCode ?? undefined,
    unitId: item.unitId ?? undefined,
    unitName: item.unit?.name ?? baseUnit?.name,
    unitSingular: item.unit?.singularLabel ?? baseUnit?.singularLabel,
    unitPlural: item.unit?.pluralLabel ?? baseUnit?.pluralLabel,
    allowsDecimalQuantity: baseUnit?.allowsDecimal ?? item.unit?.allowsDecimal,
    baseUnitId: item.baseUnitId ?? undefined,
    baseUnitName: baseUnit?.name,
    baseUnitSingular: baseUnit?.singularLabel,
    baseUnitPlural: baseUnit?.pluralLabel,
    baseUnitAllowsDecimal: baseUnit?.allowsDecimal,
    sellingUnitId: item.sellingUnitId ?? undefined,
    sellingUnitName: sellingUnit?.name,
    sellingUnitSingular: sellingUnit?.singularLabel,
    sellingUnitPlural: sellingUnit?.pluralLabel,
    sellingUnitAllowsDecimal: sellingUnit?.allowsDecimal,
    conversionFactor: item.conversionFactor?.toNumber(),
    categoryId: item.categoryId ?? undefined,
    categoryName: item.category?.name,
    brandId: item.brandId ?? undefined,
    brandName: item.brand?.name,
    sellingPrice,
    costPrice,
    quantityOnHand,
    quantityOnHandDecimal: quantityOnHandDecimal?.toNumber(),
    locationId: selectedBalance?.locationId,
    locationName: selectedBalance?.location?.name,
    lowStockLevel: item.lowStockLevel,
    lowStockLevelDecimal: lowStockLevelDecimal?.toNumber(),
    profitPerItem: sellingPrice - costPrice,
    isLowStock:
      (quantityOnHandDecimal?.toNumber() ?? item.quantityOnHand) <=
      (lowStockLevelDecimal?.toNumber() ?? item.lowStockLevel),
    movements:
      item.movements?.map((movement) => ({
        id: movement.id,
        type: movement.type.toLowerCase() as InventoryItem["movements"][number]["type"],
        quantity: movement.quantity,
        quantityDecimal: movement.quantityDecimal?.toNumber(),
        beforeQuantity: movement.beforeQuantityDecimal?.toNumber(),
        afterQuantity: movement.afterQuantityDecimal?.toNumber(),
        locationId: movement.locationId ?? movement.location?.id,
        locationName: movement.location?.name,
        adjustmentType: movement.adjustmentType?.toLowerCase() as
          | InventoryItem["movements"][number]["adjustmentType"]
          | undefined,
        reason: movement.reason ?? undefined,
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

function toDbPaymentMethod(method: NonNullable<TransactionInput["paymentAllocations"]>[number]["method"]) {
  if (method === "bank_transfer") {
    return PaymentMethod.BANK_TRANSFER;
  }

  if (method === "pos_terminal") {
    return PaymentMethod.POS_TERMINAL;
  }

  return method.toUpperCase() as PaymentMethod;
}

function paymentMethodFromAccountType(type: AccountType) {
  if (type === AccountType.BANK) {
    return PaymentMethod.BANK_TRANSFER;
  }

  if (type === AccountType.POS) {
    return PaymentMethod.POS_TERMINAL;
  }

  if (type === AccountType.MOBILE_MONEY) {
    return PaymentMethod.WALLET;
  }

  return PaymentMethod.CASH;
}

function toDbStockAdjustmentType(type: string | undefined, direction: "in" | "out") {
  if (!type) {
    return direction === "in" ? StockAdjustmentType.STOCK_IN : StockAdjustmentType.STOCK_OUT;
  }

  return type.toUpperCase() as StockAdjustmentType;
}

function createInternalProductCode() {
  return `MB-${crypto.randomUUID().replaceAll("-", "").slice(0, 14).toUpperCase()}`;
}
