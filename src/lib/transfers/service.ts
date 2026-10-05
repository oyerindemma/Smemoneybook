import {
  InventoryMovementType,
  Prisma,
  StockAdjustmentType,
  StockTransferStatus,
} from "@prisma/client";
import {
  applyInventoryBalanceChange,
  resolveInventoryLocation,
} from "@/lib/inventory/location-balances";
import {
  hasPermission,
  requireBusinessAccess,
  type Permission,
} from "@/lib/operations/access";
import { getPrisma } from "@/lib/prisma";

type TransferItemInput = {
  inventoryItemId: string;
  quantity: number;
};

type CreateTransferInput = {
  businessId: string;
  sourceLocationId: string;
  destinationLocationId: string;
  reason?: string;
  reference?: string;
  idempotencyKey?: string;
  items: TransferItemInput[];
};

type ReceiveTransferInput = {
  businessId: string;
  items?: Array<{
    inventoryItemId: string;
    receivedQuantity?: number;
    damagedQuantity?: number;
    note?: string;
  }>;
};

export async function listStockTransfersForUser(userId: string, businessId?: string) {
  const access = await requireBusinessAccess(userId, "transfers:view", businessId);
  const prisma = getPrisma();
  const transfers = await prisma.stockTransfer.findMany({
    where: { businessId: access.businessId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: transferInclude,
  });
  const transferIds = new Set(transfers.map((transfer) => transfer.id));
  const auditLogs = await prisma.auditLog.findMany({
    where: {
      businessId: access.businessId,
      action: { in: transferAuditActions },
    },
    orderBy: { createdAt: "asc" },
    take: 500,
    include: {
      actor: { select: { id: true, name: true, email: true } },
    },
  });
  const auditByTransferId = new Map<string, TransferAuditEvent[]>();

  for (const log of auditLogs) {
    const transferId = getAuditTransferId(log.metadata);

    if (!transferId || !transferIds.has(transferId)) {
      continue;
    }

    const events = auditByTransferId.get(transferId) ?? [];
    events.push({
      id: log.id,
      action: log.action,
      message: log.message,
      createdAt: log.createdAt.toISOString(),
      actor: mapTransferUser(log.actor),
    });
    auditByTransferId.set(transferId, events);
  }

  return transfers.map((transfer) => mapTransfer(transfer, auditByTransferId.get(transfer.id) ?? []));
}

export async function createStockTransferForUser(userId: string, input: CreateTransferInput) {
  const access = await requireBusinessAccess(userId, "transfers:create", input.businessId);

  return getPrisma().$transaction(async (tx) => {
    if (input.idempotencyKey) {
      const existing = await tx.stockTransfer.findUnique({
        where: {
          businessId_idempotencyKey: {
            businessId: access.businessId,
            idempotencyKey: input.idempotencyKey,
          },
        },
        include: transferInclude,
      });

      if (existing) {
        return mapTransfer(existing);
      }
    }

    const [sourceLocation, destinationLocation] = await Promise.all([
      resolveInventoryLocation({
        tx,
        userId,
        businessId: access.businessId,
        role: access.role,
        locationId: input.sourceLocationId,
      }),
      resolveInventoryLocation({
        tx,
        userId,
        businessId: access.businessId,
        role: access.role,
        locationId: input.destinationLocationId,
      }),
    ]);

    if (sourceLocation.id === destinationLocation.id) {
      throw new Error("Choose two different locations.");
    }

    const items = normalizeTransferItems(input.items);
    const inventoryItems = await tx.inventoryItem.findMany({
      where: {
        businessId: access.businessId,
        archivedAt: null,
        id: { in: items.map((item) => item.inventoryItemId) },
      },
      select: { id: true, name: true },
    });

    if (inventoryItems.length !== items.length) {
      throw new Error("Choose valid products for this transfer.");
    }

    const transfer = await tx.stockTransfer.create({
      data: {
        businessId: access.businessId,
        transferNumber: createTransferNumber(),
        sourceLocationId: sourceLocation.id,
        destinationLocationId: destinationLocation.id,
        reason: input.reason || null,
        reference: input.reference || null,
        idempotencyKey: input.idempotencyKey || null,
        createdById: userId,
        items: {
          create: items.map((item) => ({
            inventoryItemId: item.inventoryItemId,
            requestedQuantity: item.quantity,
          })),
        },
      },
      include: transferInclude,
    });

    await tx.auditLog.create({
      data: {
        businessId: access.businessId,
        actorId: userId,
        action: "transfer.created",
        message: `Transfer ${transfer.transferNumber} was created.`,
        metadata: {
          transferId: transfer.id,
          sourceLocationId: sourceLocation.id,
          destinationLocationId: destinationLocation.id,
        },
      },
    });

    return mapTransfer(transfer);
  });
}

export async function approveStockTransferForUser({
  userId,
  businessId,
  transferId,
}: {
  userId: string;
  businessId: string;
  transferId: string;
}) {
  return updateTransferStatus({
    userId,
    businessId,
    transferId,
    permission: "transfers:approve",
    allowedStatuses: [StockTransferStatus.DRAFT],
    action: "transfer.approved",
    message: "approved",
    data: {
      status: StockTransferStatus.APPROVED,
      approvedById: userId,
      approvedAt: new Date(),
    },
  });
}

export async function cancelStockTransferForUser({
  userId,
  businessId,
  transferId,
}: {
  userId: string;
  businessId: string;
  transferId: string;
}) {
  return updateTransferStatus({
    userId,
    businessId,
    transferId,
    permission: "transfers:cancel",
    allowedStatuses: [StockTransferStatus.DRAFT, StockTransferStatus.APPROVED],
    action: "transfer.cancelled",
    message: "cancelled",
    data: {
      status: StockTransferStatus.CANCELLED,
      cancelledAt: new Date(),
    },
  });
}

export async function rejectStockTransferForUser({
  userId,
  businessId,
  transferId,
}: {
  userId: string;
  businessId: string;
  transferId: string;
}) {
  const access = await requireBusinessAccess(userId, "transfers:receive", businessId);

  return getPrisma().$transaction(async (tx) => {
    const transfer = await tx.stockTransfer.findFirst({
      where: {
        id: transferId,
        businessId: access.businessId,
      },
      include: transferInclude,
    });

    if (!transfer) {
      throw new Error("Choose a valid transfer.");
    }

    if (transfer.status !== StockTransferStatus.IN_TRANSIT) {
      throw new Error("Reject a transfer only after it has been sent.");
    }

    const sourceLocation = await resolveInventoryLocation({
      tx,
      userId,
      businessId: access.businessId,
      role: access.role,
      locationId: transfer.sourceLocationId,
    });
    const destinationLocation = await resolveInventoryLocation({
      tx,
      userId,
      businessId: access.businessId,
      role: access.role,
      locationId: transfer.destinationLocationId,
    });

    for (const item of transfer.items) {
      if (item.sentQuantity.lte(0)) {
        continue;
      }

      const stockChange = await applyInventoryBalanceChange({
        tx,
        businessId: access.businessId,
        location: sourceLocation,
        itemId: item.inventoryItemId,
        changeQuantity: item.sentQuantity,
      });

      await tx.inventoryMovement.create({
        data: {
          businessId: access.businessId,
          actorId: userId,
          itemId: item.inventoryItemId,
          locationId: sourceLocation.id,
          sourceLocationId: destinationLocation.id,
          destinationLocationId: sourceLocation.id,
          type: InventoryMovementType.STOCK_IN,
          adjustmentType: StockAdjustmentType.OTHER,
          quantity: Math.trunc(item.sentQuantity.toNumber()),
          quantityDecimal: item.sentQuantity,
          beforeQuantityDecimal: stockChange.beforeLocationQuantity,
          afterQuantityDecimal: stockChange.afterLocationQuantity,
          note: `Rejected transfer ${transfer.transferNumber}`,
        },
      });
    }

    const updated = await tx.stockTransfer.update({
      where: { id: transfer.id },
      data: {
        status: StockTransferStatus.CANCELLED,
        cancelledAt: new Date(),
      },
      include: transferInclude,
    });

    await tx.auditLog.create({
      data: {
        businessId: access.businessId,
        actorId: userId,
        action: "transfer.rejected",
        message: `Transfer ${transfer.transferNumber} was rejected.`,
        metadata: { transferId: transfer.id },
      },
    });

    return mapTransfer(updated);
  });
}

export async function sendStockTransferForUser({
  userId,
  businessId,
  transferId,
}: {
  userId: string;
  businessId: string;
  transferId: string;
}) {
  const access = await requireBusinessAccess(userId, "transfers:approve", businessId);

  return getPrisma().$transaction(async (tx) => {
    const transfer = await tx.stockTransfer.findFirst({
      where: {
        id: transferId,
        businessId: access.businessId,
      },
      include: transferInclude,
    });

    if (!transfer) {
      throw new Error("Choose a valid transfer.");
    }

    if (transfer.status !== StockTransferStatus.APPROVED) {
      throw new Error("Approve this transfer before sending stock.");
    }

    const sourceLocation = await resolveInventoryLocation({
      tx,
      userId,
      businessId: access.businessId,
      role: access.role,
      locationId: transfer.sourceLocationId,
    });
    const destinationLocation = await resolveInventoryLocation({
      tx,
      userId,
      businessId: access.businessId,
      role: access.role,
      locationId: transfer.destinationLocationId,
    });

    for (const item of transfer.items) {
      const sentQuantity = item.requestedQuantity;
      const stockChange = await applyInventoryBalanceChange({
        tx,
        businessId: access.businessId,
        location: sourceLocation,
        itemId: item.inventoryItemId,
        changeQuantity: sentQuantity.neg(),
        notEnoughMessage: `You do not have enough stock for ${item.inventoryItem.name}.`,
      });

      await tx.stockTransferItem.update({
        where: { id: item.id },
        data: { sentQuantity },
      });
      await tx.inventoryMovement.create({
        data: {
          businessId: access.businessId,
          actorId: userId,
          itemId: item.inventoryItemId,
          locationId: sourceLocation.id,
          sourceLocationId: sourceLocation.id,
          destinationLocationId: destinationLocation.id,
          type: InventoryMovementType.STOCK_OUT,
          adjustmentType: StockAdjustmentType.OTHER,
          quantity: Math.trunc(sentQuantity.toNumber()),
          quantityDecimal: sentQuantity,
          beforeQuantityDecimal: stockChange.beforeLocationQuantity,
          afterQuantityDecimal: stockChange.afterLocationQuantity,
          note: `Sent via transfer ${transfer.transferNumber}`,
        },
      });
    }

    const updated = await tx.stockTransfer.update({
      where: { id: transfer.id },
      data: {
        status: StockTransferStatus.IN_TRANSIT,
        sentById: userId,
        sentAt: new Date(),
      },
      include: transferInclude,
    });

    await tx.auditLog.create({
      data: {
        businessId: access.businessId,
        actorId: userId,
        action: "transfer.sent",
        message: `Transfer ${transfer.transferNumber} was sent.`,
        metadata: { transferId: transfer.id },
      },
    });

    return mapTransfer(updated);
  });
}

export async function receiveStockTransferForUser({
  userId,
  businessId,
  transferId,
  input,
}: {
  userId: string;
  businessId: string;
  transferId: string;
  input: ReceiveTransferInput;
}) {
  const access = await requireBusinessAccess(userId, "transfers:receive", businessId);

  return getPrisma().$transaction(async (tx) => {
    const transfer = await tx.stockTransfer.findFirst({
      where: {
        id: transferId,
        businessId: access.businessId,
      },
      include: transferInclude,
    });

    if (!transfer) {
      throw new Error("Choose a valid transfer.");
    }

    if (transfer.status !== StockTransferStatus.IN_TRANSIT) {
      throw new Error("Receive stock only after the transfer is in transit.");
    }

    const destinationLocation = await resolveInventoryLocation({
      tx,
      userId,
      businessId: access.businessId,
      role: access.role,
      locationId: transfer.destinationLocationId,
    });
    const sourceLocation = await resolveInventoryLocation({
      tx,
      userId,
      businessId: access.businessId,
      role: access.role,
      locationId: transfer.sourceLocationId,
    });
    const receivedByItem = new Map(
      (input.items ?? []).map((item) => [item.inventoryItemId, item]),
    );
    let hasDiscrepancy = false;

    for (const item of transfer.items) {
      const receivedInput = receivedByItem.get(item.inventoryItemId);
      const receivedQuantity = new Prisma.Decimal(
        receivedInput?.receivedQuantity ?? item.sentQuantity.toNumber(),
      );
      const damagedQuantity = new Prisma.Decimal(receivedInput?.damagedQuantity ?? 0);

      if (receivedQuantity.lt(0) || damagedQuantity.lt(0)) {
        throw new Error("Received and damaged quantities cannot be negative.");
      }

      if (damagedQuantity.gt(receivedQuantity)) {
        throw new Error("Damaged quantity cannot be more than received quantity.");
      }

      if (receivedQuantity.gt(item.sentQuantity)) {
        throw new Error("Received quantity cannot be more than sent quantity.");
      }

      const sellableQuantity = receivedQuantity.minus(damagedQuantity);
      const shortageQuantity = item.sentQuantity.minus(receivedQuantity);

      if (damagedQuantity.gt(0) || shortageQuantity.gt(0)) {
        hasDiscrepancy = true;
      }

      if (sellableQuantity.gt(0)) {
        const stockChange = await applyInventoryBalanceChange({
          tx,
          businessId: access.businessId,
          location: destinationLocation,
          itemId: item.inventoryItemId,
          changeQuantity: sellableQuantity,
        });

        await tx.inventoryMovement.create({
          data: {
            businessId: access.businessId,
            actorId: userId,
            itemId: item.inventoryItemId,
            locationId: destinationLocation.id,
            sourceLocationId: sourceLocation.id,
            destinationLocationId: destinationLocation.id,
            type: InventoryMovementType.STOCK_IN,
            adjustmentType: StockAdjustmentType.OTHER,
            quantity: Math.trunc(sellableQuantity.toNumber()),
            quantityDecimal: sellableQuantity,
            beforeQuantityDecimal: stockChange.beforeLocationQuantity,
            afterQuantityDecimal: stockChange.afterLocationQuantity,
            note: `Received via transfer ${transfer.transferNumber}`,
          },
        });
      }

      await tx.stockTransferItem.update({
        where: { id: item.id },
        data: {
          receivedQuantity,
          damagedQuantity,
          shortageQuantity,
          note: receivedInput?.note || item.note,
        },
      });
    }

    const updated = await tx.stockTransfer.update({
      where: { id: transfer.id },
      data: {
        status: hasDiscrepancy
          ? StockTransferStatus.PARTIALLY_RECEIVED
          : StockTransferStatus.RECEIVED,
        receivedById: userId,
        receivedAt: new Date(),
      },
      include: transferInclude,
    });

    await tx.auditLog.create({
      data: {
        businessId: access.businessId,
        actorId: userId,
        action: hasDiscrepancy ? "transfer.discrepancy" : "transfer.received",
        message: hasDiscrepancy
          ? `Transfer ${transfer.transferNumber} was received with a discrepancy.`
          : `Transfer ${transfer.transferNumber} was received.`,
        metadata: { transferId: transfer.id },
      },
    });

    return mapTransfer(updated);
  });
}

async function updateTransferStatus({
  userId,
  businessId,
  transferId,
  permission,
  allowedStatuses,
  action,
  message,
  data,
}: {
  userId: string;
  businessId: string;
  transferId: string;
  permission: Permission;
  allowedStatuses: StockTransferStatus[];
  action: string;
  message: string;
  data: Prisma.StockTransferUncheckedUpdateInput;
}) {
  const access = await requireBusinessAccess(userId, permission, businessId);

  return getPrisma().$transaction(async (tx) => {
    const transfer = await tx.stockTransfer.findFirst({
      where: { id: transferId, businessId: access.businessId },
      include: transferInclude,
    });

    if (!transfer) {
      throw new Error("Choose a valid transfer.");
    }

    if (!allowedStatuses.includes(transfer.status)) {
      throw new Error(`This transfer cannot be ${message} now.`);
    }

    if (!hasPermission(access.role, permission)) {
      throw new Error("You do not have permission to update this transfer.");
    }

    const updated = await tx.stockTransfer.update({
      where: { id: transfer.id },
      data,
      include: transferInclude,
    });

    await tx.auditLog.create({
      data: {
        businessId: access.businessId,
        actorId: userId,
        action,
        message: `Transfer ${transfer.transferNumber} was ${message}.`,
        metadata: { transferId: transfer.id },
      },
    });

    return mapTransfer(updated);
  });
}

function normalizeTransferItems(items: TransferItemInput[]) {
  const byItemId = new Map<string, Prisma.Decimal>();

  for (const item of items) {
    const quantity = new Prisma.Decimal(item.quantity);

    if (quantity.lte(0)) {
      continue;
    }

    byItemId.set(
      item.inventoryItemId,
      (byItemId.get(item.inventoryItemId) ?? new Prisma.Decimal(0)).plus(quantity),
    );
  }

  return Array.from(byItemId, ([inventoryItemId, quantity]) => ({
    inventoryItemId,
    quantity,
  }));
}

function createTransferNumber() {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `TRF-${Date.now().toString(36).toUpperCase()}-${suffix}`;
}

const transferInclude = {
  sourceLocation: { select: { id: true, name: true, type: true } },
  destinationLocation: { select: { id: true, name: true, type: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  approvedBy: { select: { id: true, name: true, email: true } },
  sentBy: { select: { id: true, name: true, email: true } },
  receivedBy: { select: { id: true, name: true, email: true } },
  items: {
    include: {
      inventoryItem: { select: { id: true, name: true, sku: true, barcode: true } },
    },
    orderBy: { id: "asc" as const },
  },
};

type TransferWithInclude = Prisma.StockTransferGetPayload<{
  include: typeof transferInclude;
}>;

type TransferAuditEvent = {
  id: string;
  action: string;
  message: string;
  createdAt: string;
  actor?: ReturnType<typeof mapTransferUser>;
};

const transferAuditActions = [
  "transfer.created",
  "transfer.approved",
  "transfer.sent",
  "transfer.received",
  "transfer.discrepancy",
  "transfer.cancelled",
  "transfer.rejected",
];

function mapTransfer(transfer: TransferWithInclude, auditEvents: TransferAuditEvent[] = []) {
  return {
    id: transfer.id,
    transferNumber: transfer.transferNumber,
    status: transfer.status.toLowerCase(),
    reason: transfer.reason ?? undefined,
    reference: transfer.reference ?? undefined,
    sourceLocation: {
      id: transfer.sourceLocation.id,
      name: transfer.sourceLocation.name,
      type: transfer.sourceLocation.type.toLowerCase(),
    },
    destinationLocation: {
      id: transfer.destinationLocation.id,
      name: transfer.destinationLocation.name,
      type: transfer.destinationLocation.type.toLowerCase(),
    },
    createdBy: mapTransferUser(transfer.createdBy),
    approvedBy: mapTransferUser(transfer.approvedBy),
    sentBy: mapTransferUser(transfer.sentBy),
    receivedBy: mapTransferUser(transfer.receivedBy),
    approvedAt: transfer.approvedAt?.toISOString(),
    sentAt: transfer.sentAt?.toISOString(),
    receivedAt: transfer.receivedAt?.toISOString(),
    cancelledAt: transfer.cancelledAt?.toISOString(),
    createdAt: transfer.createdAt.toISOString(),
    updatedAt: transfer.updatedAt.toISOString(),
    auditEvents,
    items: transfer.items.map((item) => ({
      id: item.id,
      inventoryItemId: item.inventoryItemId,
      name: item.inventoryItem.name,
      sku: item.inventoryItem.sku ?? undefined,
      barcode: item.inventoryItem.barcode ?? undefined,
      requestedQuantity: item.requestedQuantity.toNumber(),
      sentQuantity: item.sentQuantity.toNumber(),
      receivedQuantity: item.receivedQuantity.toNumber(),
      damagedQuantity: item.damagedQuantity.toNumber(),
      shortageQuantity: item.shortageQuantity.toNumber(),
      note: item.note ?? undefined,
    })),
  };
}

function getAuditTransferId(metadata: Prisma.JsonValue) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const transferId = metadata.transferId;

  return typeof transferId === "string" ? transferId : null;
}

function mapTransferUser(user: { id: string; name: string; email: string } | null) {
  return user
    ? {
        id: user.id,
        name: user.name,
        email: user.email,
      }
    : undefined;
}
