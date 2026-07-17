import {
  DebtEventType,
  DebtStatus,
  DebtType,
  InventoryMovementType,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  StockAdjustmentType,
  TransactionType,
} from "@prisma/client";
import { requireBusinessAccess } from "@/lib/operations/access";
import { getPrisma } from "@/lib/prisma";
import { getDashboardState } from "@/lib/bookkeeping/persistence";
import {
  applyInventoryBalanceChange,
  resolveInventoryLocation,
} from "@/lib/inventory/location-balances";

type PosCheckoutItemInput = {
  inventoryItemId: string;
  quantity: number;
  discount?: number;
};

type PosPaymentInput = {
  method: "cash" | "bank_transfer" | "pos_terminal" | "card" | "wallet" | "credit" | "other";
  amount: number;
  accountId?: string;
  note?: string;
};

type PosCheckoutInput = {
  businessId: string;
  idempotencyKey: string;
  locationId?: string;
  accountId?: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  note?: string;
  orderDiscount: number;
  createInvoice: boolean;
  items: PosCheckoutItemInput[];
  payments: PosPaymentInput[];
};

export type PosReceipt = {
  transactionId: string;
  receiptNo: string;
  total: number;
  paidAmount: number;
  balance: number;
  items: Array<{
    name: string;
    quantity: number;
    unitLabel?: string;
    unitPrice: number;
    discount: number;
    total: number;
  }>;
  payments: Array<{
    method: string;
    amount: number;
  }>;
  createdAt: string;
};

export async function checkoutPosForUser({
  userId,
  input,
}: {
  userId: string;
  input: PosCheckoutInput;
}) {
  const business = await requireBusinessAccess(userId, "money:write", input.businessId);
  let receipt: PosReceipt | null = null;
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
    const existing = await tx.transaction.findUnique({
      where: {
        businessId_idempotencyKey: {
          businessId: business.businessId,
          idempotencyKey: input.idempotencyKey,
        },
      },
      include: { payments: true },
    });

    if (existing) {
      receipt = {
        transactionId: existing.id,
        receiptNo: existing.id.slice(-8).toUpperCase(),
        total: existing.amount.toNumber(),
        paidAmount: existing.payments.reduce(
          (sum, payment) => sum + payment.amount.toNumber(),
          0,
        ),
        balance: 0,
        items: [],
        payments: existing.payments.map((payment) => ({
          method: payment.method.toLowerCase(),
          amount: payment.amount.toNumber(),
        })),
        createdAt: existing.occurredAt.toISOString(),
      };
      return;
    }

    const selectedItems = normalizeCheckoutItems(input.items);
    const inventory = await tx.inventoryItem.findMany({
      where: {
        businessId: business.businessId,
        archivedAt: null,
        id: { in: selectedItems.map((item) => item.inventoryItemId) },
      },
      include: {
        unit: true,
        sellingUnit: true,
      },
    });
    const inventoryById = new Map(inventory.map((item) => [item.id, item]));

    const lines = selectedItems.map((item) => {
      const product = inventoryById.get(item.inventoryItemId);

      if (!product) {
        throw new Error("Choose a valid product.");
      }

      const saleQuantity = new Prisma.Decimal(item.quantity);
      const stockQuantity = saleQuantity.mul(getInventoryConversionFactor(product));

      if (product.quantityOnHandDecimal.lt(stockQuantity)) {
        throw new Error(`You do not have enough stock for ${product.name}.`);
      }

      const gross = product.sellingPrice.mul(saleQuantity);
      const discount = new Prisma.Decimal(item.discount ?? 0);

      if (discount.gt(gross)) {
        throw new Error(`Discount is too high for ${product.name}.`);
      }

      return {
        product,
        quantity: saleQuantity,
        stockQuantity,
        unitPrice: product.sellingPrice,
        unitCost: product.costPrice,
        discount,
        total: gross.minus(discount),
      };
    });

    const subtotal = lines.reduce((sum, line) => sum.plus(line.total), new Prisma.Decimal(0));
    const orderDiscount = new Prisma.Decimal(input.orderDiscount || 0);

    if (orderDiscount.gt(subtotal)) {
      throw new Error("Discount cannot be more than the sale total.");
    }

    const total = subtotal.minus(orderDiscount);
    const costTotal = lines.reduce(
      (sum, line) => sum.plus(line.unitCost.mul(line.quantity)),
      new Prisma.Decimal(0),
    );
    const paidTotal = input.payments.reduce(
      (sum, payment) => sum.plus(payment.amount),
      new Prisma.Decimal(0),
    );

    if (paidTotal.gt(total)) {
      throw new Error("Payment amounts cannot be more than the sale total.");
    }

    const balance = total.minus(paidTotal);
    const customer = await resolveCheckoutCustomer({
      tx,
      businessId: business.businessId,
      customerId: input.customerId,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      balance,
    });
    const accountId = await resolveCheckoutAccountId({
      tx,
      businessId: business.businessId,
      accountId: input.accountId,
      paymentAccountIds: input.payments
        .map((payment) => payment.accountId)
        .filter((accountId): accountId is string => Boolean(accountId)),
    });

    const transaction = await tx.transaction.create({
      data: {
        businessId: business.businessId,
        accountId,
        customerId: customer?.id,
        locationId: location.id,
        idempotencyKey: input.idempotencyKey,
        duplicateFingerprint: `pos-${input.idempotencyKey}`,
        type: TransactionType.SALE,
        paymentStatus: balance.gt(0) ? PaymentStatus.CREDIT : PaymentStatus.PAID,
        amount: total,
        costOfGoods: costTotal,
        profit: total.minus(costTotal),
        description: input.note?.trim() || "POS sale",
        invoiceItems: lines.map((line) => ({
          inventoryItemId: line.product.id,
          name: line.product.name,
          quantity: line.quantity.toNumber(),
          stockQuantity: line.stockQuantity.toNumber(),
          unitLabel: getSaleUnitLabel(line.product, line.quantity.toNumber()),
          unitPrice: line.unitPrice.toNumber(),
          discount: line.discount.toNumber(),
          total: line.total.toNumber(),
        })),
      },
    });

    for (const line of lines) {
      const stockChange = await applyInventoryBalanceChange({
        tx,
        businessId: business.businessId,
        location,
        itemId: line.product.id,
        changeQuantity: line.stockQuantity.neg(),
        notEnoughMessage: `You do not have enough stock for ${line.product.name}.`,
      });

      await tx.inventoryMovement.create({
        data: {
          businessId: business.businessId,
          actorId: userId,
          itemId: line.product.id,
          accountId,
          locationId: location.id,
          transactionId: transaction.id,
          type: InventoryMovementType.STOCK_OUT,
          adjustmentType: StockAdjustmentType.STOCK_OUT,
          quantity: Math.trunc(line.stockQuantity.toNumber()),
          quantityDecimal: line.stockQuantity,
          beforeQuantityDecimal: stockChange.beforeLocationQuantity,
          afterQuantityDecimal: stockChange.afterLocationQuantity,
          note: `Sold via POS sale ${transaction.id.slice(-8).toUpperCase()}`,
        },
      });
    }

    for (const [index, payment] of input.payments.entries()) {
      const accountForPayment = payment.accountId || accountId;

      await tx.account.update({
        where: { id: accountForPayment },
        data: { balance: { increment: payment.amount } },
      });

      await tx.transactionPayment.create({
        data: {
          businessId: business.businessId,
          transactionId: transaction.id,
          accountId: accountForPayment,
          locationId: location.id,
          method: toDbPaymentMethod(payment.method),
          amount: payment.amount,
          note: payment.note,
          idempotencyKey: `${input.idempotencyKey}-${index}`,
        },
      });
    }

    if (balance.gt(0)) {
      if (!customer) {
        throw new Error("Choose a customer when the sale is not fully paid.");
      }

      const debt = await tx.debt.create({
        data: {
          businessId: business.businessId,
          customerId: customer.id,
          sourceTransactionId: transaction.id,
          type: DebtType.CUSTOMER_OWES_BUSINESS,
          amount: balance,
          status: DebtStatus.OPEN,
        },
      });

      await tx.debtEvent.create({
        data: {
          debtId: debt.id,
          actorId: userId,
          type: DebtEventType.NOTE,
          amount: balance,
          note: "Balance from POS sale.",
        },
      });
    }

    await tx.auditLog.create({
      data: {
        businessId: business.businessId,
        actorId: userId,
        action: "pos.sale",
        message: `POS sale saved for ${formatNaira(total.toNumber())}.`,
        metadata: {
          transactionId: transaction.id,
          locationId: location.id,
          paidAmount: paidTotal.toNumber(),
          balance: balance.toNumber(),
          createInvoice: input.createInvoice,
        },
      },
    });

    receipt = {
      transactionId: transaction.id,
      receiptNo: transaction.id.slice(-8).toUpperCase(),
      total: total.toNumber(),
      paidAmount: paidTotal.toNumber(),
      balance: balance.toNumber(),
      items: lines.map((line) => ({
        name: line.product.name,
        quantity: line.quantity.toNumber(),
        unitLabel: getSaleUnitLabel(line.product, line.quantity.toNumber()),
        unitPrice: line.unitPrice.toNumber(),
        discount: line.discount.toNumber(),
        total: line.total.toNumber(),
      })),
      payments: input.payments.map((payment) => ({
        method: payment.method,
        amount: payment.amount,
      })),
      createdAt: transaction.occurredAt.toISOString(),
    };
  });

  return {
    state: await getDashboardState(business.businessId, business.role, userId, selectedLocationId),
    receipt,
  };
}

function getInventoryConversionFactor(item: { conversionFactor: Prisma.Decimal | null }) {
  return item.conversionFactor && item.conversionFactor.gt(0)
    ? item.conversionFactor
    : new Prisma.Decimal(1);
}

function getSaleUnitLabel(item: {
  unit?: { singularLabel: string; pluralLabel: string } | null;
  sellingUnit?: { singularLabel: string; pluralLabel: string } | null;
}, quantity: number) {
  const unit = item.sellingUnit ?? item.unit;

  if (!unit) {
    return undefined;
  }

  return quantity === 1 ? unit.singularLabel : unit.pluralLabel;
}

function normalizeCheckoutItems(items: PosCheckoutItemInput[]) {
  const byProduct = new Map<string, { quantity: number; discount: number }>();

  for (const item of items) {
    const current = byProduct.get(item.inventoryItemId) ?? { quantity: 0, discount: 0 };
    byProduct.set(item.inventoryItemId, {
      quantity: current.quantity + item.quantity,
      discount: current.discount + (item.discount ?? 0),
    });
  }

  return Array.from(byProduct, ([inventoryItemId, item]) => ({
    inventoryItemId,
    quantity: item.quantity,
    discount: item.discount,
  }));
}

async function resolveCheckoutCustomer({
  tx,
  businessId,
  customerId,
  customerName,
  customerPhone,
  balance,
}: {
  tx: Prisma.TransactionClient;
  businessId: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  balance: Prisma.Decimal;
}) {
  if (customerId) {
    const customer = await tx.customer.findFirst({
      where: { id: customerId, businessId },
    });

    if (!customer) {
      throw new Error("Choose a valid customer.");
    }

    return customer;
  }

  if (!customerName?.trim()) {
    if (balance.gt(0)) {
      throw new Error("Choose a customer when the sale is not fully paid.");
    }

    return null;
  }

  return tx.customer.create({
    data: {
      businessId,
      name: customerName.trim(),
      phone: customerPhone?.trim() || null,
    },
  });
}

async function resolveCheckoutAccountId({
  tx,
  businessId,
  accountId,
  paymentAccountIds,
}: {
  tx: Prisma.TransactionClient;
  businessId: string;
  accountId?: string;
  paymentAccountIds: string[];
}) {
  const selectedId = accountId || paymentAccountIds[0];

  if (selectedId) {
    const account = await tx.account.findFirst({
      where: { id: selectedId, businessId },
    });

    if (!account) {
      throw new Error("Choose a valid money account.");
    }

    return account.id;
  }

  const fallback = await tx.account.findFirst({
    where: { businessId },
    orderBy: { createdAt: "asc" },
  });

  if (!fallback) {
    throw new Error("Create a money account before checkout.");
  }

  return fallback.id;
}

function toDbPaymentMethod(method: PosPaymentInput["method"]) {
  if (method === "bank_transfer") {
    return PaymentMethod.BANK_TRANSFER;
  }

  if (method === "pos_terminal") {
    return PaymentMethod.POS_TERMINAL;
  }

  if (method === "credit") {
    return PaymentMethod.CREDIT;
  }

  return method.toUpperCase() as PaymentMethod;
}

function formatNaira(amount: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}
