import {
  DebtEventType,
  InventoryMovementType,
  IssuedDocumentType,
  Prisma,
  StockTransferStatus,
  TransactionType,
} from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import {
  aggregateStaffPerformance,
  emptyUnattributedRecords,
  getComparisonPeriod,
  type StaffPerformancePeriod,
  type StaffPerformanceSourceEvent,
  type StaffPerformanceSummary,
  type StaffPerformanceUnattributedRecords,
} from "@/lib/staff-performance/definitions";

const transactionAuditActions = [
  "transaction.sale",
  "transaction.expense",
  "pos.sale",
  "transaction.reversed",
] as const;

const transferAuditActions = ["transfer.cancelled", "transfer.rejected"] as const;

type StaffPerformanceQuery = {
  businessId: string;
  period: StaffPerformancePeriod;
  locationId?: string;
  generatedAt?: Date;
};

export async function getStaffPerformanceSummary({
  businessId,
  period,
  locationId,
  generatedAt = new Date(),
}: StaffPerformanceQuery): Promise<StaffPerformanceSummary> {
  const prisma = getPrisma();
  const comparisonPeriod = getComparisonPeriod(period);
  const windowStart = comparisonPeriod.periodStart;
  const windowEnd = period.periodEnd;
  const dateWindow = { gte: windowStart, lt: windowEnd };
  const locationFilter = locationId ? { locationId } : {};
  const [
    business,
    members,
    location,
    transactions,
    auditLogs,
    debtEvents,
    inventoryMovements,
    transfers,
    issuedDocuments,
    customerReturns,
    supplierReturns,
  ] = await Promise.all([
    prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { id: true, name: true, currency: true },
    }),
    prisma.businessMember.findMany({
      where: { businessId },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    }),
    locationId
      ? prisma.businessLocation.findFirst({
          where: { id: locationId, businessId, archivedAt: null },
          select: { id: true, name: true },
        })
      : Promise.resolve(null),
    prisma.transaction.findMany({
      where: {
        businessId,
        occurredAt: dateWindow,
        type: { in: [TransactionType.SALE, TransactionType.EXPENSE] },
        reversesTransactionId: null,
        ...locationFilter,
      },
      select: {
        id: true,
        type: true,
        amount: true,
        occurredAt: true,
        locationId: true,
        reversalTransaction: { select: { id: true } },
      },
    }),
    prisma.auditLog.findMany({
      where: {
        businessId,
        createdAt: dateWindow,
        action: { in: [...transactionAuditActions, ...transferAuditActions] },
      },
      select: {
        id: true,
        actorId: true,
        action: true,
        metadata: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
      take: 10_000,
    }),
    prisma.debtEvent.findMany({
      where: {
        createdAt: dateWindow,
        type: {
          in: [DebtEventType.CUSTOMER_COLLECTION, DebtEventType.SUPPLIER_SETTLEMENT],
        },
        debt: { businessId },
      },
      select: {
        id: true,
        actorId: true,
        type: true,
        amount: true,
        createdAt: true,
        debt: {
          select: {
            sourceTransaction: { select: { locationId: true } },
          },
        },
      },
    }),
    prisma.inventoryMovement.findMany({
      where: {
        businessId,
        createdAt: dateWindow,
        type: { in: [InventoryMovementType.STOCK_IN, InventoryMovementType.STOCK_OUT] },
        ...(locationId
          ? {
              OR: [
                { locationId },
                { sourceLocationId: locationId },
                { destinationLocationId: locationId },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        actorId: true,
        type: true,
        createdAt: true,
        locationId: true,
        sourceLocationId: true,
        destinationLocationId: true,
      },
    }),
    prisma.stockTransfer.findMany({
      where: {
        businessId,
        AND: [
          {
            OR: [
              { createdAt: dateWindow },
              { approvedAt: dateWindow },
              { sentAt: dateWindow },
              { receivedAt: dateWindow },
            ],
          },
          ...(locationId
            ? [
                {
                  OR: [{ sourceLocationId: locationId }, { destinationLocationId: locationId }],
                },
              ]
            : []),
        ],
      },
      select: {
        id: true,
        status: true,
        sourceLocationId: true,
        destinationLocationId: true,
        createdById: true,
        approvedById: true,
        sentById: true,
        receivedById: true,
        createdAt: true,
        approvedAt: true,
        sentAt: true,
        receivedAt: true,
      },
    }),
    prisma.issuedDocument.findMany({
      where: {
        businessId,
        type: IssuedDocumentType.INVOICE,
        createdAt: dateWindow,
        ...locationFilter,
      },
      select: {
        id: true,
        actorId: true,
        createdAt: true,
        locationId: true,
      },
    }),
    prisma.customerReturn.findMany({
      where: {
        businessId,
        createdAt: dateWindow,
        ...locationFilter,
      },
      select: {
        id: true,
        actorId: true,
        createdAt: true,
        locationId: true,
      },
    }),
    prisma.supplierReturn.findMany({
      where: {
        businessId,
        createdAt: dateWindow,
        ...locationFilter,
      },
      select: {
        id: true,
        actorId: true,
        createdAt: true,
        locationId: true,
      },
    }),
  ]);

  const activeTransactions = transactions.filter((transaction) => !transaction.reversalTransaction);
  const transactionById = new Map(activeTransactions.map((transaction) => [transaction.id, transaction]));
  const memberIds = new Set(members.map((member) => member.userId));
  const currentEvents: StaffPerformanceSourceEvent[] = [];
  const comparisonEvents: StaffPerformanceSourceEvent[] = [];
  const unattributedRecords = emptyUnattributedRecords();
  const dataQualityNotes = new Set<string>();
  let salesWithAttributedAmount = 0;
  let attributedSaleEvents = 0;
  let attributedExpenseEvents = 0;

  const addEvent = (event: StaffPerformanceSourceEvent) => {
    if (!matchesLocation(event.locationId, locationId)) {
      if (locationId && !event.locationId) {
        unattributedRecords.locationUnscopedRecords += 1;
      }
      return;
    }

    if (isWithin(event.occurredAt, period.periodStart, period.periodEnd)) {
      currentEvents.push(event);
      return;
    }

    if (isWithin(event.occurredAt, comparisonPeriod.periodStart, comparisonPeriod.periodEnd)) {
      comparisonEvents.push(event);
    }
  };
  const shouldCountCurrentSource = (occurredAt: Date | string, sourceLocationId?: string | null) =>
    isWithin(occurredAt, period.periodStart, period.periodEnd) && matchesLocation(sourceLocationId, locationId);

  for (const log of auditLogs) {
    const metadata = asRecord(log.metadata);
    const transactionId = stringValue(metadata.transactionId);
    const transaction = transactionId ? transactionById.get(transactionId) : null;
    const eventLocationId = transaction?.locationId ?? stringValue(metadata.locationId);
    const amount = transaction ? decimalToNumber(transaction.amount) : numberValue(metadata.amount);

    if (log.action === "pos.sale" || log.action === "transaction.sale") {
      const hasReliableAmount = Boolean(transaction && transaction.type === TransactionType.SALE) || isFiniteNumber(amount);
      addEvent({
        id: log.id,
        actorId: log.actorId,
        kind: "sale",
        occurredAt: log.createdAt,
        amount,
        locationId: eventLocationId,
        source: log.action,
        hasReliableAmount,
      });

      if (shouldCountCurrentSource(log.createdAt, eventLocationId)) {
        if (log.actorId && memberIds.has(log.actorId)) {
          attributedSaleEvents += 1;

          if (hasReliableAmount) {
            salesWithAttributedAmount += 1;
          } else {
            dataQualityNotes.add(
              "Some sale actions are attributed to staff but do not expose a reliable staff-level sale amount.",
            );
          }
        } else {
          unattributedRecords.salesTransactions += 1;
        }
      }
    }

    if (log.action === "transaction.expense") {
      addEvent({
        id: log.id,
        actorId: log.actorId,
        kind: "expense",
        occurredAt: log.createdAt,
        amount,
        locationId: eventLocationId,
        source: log.action,
        hasReliableAmount: isFiniteNumber(amount),
      });

      if (shouldCountCurrentSource(log.createdAt, eventLocationId)) {
        if (log.actorId && memberIds.has(log.actorId)) {
          attributedExpenseEvents += 1;
        } else {
          unattributedRecords.expenses += 1;
        }
      }
    }

    if (log.action === "transaction.reversed") {
      addEvent({
        id: log.id,
        actorId: log.actorId,
        kind: "reversal",
        occurredAt: log.createdAt,
        locationId: eventLocationId,
        source: log.action,
      });

      if (shouldCountCurrentSource(log.createdAt, eventLocationId) && !log.actorId) {
        unattributedRecords.reversalsCorrections += 1;
      }
    }

    if (transferAuditActions.includes(log.action as (typeof transferAuditActions)[number])) {
      addEvent({
        id: log.id,
        actorId: log.actorId,
        kind: "transfer",
        occurredAt: log.createdAt,
        locationId: eventLocationId,
        source: log.action,
      });

      if (shouldCountCurrentSource(log.createdAt, eventLocationId) && !log.actorId) {
        unattributedRecords.warehouseTransferActions += 1;
      }
    }
  }

  for (const event of debtEvents) {
    const kind = event.type === DebtEventType.CUSTOMER_COLLECTION ? "debt_collection" : "supplier_settlement";
    addEvent({
      id: event.id,
      actorId: event.actorId,
      kind,
      occurredAt: event.createdAt,
      amount: event.amount ? decimalToNumber(event.amount) : null,
      locationId: event.debt.sourceTransaction.locationId,
      source: `debt_event.${event.type.toLowerCase()}`,
      hasReliableAmount: Boolean(event.amount),
    });

    if (isWithin(event.createdAt, period.periodStart, period.periodEnd) && !event.actorId) {
      if (kind === "debt_collection") {
        unattributedRecords.debtCollections += 1;
      } else {
        unattributedRecords.supplierSettlements += 1;
      }
    }
  }

  for (const movement of inventoryMovements) {
    const eventLocationId = locationId
      ? firstMatchingLocation(locationId, movement.locationId, movement.sourceLocationId, movement.destinationLocationId)
      : movement.locationId;
    const kind = movement.type === InventoryMovementType.STOCK_IN ? "stock_in" : "stock_out";
    addEvent({
      id: movement.id,
      actorId: movement.actorId,
      kind,
      occurredAt: movement.createdAt,
      locationId: eventLocationId,
      source: `inventory_movement.${movement.type.toLowerCase()}`,
    });

    if (isWithin(movement.createdAt, period.periodStart, period.periodEnd) && !movement.actorId) {
      if (kind === "stock_in") {
        unattributedRecords.stockInOperations += 1;
      } else {
        unattributedRecords.stockOutOperations += 1;
      }
    }
  }

  for (const transfer of transfers) {
    const eventLocationId = locationId
      ? firstMatchingLocation(locationId, transfer.sourceLocationId, transfer.destinationLocationId)
      : transfer.sourceLocationId;
    addTransferEvent({
      transferId: transfer.id,
      actorId: transfer.createdById,
      occurredAt: transfer.createdAt,
      locationId: eventLocationId,
      source: "stock_transfer.created",
      addEvent,
      unattributedRecords,
      period,
    });
    addTransferEvent({
      transferId: transfer.id,
      actorId: transfer.approvedById,
      occurredAt: transfer.approvedAt,
      locationId: eventLocationId,
      source: "stock_transfer.approved",
      addEvent,
      unattributedRecords,
      period,
    });
    addTransferEvent({
      transferId: transfer.id,
      actorId: transfer.sentById,
      occurredAt: transfer.sentAt,
      locationId: eventLocationId,
      source: "stock_transfer.sent",
      addEvent,
      unattributedRecords,
      period,
    });
    addTransferEvent({
      transferId: transfer.id,
      actorId: transfer.receivedById,
      occurredAt:
        transfer.status === StockTransferStatus.RECEIVED || transfer.status === StockTransferStatus.PARTIALLY_RECEIVED
          ? transfer.receivedAt
          : null,
      locationId: eventLocationId,
      source: "stock_transfer.received",
      addEvent,
      unattributedRecords,
      period,
    });
  }

  for (const document of issuedDocuments) {
    addEvent({
      id: document.id,
      actorId: document.actorId,
      kind: "invoice",
      occurredAt: document.createdAt,
      locationId: document.locationId,
      source: "issued_document.invoice",
    });

    if (isWithin(document.createdAt, period.periodStart, period.periodEnd) && !document.actorId) {
      unattributedRecords.invoices += 1;
    }
  }

  for (const returnRecord of customerReturns) {
    addEvent({
      id: returnRecord.id,
      actorId: returnRecord.actorId,
      kind: "reversal",
      occurredAt: returnRecord.createdAt,
      locationId: returnRecord.locationId,
      source: "customer_return",
    });

    if (isWithin(returnRecord.createdAt, period.periodStart, period.periodEnd) && !returnRecord.actorId) {
      unattributedRecords.reversalsCorrections += 1;
    }
  }

  for (const returnRecord of supplierReturns) {
    addEvent({
      id: returnRecord.id,
      actorId: returnRecord.actorId,
      kind: "reversal",
      occurredAt: returnRecord.createdAt,
      locationId: returnRecord.locationId,
      source: "supplier_return",
    });

    if (isWithin(returnRecord.createdAt, period.periodStart, period.periodEnd) && !returnRecord.actorId) {
      unattributedRecords.reversalsCorrections += 1;
    }
  }

  const currentTransactions = activeTransactions.filter((transaction) =>
    isWithin(transaction.occurredAt, period.periodStart, period.periodEnd),
  );
  const currentSalesTransactions = currentTransactions.filter((transaction) => transaction.type === TransactionType.SALE);
  const currentExpenseTransactions = currentTransactions.filter((transaction) => transaction.type === TransactionType.EXPENSE);
  const totalBusinessSalesAmount = currentSalesTransactions.reduce(
    (sum, transaction) => sum + decimalToNumber(transaction.amount),
    0,
  );

  unattributedRecords.salesTransactions = Math.max(
    unattributedRecords.salesTransactions,
    currentSalesTransactions.length - attributedSaleEvents,
  );
  unattributedRecords.salesAmountRecords += Math.max(currentSalesTransactions.length - salesWithAttributedAmount, 0);
  unattributedRecords.expenses = Math.max(
    unattributedRecords.expenses,
    currentExpenseTransactions.length - attributedExpenseEvents,
  );

  if (unattributedRecords.salesAmountRecords > 0) {
    dataQualityNotes.add(
      "Some sale amounts cannot be assigned to a staff member because the source transaction has no actor field.",
    );
  }

  if (unattributedRecords.expenses > 0) {
    dataQualityNotes.add(
      "Some expense records cannot be assigned to a staff member because the source transaction has no actor field.",
    );
  }

  if (unattributedRecords.locationUnscopedRecords > 0) {
    dataQualityNotes.add(
      "Some records were not included in the location filter because the source does not expose a reliable location.",
    );
  }

  return aggregateStaffPerformance({
    business,
    location: location ? { id: location.id, name: location.name } : undefined,
    period,
    comparisonPeriod,
    members: members.map((member) => ({
      userId: member.user.id,
      name: member.user.name || member.user.email,
      email: member.user.email,
      role: member.role,
    })),
    currentEvents,
    comparisonEvents,
    totalBusinessSalesAmount,
    totalBusinessSalesTransactions: currentSalesTransactions.length,
    unattributedRecords,
    dataQualityNotes: Array.from(dataQualityNotes),
    generatedAt,
  });
}

export async function getStaffPerformanceDetail({
  businessId,
  staffId,
  period,
  locationId,
  generatedAt,
}: StaffPerformanceQuery & { staffId: string }) {
  const summary = await getStaffPerformanceSummary({
    businessId,
    period,
    locationId,
    generatedAt,
  });
  const row = summary.rows.find((item) => item.staff.userId === staffId);

  return {
    summary: {
      ...summary,
      rows: row ? [row] : [],
    },
    row: row ?? null,
  };
}

function addTransferEvent({
  transferId,
  actorId,
  occurredAt,
  locationId,
  source,
  addEvent,
  unattributedRecords,
  period,
}: {
  transferId: string;
  actorId: string | null;
  occurredAt: Date | null;
  locationId: string | null;
  source: string;
  addEvent: (event: StaffPerformanceSourceEvent) => void;
  unattributedRecords: StaffPerformanceUnattributedRecords;
  period: StaffPerformancePeriod;
}) {
  if (!occurredAt) {
    return;
  }

  addEvent({
    id: `${transferId}:${source}`,
    actorId,
    kind: "transfer",
    occurredAt,
    locationId,
    source,
  });

  if (isWithin(occurredAt, period.periodStart, period.periodEnd) && !actorId) {
    unattributedRecords.warehouseTransferActions += 1;
  }
}

function matchesLocation(sourceLocationId: string | null | undefined, selectedLocationId: string | undefined) {
  return !selectedLocationId || sourceLocationId === selectedLocationId;
}

function firstMatchingLocation(selectedLocationId: string, ...locations: Array<string | null>) {
  return locations.includes(selectedLocationId) ? selectedLocationId : null;
}

function isWithin(value: Date | string, periodStart: Date, periodEnd: Date) {
  const date = new Date(value);
  return date >= periodStart && date < periodEnd;
}

function decimalToNumber(value: Prisma.Decimal | number) {
  return typeof value === "number" ? value : value.toNumber();
}

function asRecord(value: Prisma.JsonValue | null) {
  return typeof value === "object" && value && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
