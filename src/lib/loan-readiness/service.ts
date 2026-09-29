import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import {
  loanReadinessDocumentLabels,
  loanReadinessDocumentTypes,
  loanReadinessFormulaVersion,
  type LoanReadinessDocumentDto,
  type LoanReadinessHistoryItem,
  type LoanReadinessProfileDto,
  type LoanReadinessReport,
} from "@/lib/loan-readiness/definitions";
import {
  buildLoanReadinessReport,
  type LoanReadinessFacts,
} from "@/lib/loan-readiness/report";

export async function calculateLoanReadinessReport({
  businessId,
  locationId,
  now = new Date(),
}: {
  businessId: string;
  locationId?: string;
  now?: Date;
}) {
  const periodEnd = now;
  const periodStart = addDays(periodEnd, -180);
  const prisma = getPrisma();
  const [
    business,
    location,
    profile,
    documents,
    transactions,
    payments,
    debts,
    bankRows,
    taxProfile,
    taxSnapshots,
    taxReviewItems,
    inventoryItems,
    inventoryBalances,
    inventoryMovements,
    issuedDocuments,
  ] = await Promise.all([
    prisma.business.findUnique({
      where: { id: businessId },
      select: {
        id: true,
        name: true,
        currency: true,
        createdAt: true,
        businessCategory: true,
        businessType: true,
        receiptConfig: { select: { id: true } },
        documentBranding: { select: { id: true } },
      },
    }),
    locationId
      ? prisma.businessLocation.findFirst({
          where: { id: locationId, businessId, archivedAt: null },
          select: { id: true, name: true },
        })
      : Promise.resolve(null),
    prisma.loanReadinessProfile.findUnique({ where: { businessId } }),
    prisma.loanReadinessDocument.findMany({
      where: { businessId },
      orderBy: { documentType: "asc" },
    }),
    prisma.transaction.findMany({
      where: {
        businessId,
        ...(locationId ? { locationId } : {}),
        occurredAt: { gte: periodStart, lt: periodEnd },
      },
      select: {
        id: true,
        type: true,
        amount: true,
        profit: true,
        occurredAt: true,
        category: true,
        receiptId: true,
        customerId: true,
        supplierId: true,
        duplicateFingerprint: true,
        reversalTransaction: { select: { id: true } },
      },
    }),
    prisma.transactionPayment.findMany({
      where: {
        businessId,
        ...(locationId ? { locationId } : {}),
        createdAt: { gte: periodStart, lt: periodEnd },
      },
      select: { createdAt: true },
    }),
    prisma.debt.findMany({
      where: {
        businessId,
        status: "OPEN",
        ...(locationId ? { sourceTransaction: { locationId } } : {}),
      },
      select: {
        type: true,
        amount: true,
        paidAmount: true,
        dueAt: true,
        createdAt: true,
        customerId: true,
      },
    }),
    prisma.bankStatementImportRow.findMany({
      where: {
        businessId,
        postedAt: { gte: periodStart, lt: periodEnd },
        ...(locationId ? { statementImport: { locationId } } : {}),
      },
      select: {
        postedAt: true,
        amount: true,
        status: true,
        duplicateStatus: true,
      },
    }),
    prisma.businessTaxProfile.findUnique({
      where: { businessId },
      select: { id: true },
    }),
    prisma.taxPeriodSnapshot.findMany({
      where: {
        businessId,
        generatedAt: { gte: periodStart, lt: periodEnd },
      },
      select: { generatedAt: true },
    }),
    prisma.taxReviewItem.findMany({
      where: { businessId, status: "open" },
      select: { severity: true },
    }),
    locationId
      ? Promise.resolve([])
      : prisma.inventoryItem.findMany({
          where: { businessId, archivedAt: null },
          select: { quantityOnHandDecimal: true, costPrice: true },
        }),
    locationId
      ? prisma.inventoryBalance.findMany({
          where: { businessId, locationId },
          select: {
            quantityOnHandDecimal: true,
            inventoryItem: { select: { costPrice: true, archivedAt: true } },
          },
        })
      : Promise.resolve([]),
    prisma.inventoryMovement.findMany({
      where: {
        businessId,
        createdAt: { gte: periodStart, lt: periodEnd },
        ...(locationId
          ? { OR: [{ locationId }, { sourceLocationId: locationId }, { destinationLocationId: locationId }] }
          : {}),
      },
      select: { createdAt: true },
    }),
    prisma.issuedDocument.findMany({
      where: {
        businessId,
        ...(locationId ? { locationId } : {}),
        issueDate: { gte: periodStart, lt: periodEnd },
      },
      select: { issueDate: true },
    }),
  ]);

  if (!business || (locationId && !location)) {
    throw new LoanReadinessServiceError(
      locationId ? "Choose a valid business location." : "Choose a valid business.",
      locationId ? 400 : 404,
      locationId ? "location_invalid" : "business_not_found",
    );
  }

  const profileDto = serializeProfile(profile, documents, business.currency);
  const scopedInventory = locationId
    ? inventoryBalances.filter((item) => !item.inventoryItem.archivedAt).map((item) => ({
        quantity: item.quantityOnHandDecimal.toNumber(),
        costPrice: item.inventoryItem.costPrice.toNumber(),
      }))
    : inventoryItems.map((item) => ({
        quantity: item.quantityOnHandDecimal.toNumber(),
        costPrice: item.costPrice.toNumber(),
      }));
  const facts: LoanReadinessFacts = {
    business: {
      id: business.id,
      name: business.name,
      currency: business.currency,
      createdAt: business.createdAt,
      businessCategory: business.businessCategory,
      businessType: business.businessType,
      hasReceiptConfig: Boolean(business.receiptConfig),
      hasDocumentBranding: Boolean(business.documentBranding),
    },
    location: location ?? undefined,
    generatedAt: now,
    periodStart,
    periodEnd,
    profile: profileDto,
    transactions: transactions.map((transaction) => ({
      id: transaction.id,
      type: transaction.type,
      amount: transaction.amount.toNumber(),
      profit: transaction.profit.toNumber(),
      occurredAt: transaction.occurredAt,
      category: transaction.category,
      receiptId: transaction.receiptId,
      customerId: transaction.customerId,
      supplierId: transaction.supplierId,
      duplicateFingerprint: transaction.duplicateFingerprint,
      reversed: Boolean(transaction.reversalTransaction),
    })),
    payments,
    debts: debts.map((debt) => ({
      type: debt.type,
      amount: debt.amount.toNumber(),
      paidAmount: debt.paidAmount.toNumber(),
      dueAt: debt.dueAt,
      createdAt: debt.createdAt,
      customerId: debt.customerId,
    })),
    bankRows: bankRows.map((row) => ({
      postedAt: row.postedAt,
      amount: row.amount.toNumber(),
      status: row.status,
      duplicateStatus: row.duplicateStatus,
    })),
    tax: {
      profileConfigured: Boolean(taxProfile),
      snapshotDates: taxSnapshots.map((snapshot) => snapshot.generatedAt),
      openReviewItems: taxReviewItems,
    },
    inventory: {
      itemCount: scopedInventory.length,
      value: scopedInventory.reduce(
        (total, item) => total + Math.max(0, item.quantity) * Math.max(0, item.costPrice),
        0,
      ),
      movementDates: inventoryMovements.map((movement) => movement.createdAt),
    },
    issuedDocumentDates: issuedDocuments.map((document) => document.issueDate),
  };

  return buildLoanReadinessReport(facts);
}

export async function getLoanReadinessProfile(businessId: string) {
  const prisma = getPrisma();
  const [business, profile, documents] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId }, select: { currency: true } }),
    prisma.loanReadinessProfile.findUnique({ where: { businessId } }),
    prisma.loanReadinessDocument.findMany({ where: { businessId }, orderBy: { documentType: "asc" } }),
  ]);

  if (!business) {
    throw new LoanReadinessServiceError("Choose a valid business.", 404, "business_not_found");
  }

  return serializeProfile(profile, documents, business.currency);
}

export async function updateLoanReadinessProfile({
  businessId,
  input,
}: {
  businessId: string;
  input: Omit<LoanReadinessProfileDto, "updatedAt">;
}) {
  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    await tx.loanReadinessProfile.upsert({
      where: { businessId },
      create: {
        businessId,
        industry: emptyToNull(input.industry),
        operatingStartDate: input.operatingStartDate ? new Date(input.operatingStartDate) : null,
        fundingPurpose: emptyToNull(input.fundingPurpose),
        requestedAmount: input.requestedAmount === undefined
          ? null
          : new Prisma.Decimal(input.requestedAmount),
        preferredCurrency: input.preferredCurrency,
        consentToShare: input.consentToShare,
      },
      update: {
        industry: emptyToNull(input.industry),
        operatingStartDate: input.operatingStartDate ? new Date(input.operatingStartDate) : null,
        fundingPurpose: emptyToNull(input.fundingPurpose),
        requestedAmount: input.requestedAmount === undefined
          ? null
          : new Prisma.Decimal(input.requestedAmount),
        preferredCurrency: input.preferredCurrency,
        consentToShare: input.consentToShare,
      },
    });

    for (const document of input.documents) {
      await tx.loanReadinessDocument.upsert({
        where: {
          businessId_documentType: {
            businessId,
            documentType: document.documentType,
          },
        },
        create: {
          businessId,
          documentType: document.documentType,
          label: document.label,
          status: document.status,
          reference: emptyToNull(document.reference),
          issuedAt: document.issuedAt ? new Date(document.issuedAt) : null,
          expiresAt: document.expiresAt ? new Date(document.expiresAt) : null,
          notes: emptyToNull(document.notes),
        },
        update: {
          label: document.label,
          status: document.status,
          reference: emptyToNull(document.reference),
          issuedAt: document.issuedAt ? new Date(document.issuedAt) : null,
          expiresAt: document.expiresAt ? new Date(document.expiresAt) : null,
          notes: emptyToNull(document.notes),
        },
      });
    }
  });

  return getLoanReadinessProfile(businessId);
}

export async function saveLoanReadinessReport({
  report,
  generatedByUserId,
  recalculatedFromId,
}: {
  report: LoanReadinessReport;
  generatedByUserId: string;
  recalculatedFromId?: string;
}) {
  if (recalculatedFromId) {
    const existing = await getPrisma().loanReadinessSnapshot.findFirst({
      where: { id: recalculatedFromId, businessId: report.business.id },
      select: { id: true },
    });
    if (!existing) {
      throw new LoanReadinessServiceError(
        "Choose a valid earlier assessment from this business.",
        404,
        "snapshot_not_found",
      );
    }
  }

  return getPrisma().loanReadinessSnapshot.create({
    data: {
      businessId: report.business.id,
      locationId: report.location.id,
      formulaVersion: loanReadinessFormulaVersion,
      score: report.percentage,
      rating: report.overallStatus,
      confidence: confidenceForReport(report),
      periodStart: new Date(report.evidence.period.start),
      periodEnd: new Date(report.evidence.period.end),
      generatedAt: new Date(report.generatedAt),
      expiresAt: new Date(report.expiresAt),
      generatedByUserId,
      components: toJson(report.categories),
      categoryResults: toJson(report.categories),
      strengths: toJson(report.categories.filter((category) => category.status === "Ready").map((category) => category.label)),
      weaknesses: toJson(report.categories.filter((category) => ["Missing data", "Needs attention", "Insufficient history"].includes(category.status)).map((category) => category.label)),
      recommendations: toJson(report.recommendations),
      dataCompleteness: toJson(report.evidence.sourceCounts),
      dataWarnings: toJson(report.evidence.limitations),
      sourceMetrics: toJson(report.evidence),
      evidenceSummary: toJson(report.evidence),
      overallStatus: report.overallStatus,
      recalculatedFromId,
    },
  });
}

export async function listLoanReadinessHistory({
  businessId,
  locationId,
  limit = 20,
}: {
  businessId: string;
  locationId?: string;
  limit?: number;
}): Promise<LoanReadinessHistoryItem[]> {
  const snapshots = await getPrisma().loanReadinessSnapshot.findMany({
    where: { businessId, ...(locationId ? { locationId } : {}) },
    orderBy: { generatedAt: "desc" },
    take: Math.min(50, Math.max(1, limit)),
    include: {
      location: { select: { name: true } },
      generatedBy: { select: { name: true } },
    },
  });

  return snapshots.map((snapshot) => ({
    id: snapshot.id,
    formulaVersion: snapshot.formulaVersion,
    percentage: snapshot.score,
    overallStatus: snapshot.overallStatus ?? snapshot.rating,
    generatedAt: snapshot.generatedAt.toISOString(),
    expiresAt: snapshot.expiresAt?.toISOString(),
    locationId: snapshot.locationId ?? undefined,
    locationName: snapshot.location?.name,
    generatedByName: snapshot.generatedBy?.name,
  }));
}

export async function getLoanReadinessSnapshotReport({
  businessId,
  snapshotId,
}: {
  businessId: string;
  snapshotId: string;
}) {
  const snapshot = await getPrisma().loanReadinessSnapshot.findFirst({
    where: { id: snapshotId, businessId },
    include: {
      business: { select: { id: true, name: true, currency: true } },
      location: { select: { id: true, name: true } },
    },
  });

  if (!snapshot) {
    throw new LoanReadinessServiceError("Loan Readiness assessment was not found.", 404, "snapshot_not_found");
  }

  return snapshot;
}

export class LoanReadinessServiceError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = "loan_readiness_invalid") {
    super(message);
    this.name = "LoanReadinessServiceError";
    this.status = status;
    this.code = code;
  }
}

function serializeProfile(
  profile: {
    industry: string | null;
    operatingStartDate: Date | null;
    fundingPurpose: string | null;
    requestedAmount: Prisma.Decimal | null;
    preferredCurrency: string;
    consentToShare: boolean;
    updatedAt: Date;
  } | null,
  documents: Array<{
    documentType: string;
    label: string;
    status: string;
    reference: string | null;
    issuedAt: Date | null;
    expiresAt: Date | null;
    notes: string | null;
  }>,
  businessCurrency: string,
): LoanReadinessProfileDto {
  const documentsByType = new Map(documents.map((document) => [document.documentType, document]));
  const documentDtos: LoanReadinessDocumentDto[] = loanReadinessDocumentTypes.map((documentType) => {
    const document = documentsByType.get(documentType);
    return {
      documentType,
      label: document?.label ?? loanReadinessDocumentLabels[documentType],
      status: normalizeDocumentStatus(document?.status),
      reference: document?.reference ?? undefined,
      issuedAt: document?.issuedAt?.toISOString(),
      expiresAt: document?.expiresAt?.toISOString(),
      notes: document?.notes ?? undefined,
    };
  });

  return {
    industry: profile?.industry ?? undefined,
    operatingStartDate: profile?.operatingStartDate?.toISOString(),
    fundingPurpose: profile?.fundingPurpose ?? undefined,
    requestedAmount: profile?.requestedAmount?.toNumber(),
    preferredCurrency: profile?.preferredCurrency || businessCurrency,
    consentToShare: profile?.consentToShare ?? false,
    documents: documentDtos,
    updatedAt: profile?.updatedAt.toISOString(),
  };
}

function normalizeDocumentStatus(value?: string) {
  return ["MISSING", "AVAILABLE", "NEEDS_UPDATE"].includes(value ?? "")
    ? value as LoanReadinessDocumentDto["status"]
    : "MISSING";
}

function confidenceForReport(report: LoanReadinessReport) {
  const months = report.evidence.activityMonths.length;
  if (months >= 6 && report.evidence.sourceCounts.transactions >= 50) return "high";
  if (months >= 3 && report.evidence.sourceCounts.transactions >= 15) return "medium";
  return "insufficient_data";
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function emptyToNull(value?: string) {
  const trimmed = value?.trim();
  return trimmed || null;
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}
