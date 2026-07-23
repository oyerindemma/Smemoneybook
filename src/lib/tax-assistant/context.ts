import type {
  TaxAssistantSummary,
  TaxAssistantToolName,
  TaxReviewItemDto,
} from "@/lib/tax-assistant/definitions";
import { taxAssistantDisclaimer } from "@/lib/tax-assistant/definitions";

export const allowedTaxAssistantTools: TaxAssistantToolName[] = [
  "get_tax_summary",
  "get_vat_estimate",
  "get_wht_summary",
  "get_tax_periods",
  "get_tax_review_items",
  "get_transaction_tax_context",
  "get_reconciliation_tax_impact",
  "get_data_quality_summary",
  "explain_tax_calculation",
  "get_tax_rule_source",
];

export const prohibitedTaxAssistantTools = [
  "create_transaction",
  "edit_transaction",
  "delete_transaction",
  "file_tax_return",
  "submit_to_tax_authority",
  "pay_tax",
  "change_tax_setting",
  "classify_transaction",
] as const;

export function selectTaxAssistantTools(question: string): TaxAssistantToolName[] {
  const normalized = question.toLowerCase();
  const tools: TaxAssistantToolName[] = ["get_tax_summary"];

  if (/(vat|value added|output|input)/.test(normalized)) {
    tools.push("get_vat_estimate");
  }

  if (/(wht|withholding)/.test(normalized)) {
    tools.push("get_wht_summary");
  }

  if (/(review|missing|receipt|supplier|customer|duplicate|category|incomplete)/.test(normalized)) {
    tools.push("get_tax_review_items", "get_data_quality_summary");
  }

  if (/(period|filing|month|quarter|year)/.test(normalized)) {
    tools.push("get_tax_periods");
  }

  if (/(reconcile|bank|unmatched|matched)/.test(normalized)) {
    tools.push("get_reconciliation_tax_impact");
  }

  if (/(formula|calculate|calculation|explain|why|how)/.test(normalized)) {
    tools.push("explain_tax_calculation");
  }

  if (/(rule|source|rate|authority|law|legal)/.test(normalized)) {
    tools.push("get_tax_rule_source");
  }

  return uniqueTools(tools).slice(0, 8);
}

export function composeGroundedTaxAnswer({
  question,
  summary,
  reviewItems,
  providerConfigured,
}: {
  question: string;
  summary: TaxAssistantSummary;
  reviewItems: TaxReviewItemDto[];
  providerConfigured: boolean;
}) {
  const keyIssues = reviewItems.slice(0, 3).map((item) => `${item.severity}: ${item.explanation}`);
  const setup = summary.missingInformation.length
    ? `Missing setup/data: ${summary.missingInformation.join("; ")}.`
    : "Required setup checks are complete for this period.";
  const aiState = providerConfigured
    ? "The answer below is assembled from authorized Tax Assistant tools."
    : "AI provider setup is incomplete, so this deterministic answer uses the same authorized tax tools.";

  return [
    aiState,
    `For ${formatDate(summary.periodStart)} to ${formatDate(summary.periodEnd)}, recorded taxable sales are ${money(summary.figures.taxableSales, summary.currency)} and eligible input-VAT expenses are ${money(summary.figures.taxableExpenses, summary.currency)}.`,
    `Estimated output VAT is ${money(summary.figures.outputVatEstimate, summary.currency)}, eligible input VAT is ${money(summary.figures.eligibleInputVatEstimate, summary.currency)}, and net VAT estimate is ${money(summary.figures.netVatEstimate, summary.currency)}.`,
    `Recorded WHT deducted by customers is ${money(summary.figures.whtDeductedByCustomers, summary.currency)}; WHT is reported only from explicit recorded amounts or rates.`,
    setup,
    keyIssues.length ? `Top review items: ${keyIssues.join(" | ")}.` : "No open review items were generated from the selected period.",
    `Rule source: ${summary.source.sourceAuthority}, ${summary.source.ruleSetVersion}, status ${summary.source.ruleSetStatus}.`,
    `Question handled: "${question.slice(0, 240)}"`,
    taxAssistantDisclaimer,
  ].join("\n\n");
}

export function buildTaxAssistantContextSummary(summary: TaxAssistantSummary) {
  return {
    periodStart: summary.periodStart,
    periodEnd: summary.periodEnd,
    currency: summary.currency,
    figures: summary.figures,
    counts: summary.counts,
    missingInformation: summary.missingInformation,
    source: summary.source,
    formulas: summary.formulas,
    assumptions: summary.assumptions,
    disclaimer: summary.disclaimer,
  };
}

function uniqueTools(tools: TaxAssistantToolName[]) {
  return tools.filter((tool, index) => tools.indexOf(tool) === index);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}
