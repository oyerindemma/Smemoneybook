import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import {
  calculateTaxAssistantSummary,
  type TaxCalculationInput,
  type TaxProfileInput,
  type TaxRuleSetInput,
  type TaxTransactionInput,
} from "@/lib/tax-assistant/calculator";
import { TaxAssistantDomainError } from "@/lib/tax-assistant/api";
import type { TaxAssistantSummary, TaxReviewItemDto } from "@/lib/tax-assistant/definitions";
import { taxAssistantRuleSetVersion } from "@/lib/tax-assistant/definitions";
import { defaultTaxJurisdiction } from "@/lib/tax-assistant/rules";

export type TaxAssistantScope = {
  businessId: string;
  locationId?: string;
  periodStart: Date;
  periodEnd: Date;
  now?: Date;
};

export async function calculateTaxAssistantForBusiness({
  businessId,
  locationId,
  periodStart,
  periodEnd,
  now = new Date(),
}: TaxAssistantScope): Promise<TaxAssistantSummary> {
  const input = await loadTaxCalculationInput({
    businessId,
    locationId,
    periodStart,
    periodEnd,
    now,
  });

  return calculateTaxAssistantSummary(input);
}

export async function listTaxAssistantReviewItems({
  businessId,
  locationId,
  periodStart,
  periodEnd,
  severity,
  issueType,
  limit = 50,
}: TaxAssistantScope & {
  severity?: string;
  issueType?: string;
  limit?: number;
}) {
  const summary = await calculateTaxAssistantForBusiness({
    businessId,
    locationId,
    periodStart,
    periodEnd,
  });
  const normalizedSeverity = severity?.toLowerCase();
  const normalizedIssueType = issueType?.toLowerCase();
  const items = summary.reviewItems.filter((item) => {
    const matchesSeverity = !normalizedSeverity || item.severity === normalizedSeverity;
    const matchesIssue = !normalizedIssueType || item.issueType === normalizedIssueType;
    return matchesSeverity && matchesIssue;
  });

  return {
    items: items.slice(0, limit),
    total: items.length,
    counts: summary.counts,
    source: summary.source,
    disclaimer: summary.disclaimer,
  };
}

export async function getTaxAssistantReviewItem({
  businessId,
  locationId,
  periodStart,
  periodEnd,
  itemId,
}: TaxAssistantScope & {
  itemId: string;
}) {
  const result = await listTaxAssistantReviewItems({
    businessId,
    locationId,
    periodStart,
    periodEnd,
    limit: 100,
  });
  const item = result.items.find((candidate) => candidate.id === itemId);

  if (!item) {
    return null;
  }

  return {
    item,
    source: result.source,
    disclaimer: result.disclaimer,
  };
}

export async function getTaxAssistantRulesForBusiness({ businessId }: { businessId: string }) {
  const { ruleSet } = await loadTaxRuleContext(businessId);

  if (!ruleSet) {
    return {
      ruleSet: null,
      rules: [],
      warnings: ["No verified Tax Assistant rule set is configured for this business."],
    };
  }

  return {
    ruleSet: {
      id: ruleSet.id,
      jurisdiction: ruleSet.jurisdiction,
      version: ruleSet.version,
      status: ruleSet.status,
      sourceTitle: ruleSet.sourceTitle,
      sourceAuthority: ruleSet.sourceAuthority,
      sourceReference: ruleSet.sourceReference,
      lastVerifiedAt: ruleSet.lastVerifiedAt?.toISOString() ?? null,
      verificationOwner: ruleSet.verificationOwner,
      effectiveFrom: ruleSet.effectiveFrom.toISOString(),
      effectiveTo: ruleSet.effectiveTo?.toISOString() ?? null,
    },
    rules: ruleSet.rules.map((rule) => ({
      id: rule.id,
      jurisdiction: rule.jurisdiction,
      taxType: rule.taxType,
      transactionType: rule.transactionType,
      rate: money(rule.rate),
      threshold: rule.threshold ? money(rule.threshold) : null,
      status: rule.status,
      formulaConfig: rule.formulaConfig,
      applicabilityConfig: rule.applicabilityConfig,
      sourceTitle: rule.sourceTitle,
      sourceAuthority: rule.sourceAuthority,
      sourceReference: rule.sourceReference,
      lastVerifiedAt: rule.lastVerifiedAt?.toISOString() ?? null,
      effectiveFrom: rule.effectiveFrom.toISOString(),
      effectiveTo: rule.effectiveTo?.toISOString() ?? null,
    })),
    warnings: ruleSet.status === "verified" && ruleSet.lastVerifiedAt
      ? []
      : ["Tax rule requires verification before estimates are filing-ready."],
  };
}

export async function listTaxAssistantConversations({
  businessId,
  userId,
}: {
  businessId: string;
  userId: string;
}) {
  return getPrisma().taxAssistantConversation.findMany({
    where: { businessId, userId },
    orderBy: { updatedAt: "desc" },
    take: 25,
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          role: true,
          content: true,
          createdAt: true,
        },
      },
    },
  });
}

export async function getTaxAssistantConversation({
  businessId,
  userId,
  conversationId,
}: {
  businessId: string;
  userId: string;
  conversationId: string;
}) {
  return getPrisma().taxAssistantConversation.findFirst({
    where: { id: conversationId, businessId, userId },
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          role: true,
          content: true,
          model: true,
          promptVersion: true,
          toolCalls: true,
          citations: true,
          tokenUsage: true,
          createdAt: true,
        },
      },
    },
  });
}

async function loadTaxCalculationInput({
  businessId,
  locationId,
  periodStart,
  periodEnd,
  now,
}: Required<Pick<TaxAssistantScope, "businessId" | "periodStart" | "periodEnd" | "now">> & {
  locationId?: string;
}): Promise<TaxCalculationInput> {
  const prisma = getPrisma();
  const [business, taxConfig, taxProfile, defaultRuleSet, transactions, unreconciledBankEntries] =
    await Promise.all([
      prisma.business.findUnique({
        where: { id: businessId },
        select: {
          id: true,
          name: true,
          country: true,
          currency: true,
          businessType: true,
          businessCategory: true,
        },
      }),
      prisma.taxConfig.findUnique({
        where: { businessId },
        select: {
          country: true,
          enabled: true,
          registrationNumber: true,
          inclusiveByDefault: true,
        },
      }),
      prisma.businessTaxProfile.findUnique({
        where: { businessId },
        include: { taxRuleSet: { include: { rules: true } } },
      }),
      prisma.taxRuleSet.findFirst({
        where: {
          jurisdiction: defaultTaxJurisdiction,
          version: taxAssistantRuleSetVersion,
        },
        include: { rules: true },
      }),
      prisma.transaction.findMany({
        where: {
          businessId,
          ...(locationId ? { locationId } : {}),
          occurredAt: { gte: periodStart, lt: periodEnd },
        },
        orderBy: { occurredAt: "asc" },
        take: 1000,
        select: {
          id: true,
          businessId: true,
          type: true,
          amount: true,
          description: true,
          category: true,
          paymentStatus: true,
          occurredAt: true,
          customerId: true,
          supplierId: true,
          receiptId: true,
          taxTreatment: true,
          taxMetadata: true,
          vatInclusive: true,
          withholdingTaxRate: true,
          withholdingTaxAmount: true,
          duplicateFingerprint: true,
          reversesTransaction: { select: { id: true } },
          reversalTransaction: { select: { id: true } },
          taxSnapshots: { select: { id: true } },
          reconciliationMatches: {
            where: { status: "CONFIRMED" },
            select: { id: true },
          },
        },
      }),
      prisma.bankStatementImportRow.findMany({
        where: {
          businessId,
          postedAt: { gte: periodStart, lt: periodEnd },
          status: { in: ["UNMATCHED", "SUGGESTED"] },
          ...(locationId ? { statementImport: { locationId } } : {}),
        },
        orderBy: { postedAt: "asc" },
        take: 500,
        select: {
          id: true,
          amount: true,
          direction: true,
        },
      }),
    ]);

  if (!business) {
    throw new TaxAssistantDomainError("Business was not found.", 404, "business_not_found");
  }

  const ruleSet = taxProfile?.taxRuleSet ?? defaultRuleSet;
  const profile = buildProfileInput({
    businessId,
    business,
    taxConfig,
    taxProfile,
    ruleSetId: ruleSet?.id,
  });

  return {
    businessId,
    businessName: business.name,
    country: business.country,
    currency: business.currency,
    periodStart,
    periodEnd,
    filingFrequency: profile.filingFrequency,
    generatedAt: now,
    profile,
    ruleSet: toRuleSetInput(ruleSet),
    transactions: transactions.map(toTransactionInput),
    unreconciledBankEntries: unreconciledBankEntries.map((entry) => ({
      id: entry.id,
      amount: entry.amount,
      direction: entry.direction,
    })),
  };
}

async function loadTaxRuleContext(businessId: string) {
  const [profile, defaultRuleSet] = await Promise.all([
    getPrisma().businessTaxProfile.findUnique({
      where: { businessId },
      include: { taxRuleSet: { include: { rules: true } } },
    }),
    getPrisma().taxRuleSet.findFirst({
      where: {
        jurisdiction: defaultTaxJurisdiction,
        version: taxAssistantRuleSetVersion,
      },
      include: { rules: true },
    }),
  ]);

  return { ruleSet: profile?.taxRuleSet ?? defaultRuleSet };
}

function buildProfileInput({
  businessId,
  business,
  taxConfig,
  taxProfile,
  ruleSetId,
}: {
  businessId: string;
  business: {
    country: string;
    currency: string;
    businessType?: string | null;
    businessCategory?: string | null;
  };
  taxConfig?: {
    country: string;
    enabled: boolean;
    registrationNumber?: string | null;
    inclusiveByDefault: boolean;
  } | null;
  taxProfile?: {
    jurisdiction: string;
    taxIdentificationNumber?: string | null;
    vatRegistered: boolean;
    vatRegistrationDate?: Date | null;
    filingFrequency: string;
    fiscalYearStartMonth: number;
    defaultCurrency: string;
    pricingMode: string;
    whtApplicable: boolean;
    businessType?: string | null;
    industryCategory?: string | null;
  } | null;
  ruleSetId?: string;
}): TaxProfileInput {
  const setupRequired: string[] = [];

  if (business.country !== "NG") {
    setupRequired.push("Only Nigeria Tax Assistant rules are configured in this Preview.");
  }

  if (!ruleSetId) {
    setupRequired.push("No verified Tax Assistant rule set is configured.");
  }

  if (!taxProfile) {
    setupRequired.push("Tax Assistant profile is not configured.");
    setupRequired.push("VAT registration status is missing.");
  }

  const taxIdentificationNumber = taxProfile?.taxIdentificationNumber ?? taxConfig?.registrationNumber;

  if (!taxIdentificationNumber) {
    setupRequired.push("Tax identification number is missing.");
  }

  return {
    businessId,
    jurisdiction: taxProfile?.jurisdiction ?? defaultTaxJurisdiction,
    taxIdentificationNumber,
    vatRegistered: taxProfile?.vatRegistered ?? Boolean(taxConfig?.enabled && taxConfig.registrationNumber),
    vatRegistrationDate: taxProfile?.vatRegistrationDate ?? null,
    filingFrequency: taxProfile?.filingFrequency ?? "MONTHLY",
    fiscalYearStartMonth: taxProfile?.fiscalYearStartMonth ?? 1,
    defaultCurrency: taxProfile?.defaultCurrency ?? business.currency,
    pricingMode: taxProfile?.pricingMode ?? (taxConfig?.inclusiveByDefault ? "tax_inclusive" : "tax_exclusive"),
    whtApplicable: taxProfile?.whtApplicable ?? false,
    businessType: taxProfile?.businessType ?? business.businessType,
    industryCategory: taxProfile?.industryCategory ?? business.businessCategory,
    setupRequired: unique(setupRequired),
  };
}

function toRuleSetInput(
  ruleSet?: {
    version: string;
    status: string;
    jurisdiction: string;
    sourceTitle: string;
    sourceAuthority: string;
    sourceReference: string;
    lastVerifiedAt?: Date | null;
    verificationOwner: string;
    rules: Array<{
      taxType: string;
      transactionType: string;
      rate: Prisma.Decimal;
      threshold?: Prisma.Decimal | null;
      status: string;
    }>;
  } | null,
): TaxRuleSetInput | null {
  if (!ruleSet) {
    return null;
  }

  return {
    version: ruleSet.version,
    status: ruleSet.status,
    jurisdiction: ruleSet.jurisdiction,
    sourceTitle: ruleSet.sourceTitle,
    sourceAuthority: ruleSet.sourceAuthority,
    sourceReference: ruleSet.sourceReference,
    lastVerifiedAt: ruleSet.lastVerifiedAt,
    verificationOwner: ruleSet.verificationOwner,
    rules: ruleSet.rules.map((rule) => ({
      taxType: rule.taxType,
      transactionType: rule.transactionType,
      rate: rule.rate,
      threshold: rule.threshold,
      status: rule.status,
    })),
  };
}

function toTransactionInput(
  transaction: {
    id: string;
    businessId: string;
    type: { toString(): string };
    amount: Prisma.Decimal;
    description: string;
    category?: string | null;
    paymentStatus?: { toString(): string } | null;
    occurredAt: Date;
    customerId?: string | null;
    supplierId?: string | null;
    receiptId?: string | null;
    taxTreatment?: string | null;
    taxMetadata?: Prisma.JsonValue | null;
    vatInclusive?: boolean | null;
    withholdingTaxRate?: Prisma.Decimal | null;
    withholdingTaxAmount?: Prisma.Decimal | null;
    duplicateFingerprint?: string | null;
    reversesTransaction?: { id: string } | null;
    reversalTransaction?: { id: string } | null;
    taxSnapshots: Array<{ id: string }>;
    reconciliationMatches: Array<{ id: string }>;
  },
): TaxTransactionInput {
  return {
    id: transaction.id,
    businessId: transaction.businessId,
    type: transaction.type.toString(),
    amount: transaction.amount,
    description: transaction.description,
    category: transaction.category,
    paymentStatus: transaction.paymentStatus?.toString(),
    occurredAt: transaction.occurredAt,
    customerId: transaction.customerId,
    supplierId: transaction.supplierId,
    receiptId: transaction.receiptId,
    taxTreatment: transaction.taxTreatment,
    taxMetadata: transaction.taxMetadata,
    vatInclusive: transaction.vatInclusive,
    withholdingTaxRate: transaction.withholdingTaxRate,
    withholdingTaxAmount: transaction.withholdingTaxAmount,
    duplicateFingerprint: transaction.duplicateFingerprint,
    isOriginalReversed: Boolean(transaction.reversalTransaction),
    isReversal: Boolean(transaction.reversesTransaction),
    taxSnapshotCount: transaction.taxSnapshots.length,
    confirmedReconciliationCount: transaction.reconciliationMatches.length,
  };
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function money(value: Prisma.Decimal) {
  return Number(value.toFixed(2));
}

export function summarizeReviewItems(items: TaxReviewItemDto[]) {
  return items.reduce(
    (counts, item) => {
      counts.total += 1;
      counts[item.severity] += 1;
      return counts;
    },
    { total: 0, critical: 0, warning: 0, information: 0 },
  );
}
