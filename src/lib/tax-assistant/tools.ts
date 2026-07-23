import type { TaxAssistantAccess } from "@/lib/tax-assistant/authorization";
import { requireTaxAssistantAccess } from "@/lib/tax-assistant/authorization";
import {
  TaxAssistantDomainError,
} from "@/lib/tax-assistant/api";
import {
  allowedTaxAssistantTools,
  buildTaxAssistantContextSummary,
} from "@/lib/tax-assistant/context";
import type {
  TaxAssistantToolName,
} from "@/lib/tax-assistant/definitions";
import { listTaxPeriods } from "@/lib/tax-assistant/periods";
import {
  calculateTaxAssistantForBusiness,
  getTaxAssistantRulesForBusiness,
  listTaxAssistantReviewItems,
  summarizeReviewItems,
} from "@/lib/tax-assistant/service";

export type TaxAssistantToolInput = {
  access: TaxAssistantAccess;
  toolName: TaxAssistantToolName;
  periodStart: Date;
  periodEnd: Date;
  locationId?: string;
};

export async function runTaxAssistantTool({
  access,
  toolName,
  periodStart,
  periodEnd,
  locationId,
}: TaxAssistantToolInput) {
  if (!allowedTaxAssistantTools.includes(toolName)) {
    throw new TaxAssistantDomainError("Tax Assistant tool is not allowed.", 403, "tool_not_allowed");
  }

  await requireTaxAssistantAccess({
    userId: access.userId,
    businessId: access.businessId,
    permission: permissionForTool(toolName),
    locationId,
  });

  if (toolName === "get_tax_periods") {
    return {
      periods: listTaxPeriods(),
      bounded: true,
    };
  }

  if (toolName === "get_tax_rule_source") {
    return getTaxAssistantRulesForBusiness({ businessId: access.businessId });
  }

  const summary = await calculateTaxAssistantForBusiness({
    businessId: access.businessId,
    locationId,
    periodStart,
    periodEnd,
  });

  switch (toolName) {
    case "get_tax_summary":
      return buildTaxAssistantContextSummary(summary);
    case "get_vat_estimate":
      return {
        taxableSales: summary.figures.taxableSales,
        outputVatEstimate: summary.figures.outputVatEstimate,
        eligibleInputVatEstimate: summary.figures.eligibleInputVatEstimate,
        netVatEstimate: summary.figures.netVatEstimate,
        estimatedTaxDue: summary.figures.estimatedTaxDue,
        formulas: summary.formulas.filter((formula) => formula.label.toLowerCase().includes("vat")),
        source: summary.source,
      };
    case "get_wht_summary":
      return {
        whtDeductedByCustomers: summary.figures.whtDeductedByCustomers,
        whtDeductedFromSuppliers: summary.figures.whtDeductedFromSuppliers,
        potentialWhtCredit: summary.figures.potentialWhtCredit,
        assumption: "WHT is totaled only from explicit transaction WHT metadata, rate, or recorded amount.",
        source: summary.source,
      };
    case "get_tax_review_items": {
      const result = await listTaxAssistantReviewItems({
        businessId: access.businessId,
        locationId,
        periodStart,
        periodEnd,
        limit: 50,
      });
      return {
        ...result,
        severityCounts: summarizeReviewItems(result.items),
      };
    }
    case "get_transaction_tax_context":
      return {
        transactionsWithIssues: summary.reviewItems
          .filter((item) => item.transactionId)
          .slice(0, 25),
        excludedReversedCount: summary.counts.excludedReversedCount,
        probableDuplicateCount: summary.counts.probableDuplicateCount,
        bounded: true,
      };
    case "get_reconciliation_tax_impact":
      return {
        reconciledTaxImpactingAmount: summary.figures.reconciledTaxImpactingAmount,
        unreconciledTaxImpactingAmount: summary.figures.unreconciledTaxImpactingAmount,
        unreconciledBankEntryCount: summary.counts.unreconciledBankEntryCount,
      };
    case "get_data_quality_summary":
      return {
        dataCompletenessRate: summary.figures.dataCompletenessRate,
        taxReadinessScore: summary.figures.taxReadinessScore,
        unresolvedTaxImpactingAmount: summary.figures.unresolvedTaxImpactingAmount,
        missingInformation: summary.missingInformation,
        reviewItemCounts: summarizeReviewItems(summary.reviewItems),
      };
    case "explain_tax_calculation":
      return {
        formulas: summary.formulas,
        assumptions: summary.assumptions,
        includedTransactionCount: summary.counts.includedTransactionCount,
        excludedReversedCount: summary.counts.excludedReversedCount,
        probableDuplicateCount: summary.counts.probableDuplicateCount,
        source: summary.source,
        disclaimer: summary.disclaimer,
      };
    default:
      throw new TaxAssistantDomainError("Tax Assistant tool is not implemented.", 403, "tool_not_implemented");
  }
}

function permissionForTool(toolName: TaxAssistantToolName) {
  if (toolName === "get_tax_review_items" || toolName === "get_transaction_tax_context") {
    return "tax_assistant:review" as const;
  }

  return "tax_assistant:ask" as const;
}
