import {
  CustomerReturnOutcome,
  DebtStatus,
  InventoryMovementType,
  PaymentStatus,
  Prisma,
  ReturnDisposition,
  StockAdjustmentType,
  SupplierReturnSettlement,
  TransactionType,
} from "@prisma/client";
import { getDashboardState } from "@/lib/bookkeeping/persistence";
import {
  applyInventoryBalanceChange,
  resolveInventoryLocation,
} from "@/lib/inventory/location-balances";
import { requireBusinessAccess } from "@/lib/operations/access";
import { getPrisma } from "@/lib/prisma";

type ReturnItemInput = {
  inventoryItemId: string;
  quantity: number;
};

type CustomerReturnInput = {
  businessId: string;
  idempotencyKey: string;
  locationId?: string;
  originalTransactionId: string;
  reason: string;
  disposition: "sellable_stock" | "damaged_stock" | "no_stock";
  outcome:
    | "cash_refund"
    | "transfer_refund"
    | "store_credit"
    | "exchange"
    | "reduce_customer_balance";
  accountId?: string;
  note?: string;
  items: ReturnItemInput[];
};

type SupplierReturnInput = {
  businessId: string;
  idempotencyKey: string;
  locationId?: string;
  supplierId?: string;
  originalTransactionId?: string;
  reason: string;
  settlement:
    | "supplier_credit"
    | "refund_received"
    | "replacement_expected"
    | "reduce_supplier_bill";
  accountId?: string;
  note?: string;
  items: ReturnItemInput[];
};

export async function processCustomerReturnForUser({
  userId,
  input,
}: {
  userId: string;
  input: CustomerReturnInput;
}) {
  const business = await requireBusinessAccess(userId, "money:write", input.businessId);
  let selectedLocationId = input.locationId;

  await getPrisma().$transaction(async (tx) => {
    const existing = await tx.customerReturn.findUnique({
      where: {
        businessId_idempotencyKey: {
          businessId: business.businessId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });

    if (existing) {
      return;
    }

    const original = await tx.transaction.findFirst({
      where: {
        id: input.originalTransactionId,
        businessId: business.businessId,
        type: TransactionType.SALE,
      },
      include: { customer: true },
    });

    if (!original) {
      throw new Error("Choose a valid original sale.");
    }

    const location = await resolveInventoryLocation({
      tx,
      userId,
      businessId: business.businessId,
      role: business.role,
      locationId: input.locationId ?? original.locationId,
    });
    selectedLocationId = location.id;

    const soldItems = parseInvoiceItems(original.invoiceItems);
    const previousReturns = await tx.customerReturn.findMany({
      where: {
        businessId: business.businessId,
        originalTransactionId: original.id,
      },
      include: { items: true },
    });
    const returnedByItem = new Map<string, Prisma.Decimal>();

    for (const returnRecord of previousReturns) {
      for (const item of returnRecord.items) {
        returnedByItem.set(
          item.inventoryItemId,
          (returnedByItem.get(item.inventoryItemId) ?? new Prisma.Decimal(0)).plus(item.quantity),
        );
      }
    }

    const returnLines = input.items.map((item) => {
      const soldLine = soldItems.find((line) => line.inventoryItemId === item.inventoryItemId);

      if (!soldLine) {
        throw new Error("This product was not part of the original sale.");
      }

      const requestedQuantity = new Prisma.Decimal(item.quantity);
      const alreadyReturned = returnedByItem.get(item.inventoryItemId) ?? new Prisma.Decimal(0);
      const availableToReturn = new Prisma.Decimal(soldLine.quantity).minus(alreadyReturned);
      const soldQuantity = new Prisma.Decimal(soldLine.quantity);
      const soldStockQuantity = new Prisma.Decimal(soldLine.stockQuantity ?? soldLine.quantity);
      const stockQuantity = requestedQuantity.mul(soldStockQuantity.div(soldQuantity));

      if (requestedQuantity.gt(availableToReturn)) {
        throw new Error("Returned quantity cannot be more than the quantity sold.");
      }

      const unitPrice = new Prisma.Decimal(soldLine.unitPrice);
      return {
        inventoryItemId: item.inventoryItemId,
        quantity: requestedQuantity,
        stockQuantity,
        unitPrice,
        total: unitPrice.mul(requestedQuantity),
      };
    });
    const refundAmount = returnLines.reduce(
      (sum, line) => sum.plus(line.total),
      new Prisma.Decimal(0),
    );
    const refundTransactionId = await createRefundTransactionIfNeeded({
      tx,
      businessId: business.businessId,
      locationId: location.id,
      userId,
      original,
      input,
      amount: refundAmount,
    });

    const returnRecord = await tx.customerReturn.create({
      data: {
        businessId: business.businessId,
        locationId: location.id,
        customerId: original.customerId,
        originalTransactionId: original.id,
        refundTransactionId,
        idempotencyKey: input.idempotencyKey,
        reason: input.reason,
        disposition: toDbReturnDisposition(input.disposition),
        outcome: toDbCustomerReturnOutcome(input.outcome),
        refundAmount,
        note: input.note,
        actorId: userId,
        items: {
          create: returnLines.map((line) => ({
            inventoryItemId: line.inventoryItemId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            total: line.total,
          })),
        },
      },
    });

    if (input.disposition === "sellable_stock") {
      for (const line of returnLines) {
        const item = await tx.inventoryItem.findFirstOrThrow({
          where: { id: line.inventoryItemId, businessId: business.businessId },
        });
        const stockChange = await applyInventoryBalanceChange({
          tx,
          businessId: business.businessId,
          location,
          itemId: item.id,
          changeQuantity: line.stockQuantity,
        });

        await tx.inventoryMovement.create({
          data: {
            businessId: business.businessId,
            actorId: userId,
            itemId: item.id,
            locationId: location.id,
            type: InventoryMovementType.STOCK_IN,
            adjustmentType: StockAdjustmentType.CUSTOMER_RETURN,
            quantity: Math.trunc(line.stockQuantity.toNumber()),
            quantityDecimal: line.stockQuantity,
            beforeQuantityDecimal: stockChange.beforeLocationQuantity,
            afterQuantityDecimal: stockChange.afterLocationQuantity,
            reason: input.reason,
            note: `Customer return ${returnRecord.id.slice(-8).toUpperCase()}`,
          },
        });
      }
    }

    if (input.outcome === "reduce_customer_balance") {
      await reduceOpenCustomerDebt({
        tx,
        businessId: business.businessId,
        customerId: original.customerId,
        amount: refundAmount,
      });
    }

    await tx.auditLog.create({
      data: {
        businessId: business.businessId,
        actorId: userId,
        action: "customer.return",
        message: `Customer return saved for ${formatNaira(refundAmount.toNumber())}.`,
        metadata: {
          returnId: returnRecord.id,
          originalTransactionId: original.id,
          locationId: location.id,
          disposition: input.disposition,
          outcome: input.outcome,
        },
      },
    });
  });

  return getDashboardState(business.businessId, business.role, userId, selectedLocationId);
}

export async function processSupplierReturnForUser({
  userId,
  input,
}: {
  userId: string;
  input: SupplierReturnInput;
}) {
  const business = await requireBusinessAccess(userId, "inventory:write", input.businessId);
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

    const existing = await tx.supplierReturn.findUnique({
      where: {
        businessId_idempotencyKey: {
          businessId: business.businessId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });

    if (existing) {
      return;
    }

    const returnLines = [];

    for (const item of input.items) {
      const inventoryItem = await tx.inventoryItem.findFirst({
        where: { id: item.inventoryItemId, businessId: business.businessId },
      });

      if (!inventoryItem) {
        throw new Error("Choose a valid product.");
      }

      const quantity = new Prisma.Decimal(item.quantity);
      const stockChange = await applyInventoryBalanceChange({
        tx,
        businessId: business.businessId,
        location,
        itemId: inventoryItem.id,
        changeQuantity: quantity.neg(),
        notEnoughMessage: `You do not have enough stock for ${inventoryItem.name}.`,
      });

      await tx.inventoryMovement.create({
        data: {
          businessId: business.businessId,
          actorId: userId,
          itemId: inventoryItem.id,
          locationId: location.id,
          type: InventoryMovementType.STOCK_OUT,
          adjustmentType: StockAdjustmentType.SUPPLIER_RETURN,
          quantity: Math.trunc(quantity.toNumber()),
          quantityDecimal: quantity,
          beforeQuantityDecimal: stockChange.beforeLocationQuantity,
          afterQuantityDecimal: stockChange.afterLocationQuantity,
          reason: input.reason,
          note: "Returned to supplier",
        },
      });

      const unitCost = inventoryItem.costPrice.div(getInventoryConversionFactor(inventoryItem));

      returnLines.push({
        inventoryItemId: inventoryItem.id,
        quantity,
        unitCost,
        total: unitCost.mul(quantity),
      });
    }

    const settlementAmount = returnLines.reduce(
      (sum, line) => sum.plus(line.total),
      new Prisma.Decimal(0),
    );
    const supplierReturn = await tx.supplierReturn.create({
      data: {
        businessId: business.businessId,
        locationId: location.id,
        supplierId: input.supplierId,
        originalTransactionId: input.originalTransactionId,
        idempotencyKey: input.idempotencyKey,
        reason: input.reason,
        settlement: toDbSupplierReturnSettlement(input.settlement),
        settlementAmount,
        note: input.note,
        actorId: userId,
        items: {
          create: returnLines.map((line) => ({
            inventoryItemId: line.inventoryItemId,
            quantity: line.quantity,
            unitCost: line.unitCost,
            total: line.total,
          })),
        },
      },
    });

    await createSupplierRefundIfNeeded({
      tx,
      businessId: business.businessId,
      locationId: location.id,
      userId,
      input,
      amount: settlementAmount,
    });

    await tx.auditLog.create({
      data: {
        businessId: business.businessId,
        actorId: userId,
        action: "supplier.return",
        message: `Supplier return saved for ${formatNaira(settlementAmount.toNumber())}.`,
        metadata: {
          returnId: supplierReturn.id,
          locationId: location.id,
          settlement: input.settlement,
        },
      },
    });
  });

  return getDashboardState(business.businessId, business.role, userId, selectedLocationId);
}

async function createSupplierRefundIfNeeded({
  tx,
  businessId,
  locationId,
  userId,
  input,
  amount,
}: {
  tx: Prisma.TransactionClient;
  businessId: string;
  locationId: string;
  userId: string;
  input: SupplierReturnInput;
  amount: Prisma.Decimal;
}) {
  if (input.settlement !== "refund_received") {
    return;
  }

  const accountId = input.accountId;

  if (!accountId) {
    throw new Error("Choose where the supplier refund was received.");
  }

  const account = await tx.account.findFirst({
    where: { id: accountId, businessId },
  });

  if (!account) {
    throw new Error("Choose a valid refund account.");
  }

  await tx.account.update({
    where: { id: account.id },
    data: { balance: { increment: amount } },
  });

  const transaction = await tx.transaction.create({
    data: {
      businessId,
      accountId: account.id,
      locationId,
      idempotencyKey: `supplier-return-refund-${input.idempotencyKey}`,
      duplicateFingerprint: `supplier-return-refund-${input.idempotencyKey}`,
      type: TransactionType.ADJUSTMENT,
      paymentStatus: PaymentStatus.PAID,
      amount,
      costOfGoods: 0,
      profit: 0,
      description: "Supplier refund",
      category: "Supplier return",
    },
  });

  await tx.auditLog.create({
    data: {
      businessId,
      actorId: userId,
      action: "supplier.refund_received",
      message: `Supplier refund received for ${formatNaira(amount.toNumber())}.`,
      metadata: { transactionId: transaction.id },
    },
  });
}

async function createRefundTransactionIfNeeded({
  tx,
  businessId,
  locationId,
  userId,
  original,
  input,
  amount,
}: {
  tx: Prisma.TransactionClient;
  businessId: string;
  locationId: string;
  userId: string;
  original: { id: string; accountId: string; customerId: string | null };
  input: CustomerReturnInput;
  amount: Prisma.Decimal;
}) {
  if (!["cash_refund", "transfer_refund"].includes(input.outcome)) {
    return null;
  }

  const accountId = input.accountId || original.accountId;
  const account = await tx.account.findFirst({
    where: { id: accountId, businessId },
  });

  if (!account) {
    throw new Error("Choose a valid refund account.");
  }

  await tx.account.update({
    where: { id: account.id },
    data: { balance: { decrement: amount } },
  });

  const refund = await tx.transaction.create({
    data: {
      businessId,
      accountId: account.id,
      locationId,
      customerId: original.customerId,
      idempotencyKey: `customer-return-refund-${input.idempotencyKey}`,
      duplicateFingerprint: `customer-return-refund-${input.idempotencyKey}`,
      type: TransactionType.EXPENSE,
      paymentStatus: PaymentStatus.PAID,
      amount,
      costOfGoods: 0,
      profit: 0,
      description: "Customer refund",
      category: "Return",
    },
  });

  await tx.auditLog.create({
    data: {
      businessId,
      actorId: userId,
      action: "customer.refund",
      message: `Refund saved for ${formatNaira(amount.toNumber())}.`,
      metadata: { originalTransactionId: original.id, refundTransactionId: refund.id },
    },
  });

  return refund.id;
}

async function reduceOpenCustomerDebt({
  tx,
  businessId,
  customerId,
  amount,
}: {
  tx: Prisma.TransactionClient;
  businessId: string;
  customerId: string | null;
  amount: Prisma.Decimal;
}) {
  if (!customerId) {
    return;
  }

  const debts = await tx.debt.findMany({
    where: {
      businessId,
      customerId,
      status: DebtStatus.OPEN,
    },
    orderBy: { createdAt: "asc" },
  });
  let remaining = amount;

  for (const debt of debts) {
    if (remaining.lte(0)) {
      break;
    }

    const debtBalance = debt.amount.minus(debt.paidAmount);
    const reduction = Prisma.Decimal.min(remaining, debtBalance);

    await tx.debt.update({
      where: { id: debt.id },
      data: {
        paidAmount: { increment: reduction },
        status: debt.paidAmount.plus(reduction).gte(debt.amount)
          ? DebtStatus.SETTLED
          : DebtStatus.OPEN,
      },
    });

    remaining = remaining.minus(reduction);
  }
}

function parseInvoiceItems(value: Prisma.JsonValue | null) {
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
    const quantity = Number(candidate.quantity);
    const stockQuantity = Number(candidate.stockQuantity);
    const unitPrice = Number(candidate.unitPrice);

    if (!inventoryItemId || !Number.isFinite(quantity) || !Number.isFinite(unitPrice)) {
      return [];
    }

    return [
      {
        inventoryItemId,
        quantity,
        stockQuantity: Number.isFinite(stockQuantity) && stockQuantity > 0 ? stockQuantity : undefined,
        unitPrice,
      },
    ];
  });
}

function getInventoryConversionFactor(item: { conversionFactor: Prisma.Decimal | null }) {
  return item.conversionFactor && item.conversionFactor.gt(0)
    ? item.conversionFactor
    : new Prisma.Decimal(1);
}

function toDbReturnDisposition(value: CustomerReturnInput["disposition"]) {
  if (value === "sellable_stock") {
    return ReturnDisposition.SELLABLE_STOCK;
  }

  if (value === "damaged_stock") {
    return ReturnDisposition.DAMAGED_STOCK;
  }

  return ReturnDisposition.NO_STOCK;
}

function toDbCustomerReturnOutcome(value: CustomerReturnInput["outcome"]) {
  return value.toUpperCase() as CustomerReturnOutcome;
}

function toDbSupplierReturnSettlement(value: SupplierReturnInput["settlement"]) {
  return value.toUpperCase() as SupplierReturnSettlement;
}

function formatNaira(amount: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}
