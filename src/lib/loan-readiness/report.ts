import {
  loanReadinessDisclaimer,
  loanReadinessFormulaVersion,
  type LoanReadinessCategory,
  type LoanReadinessCategoryId,
  type LoanReadinessEvidence,
  type LoanReadinessProfileDto,
  type LoanReadinessReport,
  type LoanReadinessStatus,
} from "@/lib/loan-readiness/definitions";

export type LoanReadinessFacts = {
  business: {
    id: string;
    name: string;
    currency: string;
    createdAt: Date;
    businessCategory?: string | null;
    businessType?: string | null;
    hasReceiptConfig: boolean;
    hasDocumentBranding: boolean;
  };
  location?: { id: string; name: string };
  generatedAt: Date;
  periodStart: Date;
  periodEnd: Date;
  profile: LoanReadinessProfileDto;
  transactions: Array<{
    id: string;
    type: string;
    amount: number;
    profit: number;
    occurredAt: Date;
    category?: string | null;
    receiptId?: string | null;
    customerId?: string | null;
    supplierId?: string | null;
    duplicateFingerprint?: string | null;
    reversed: boolean;
  }>;
  payments: Array<{ createdAt: Date }>;
  debts: Array<{
    type: string;
    amount: number;
    paidAmount: number;
    dueAt?: Date | null;
    createdAt: Date;
    customerId?: string | null;
  }>;
  bankRows: Array<{
    postedAt: Date;
    amount: number;
    status: string;
    duplicateStatus: string;
  }>;
  tax: {
    profileConfigured: boolean;
    snapshotDates: Date[];
    openReviewItems: Array<{ severity: string }>;
  };
  inventory: {
    itemCount: number;
    value: number;
    movementDates: Date[];
  };
  issuedDocumentDates: Date[];
};

const weights: Record<LoanReadinessCategoryId, number> = {
  business_profile: 8,
  bookkeeping_history: 10,
  sales_consistency: 8,
  expense_completeness: 8,
  profitability_evidence: 8,
  cash_movement: 8,
  bank_reconciliation: 10,
  customer_debt: 8,
  supplier_obligations: 7,
  tax_readiness: 8,
  inventory_evidence: 5,
  supporting_documents: 6,
  data_quality: 6,
};

export function buildLoanReadinessReport(facts: LoanReadinessFacts): LoanReadinessReport {
  const includedTransactions = facts.transactions.filter(
    (transaction) =>
      !transaction.reversed &&
      transaction.occurredAt >= facts.periodStart &&
      transaction.occurredAt < facts.periodEnd,
  );
  const sales = includedTransactions.filter((transaction) => normalize(transaction.type) === "sale");
  const expenses = includedTransactions.filter((transaction) => normalize(transaction.type) === "expense");
  const salesMonths = uniqueMonths(sales.map((transaction) => transaction.occurredAt));
  const expenseMonths = uniqueMonths(expenses.map((transaction) => transaction.occurredAt));
  const paymentDates = facts.payments.map((payment) => payment.createdAt);
  const bankDates = facts.bankRows.map((row) => row.postedAt);
  const activityMonths = uniqueMonths([
    ...includedTransactions.map((transaction) => transaction.occurredAt),
    ...paymentDates,
    ...facts.debts.map((debt) => debt.createdAt),
    ...bankDates,
    ...facts.tax.snapshotDates,
  ]);
  const cashMovementMonths = uniqueMonths([
    ...includedTransactions.map((transaction) => transaction.occurredAt),
    ...paymentDates,
    ...bankDates,
  ]);
  const operatingStart = facts.profile.operatingStartDate
    ? new Date(facts.profile.operatingStartDate)
    : facts.business.createdAt;
  const operatingDays = daysBetween(operatingStart, facts.generatedAt);
  const openCustomerDebts = facts.debts.filter(
    (debt) => normalize(debt.type) === "customer_owes_business",
  );
  const openSupplierDebts = facts.debts.filter(
    (debt) => normalize(debt.type) === "business_owes_supplier",
  );
  const openCustomerReceivables = sumRemaining(openCustomerDebts);
  const overdueCustomerReceivables = sumRemaining(
    openCustomerDebts.filter((debt) => debt.dueAt && debt.dueAt < facts.generatedAt),
  );
  const openSupplierObligations = sumRemaining(openSupplierDebts);
  const trailingRevenue = sum(sales.map((transaction) => transaction.amount));
  const topDebtorConcentrationPercent = debtorConcentration(openCustomerDebts);
  const bankCoveredRows = facts.bankRows.filter((row) =>
    ["matched", "confirmed", "ignored"].includes(normalize(row.status)),
  ).length;
  const unresolvedBankRows = facts.bankRows.filter((row) =>
    ["unmatched", "suggested"].includes(normalize(row.status)),
  );
  const openCriticalReviewItems = facts.tax.openReviewItems.filter(
    (item) => normalize(item.severity) === "critical",
  ).length;
  const missingCategories = includedTransactions.filter((transaction) => !transaction.category).length;
  const missingPartyLinks = includedTransactions.filter((transaction) => {
    const type = normalize(transaction.type);
    return (type === "sale" && !transaction.customerId) || (type === "expense" && !transaction.supplierId);
  }).length;
  const duplicateFingerprints = countDuplicates(
    includedTransactions.map((transaction) => transaction.duplicateFingerprint).filter(Boolean) as string[],
  );
  const reversalCount = facts.transactions.filter((transaction) => transaction.reversed).length;
  const evidence: LoanReadinessEvidence = {
    period: {
      start: facts.periodStart.toISOString(),
      end: facts.periodEnd.toISOString(),
      days: daysBetween(facts.periodStart, facts.periodEnd),
    },
    sourceCounts: {
      transactions: includedTransactions.length,
      payments: facts.payments.length,
      openDebts: facts.debts.length,
      bankRows: facts.bankRows.length,
      taxSnapshots: facts.tax.snapshotDates.length,
      inventoryItems: facts.inventory.itemCount,
      inventoryMovements: facts.inventory.movementDates.length,
      issuedDocuments: facts.issuedDocumentDates.length,
      checklistDocuments: facts.profile.documents.length,
    },
    activityMonths,
    salesMonths,
    expenseMonths,
    cashMovementMonths,
    bank: {
      totalRows: facts.bankRows.length,
      coveredRows: bankCoveredRows,
      unresolvedRows: unresolvedBankRows.length,
      unresolvedAmount: roundMoney(sum(unresolvedBankRows.map((row) => Math.abs(row.amount)))),
    },
    debt: {
      openCustomerReceivables: roundMoney(openCustomerReceivables),
      overdueCustomerReceivables: roundMoney(overdueCustomerReceivables),
      topDebtorConcentrationPercent,
      openSupplierObligations: roundMoney(openSupplierObligations),
    },
    tax: {
      profileConfigured: facts.tax.profileConfigured,
      snapshotCount: facts.tax.snapshotDates.length,
      openCriticalReviewItems,
      openReviewItems: facts.tax.openReviewItems.length,
    },
    dataQuality: {
      missingCategories,
      missingPartyLinks,
      duplicateFingerprints,
      reversalCount,
      unresolvedBankRows: unresolvedBankRows.length,
      openTaxReviewItems: facts.tax.openReviewItems.length,
    },
    limitations: buildLimitations({
      bankRows: facts.bankRows.length,
      taxConfigured: facts.tax.profileConfigured,
      transactionCount: includedTransactions.length,
      inventoryItems: facts.inventory.itemCount,
    }),
  };

  const categories = [
    profileCategory(facts),
    bookkeepingHistoryCategory(operatingDays, activityMonths.length),
    ratioCategory({
      id: "sales_consistency",
      label: "Sales consistency",
      formula: "LR_RECORDED_SALES_MONTHS_V1",
      numerator: salesMonths.length,
      denominator: Math.max(1, activityMonths.length),
      missing: sales.length === 0,
      explanation: `${salesMonths.length} active month(s) include recorded sales.`,
      evidence: [`${sales.length} non-reversed sales in the trailing window.`],
      action: "Record sales in each trading month to show a consistent operating pattern.",
    }),
    ratioCategory({
      id: "expense_completeness",
      label: "Expense completeness",
      formula: "LR_EXPENSE_COMPLETENESS_V1",
      numerator: expenseMonths.length,
      denominator: Math.max(1, activityMonths.length),
      missing: expenses.length === 0,
      explanation: `${expenseMonths.length} active month(s) include recorded expenses.`,
      evidence: [`${expenses.length} non-reversed expenses in the trailing window.`],
      action: "Record operating expenses every month, including cash expenses.",
    }),
    profitabilityCategory(sales, expenses),
    ratioCategory({
      id: "cash_movement",
      label: "Cash-movement evidence",
      formula: "LR_CASH_MOVEMENT_V1",
      numerator: cashMovementMonths.length,
      denominator: Math.max(1, activityMonths.length),
      missing: cashMovementMonths.length === 0,
      explanation: `${cashMovementMonths.length} active month(s) include payments, bank rows, or money records.`,
      evidence: [`${facts.payments.length} payment rows and ${facts.bankRows.length} bank rows were available.`],
      action: "Record payment methods or import bank statements for each active month.",
    }),
    bankCategory(facts.bankRows.length, bankCoveredRows, unresolvedBankRows.length),
    customerDebtCategory(openCustomerReceivables, overdueCustomerReceivables, topDebtorConcentrationPercent),
    supplierObligationCategory(openSupplierObligations, trailingRevenue),
    taxCategory(facts.tax.profileConfigured, facts.tax.snapshotDates.length, facts.tax.openReviewItems.length, openCriticalReviewItems),
    inventoryCategory(facts.inventory.itemCount, facts.inventory.value, facts.inventory.movementDates, activityMonths.length),
    documentsCategory(includedTransactions, facts.issuedDocumentDates.length, facts.profile),
    dataQualityCategory(evidence),
  ];

  const activeCategories = categories.filter((category) => category.status !== "Not applicable");
  const activeWeight = sum(activeCategories.map((category) => category.weight));
  let percentage = activeWeight > 0
    ? Math.round(sum(activeCategories.map((category) => category.weightedPoints)) * (100 / activeWeight))
    : 0;

  const criticalMissing = categories.some(
    (category) =>
      ["business_profile", "bookkeeping_history", "tax_readiness", "data_quality"].includes(category.id) &&
      category.status === "Missing data",
  );
  const insufficientHistory = categories.some(
    (category) => category.id === "bookkeeping_history" && category.status === "Insufficient history",
  );
  const bankCoverage = facts.bankRows.length > 0 ? bankCoveredRows / facts.bankRows.length : 0;

  if (criticalMissing) percentage = Math.min(percentage, 60);
  if (insufficientHistory) percentage = Math.min(percentage, 70);
  if (facts.bankRows.length > 0 && bankCoverage < 0.25) percentage = Math.min(percentage, 80);

  const overallStatus: LoanReadinessStatus = criticalMissing
    ? "Missing data"
    : insufficientHistory
      ? "Insufficient history"
      : percentage >= 75 && categories.every((category) => !["Missing data", "Needs attention"].includes(category.status))
        ? "Ready"
        : "Needs attention";
  const recommendations = categories
    .filter((category) => ["Missing data", "Needs attention", "Insufficient history"].includes(category.status))
    .flatMap((category) => category.actions)
    .slice(0, 6);

  return {
    business: {
      id: facts.business.id,
      name: facts.business.name,
      currency: facts.business.currency,
    },
    location: {
      id: facts.location?.id ?? null,
      name: facts.location?.name ?? "All locations",
    },
    formulaVersion: loanReadinessFormulaVersion,
    generatedAt: facts.generatedAt.toISOString(),
    expiresAt: addDays(facts.generatedAt, 30).toISOString(),
    percentage,
    overallStatus,
    categories,
    evidence,
    recommendations,
    profile: facts.profile,
    disclaimer: loanReadinessDisclaimer,
  };
}

function profileCategory(facts: LoanReadinessFacts): LoanReadinessCategory {
  const industry = facts.profile.industry || facts.business.businessCategory || facts.business.businessType;
  const fields = [
    Boolean(facts.business.name),
    Boolean(industry),
    Boolean(facts.profile.operatingStartDate),
    Boolean(facts.profile.preferredCurrency),
    facts.business.hasReceiptConfig || facts.business.hasDocumentBranding,
  ];
  const complete = fields.filter(Boolean).length;
  const percentage = Math.round((complete / fields.length) * 100);

  return category({
    id: "business_profile",
    label: "Business profile completeness",
    formula: "LR_PROFILE_COMPLETENESS_V1",
    percentage,
    status: percentage >= 80 ? "Ready" : percentage >= 60 ? "Needs attention" : "Missing data",
    explanation: `${complete} of ${fields.length} core business profile fields are available.`,
    evidence: [industry ? `Industry: ${industry}.` : "Industry is not recorded."],
    actions: percentage >= 80 ? [] : ["Complete the industry, operating start date, and business identity fields."],
    metrics: { completedFields: complete, requiredFields: fields.length },
  });
}

function bookkeepingHistoryCategory(operatingDays: number, activityMonths: number): LoanReadinessCategory {
  const percentage = Math.round(Math.min(1, activityMonths / 6) * 70 + Math.min(1, operatingDays / 180) * 30);
  const status: LoanReadinessStatus = activityMonths === 0
    ? "Missing data"
    : operatingDays < 90 || activityMonths < 3
      ? "Insufficient history"
      : percentage >= 75
        ? "Ready"
        : "Needs attention";

  return category({
    id: "bookkeeping_history",
    label: "Bookkeeping history",
    formula: "LR_OPERATING_HISTORY_MONTHS_V1",
    percentage,
    status,
    explanation: `${activityMonths} month(s) of recorded activity are available across ${operatingDays} operating day(s).`,
    evidence: [`The canonical review window is the trailing 180 days.`],
    actions: status === "Ready" ? [] : ["Keep complete monthly records until at least 90 days and three active months are available."],
    metrics: { operatingDays, activityMonths },
  });
}

function profitabilityCategory(
  sales: LoanReadinessFacts["transactions"],
  expenses: LoanReadinessFacts["transactions"],
): LoanReadinessCategory {
  const monthTotals = new Map<string, { salesProfit: number; expenses: number; hasSales: boolean; hasExpenses: boolean }>();
  for (const transaction of [...sales, ...expenses]) {
    const month = monthKey(transaction.occurredAt);
    const current = monthTotals.get(month) ?? { salesProfit: 0, expenses: 0, hasSales: false, hasExpenses: false };
    if (normalize(transaction.type) === "sale") {
      current.salesProfit += transaction.profit;
      current.hasSales = true;
    } else {
      current.expenses += transaction.amount;
      current.hasExpenses = true;
    }
    monthTotals.set(month, current);
  }
  const comparable = [...monthTotals.values()].filter((month) => month.hasSales && month.hasExpenses);
  const nonNegative = comparable.filter((month) => month.salesProfit - month.expenses >= 0).length;
  const percentage = comparable.length > 0 ? Math.round((nonNegative / comparable.length) * 100) : 0;

  return category({
    id: "profitability_evidence",
    label: "Profitability evidence",
    formula: "LR_PROFIT_EVIDENCE_V1",
    percentage,
    status: comparable.length === 0 ? "Missing data" : percentage >= 67 ? "Ready" : "Needs attention",
    explanation: `${nonNegative} of ${comparable.length} comparable month(s) show non-negative recorded profit.`,
    evidence: ["Only months with both sales and expense evidence are compared."],
    actions: comparable.length > 0 && percentage >= 67 ? [] : ["Record sales costs and operating expenses consistently so monthly profit can be inspected."],
    metrics: { comparableMonths: comparable.length, nonNegativeMonths: nonNegative },
  });
}

function bankCategory(total: number, covered: number, unresolved: number): LoanReadinessCategory {
  const percentage = total > 0 ? Math.round((covered / total) * 100) : 0;
  return category({
    id: "bank_reconciliation",
    label: "Bank reconciliation coverage",
    formula: "LR_BANK_RECON_COVERAGE_V1 / LR_BANK_UNRESOLVED_V1",
    percentage,
    status: total === 0 ? "Missing data" : percentage >= 80 ? "Ready" : "Needs attention",
    explanation: total === 0 ? "No imported bank rows are available." : `${covered} of ${total} imported bank rows are matched or ignored.`,
    evidence: [`${unresolved} bank row(s) remain unmatched or suggested.`],
    actions: percentage >= 80 ? [] : ["Import current statements and review unmatched or suggested bank rows."],
    metrics: { totalRows: total, coveredRows: covered, unresolvedRows: unresolved },
  });
}

function customerDebtCategory(open: number, overdue: number, concentration: number): LoanReadinessCategory {
  const overdueRatio = open > 0 ? overdue / open : 0;
  const percentage = open === 0
    ? 100
    : Math.round(Math.max(0, 100 - overdueRatio * 70 - Math.max(0, concentration - 40) * 0.5));
  return category({
    id: "customer_debt",
    label: "Customer-debt position",
    formula: "LR_CUSTOMER_DEBT_V1",
    percentage,
    status: percentage >= 75 ? "Ready" : "Needs attention",
    explanation: open === 0 ? "No open customer receivables are recorded." : `${Math.round(overdueRatio * 100)}% of open customer receivables are overdue.`,
    evidence: [`Top debtor concentration is ${concentration}%.`],
    actions: percentage >= 75 ? [] : ["Collect overdue receivables and reduce reliance on one large debtor."],
    metrics: { openReceivables: roundMoney(open), overdueReceivables: roundMoney(overdue), concentrationPercent: concentration },
  });
}

function supplierObligationCategory(open: number, revenue: number): LoanReadinessCategory {
  const ratio = revenue > 0 ? open / revenue : open > 0 ? 1 : 0;
  const percentage = open === 0 ? 100 : Math.round(Math.max(0, 100 - Math.min(1, ratio) * 100));
  return category({
    id: "supplier_obligations",
    label: "Supplier-obligation position",
    formula: "LR_SUPPLIER_OBLIGATION_V1",
    percentage,
    status: open > 0 && revenue <= 0 ? "Missing data" : percentage >= 70 ? "Ready" : "Needs attention",
    explanation: open === 0 ? "No open supplier obligations are recorded." : `Open supplier obligations are ${Math.round(ratio * 100)}% of trailing recorded revenue.`,
    evidence: [`Recorded supplier obligations total ${roundMoney(open)}.`],
    actions: percentage >= 70 ? [] : ["Review and settle overdue supplier obligations before sharing a readiness report."],
    metrics: { openSupplierObligations: roundMoney(open), trailingRevenue: roundMoney(revenue), ratioPercent: Math.round(ratio * 100) },
  });
}

function taxCategory(configured: boolean, snapshots: number, openItems: number, critical: number): LoanReadinessCategory {
  const percentage = configured ? Math.max(0, 70 + (snapshots > 0 ? 30 : 0) - Math.min(60, critical * 30 + (openItems - critical) * 5)) : 0;
  return category({
    id: "tax_readiness",
    label: "Tax-data readiness",
    formula: "LR_TAX_DATA_READINESS_V1",
    percentage,
    status: !configured ? "Missing data" : percentage >= 75 ? "Ready" : "Needs attention",
    explanation: configured ? `${snapshots} tax period snapshot(s) and ${openItems} open review item(s) are available.` : "A business tax profile is not configured.",
    evidence: [`${critical} open tax review item(s) are marked critical.`],
    actions: configured && percentage >= 75 ? [] : ["Complete tax setup and resolve critical tax review items."],
    metrics: { profileConfigured: configured, snapshotCount: snapshots, openReviewItems: openItems, openCriticalReviewItems: critical },
  });
}

function inventoryCategory(itemCount: number, value: number, movementDates: Date[], activityMonthCount: number): LoanReadinessCategory {
  if (itemCount === 0) {
    return category({
      id: "inventory_evidence",
      label: "Inventory evidence",
      formula: "LR_INVENTORY_EVIDENCE_V1",
      percentage: null,
      status: "Not applicable",
      explanation: "No active stock items are recorded; this may be appropriate for a service business.",
      evidence: [],
      actions: [],
      metrics: { itemCount: 0, inventoryValue: 0, movementMonths: 0 },
    });
  }

  const movementMonths = uniqueMonths(movementDates).length;
  const percentage = Math.round((movementMonths / Math.max(1, activityMonthCount)) * 100);
  return category({
    id: "inventory_evidence",
    label: "Inventory evidence",
    formula: "LR_INVENTORY_EVIDENCE_V1",
    percentage: Math.min(100, percentage),
    status: percentage >= 60 ? "Ready" : "Needs attention",
    explanation: `${movementMonths} active month(s) contain stock movement evidence.`,
    evidence: [`${itemCount} active item(s) with recorded value ${roundMoney(value)}.`],
    actions: percentage >= 60 ? [] : ["Record stock receipts, sales, transfers, and adjustments consistently."],
    metrics: { itemCount, inventoryValue: roundMoney(value), movementMonths },
  });
}

function documentsCategory(
  transactions: LoanReadinessFacts["transactions"],
  issuedDocumentCount: number,
  profile: LoanReadinessProfileDto,
): LoanReadinessCategory {
  const attachedReceipts = transactions.filter((transaction) => transaction.receiptId).length;
  const evidencedTransactions = Math.min(transactions.length, attachedReceipts + issuedDocumentCount);
  const transactionCoverage = transactions.length > 0 ? evidencedTransactions / transactions.length : 0;
  const availableChecklist = profile.documents.filter((document) => document.status === "AVAILABLE").length;
  const checklistCoverage = profile.documents.length > 0 ? availableChecklist / profile.documents.length : 0;
  const percentage = Math.round(((transactionCoverage * 0.7) + (checklistCoverage * 0.3)) * 100);
  return category({
    id: "supporting_documents",
    label: "Supporting-document coverage",
    formula: "LR_DOCUMENT_COVERAGE_V1",
    percentage,
    status: transactions.length === 0 ? "Missing data" : percentage >= 70 ? "Ready" : "Needs attention",
    explanation: `${evidencedTransactions} of ${transactions.length} included transaction(s) have receipt or issued-document evidence.`,
    evidence: [`${availableChecklist} of ${profile.documents.length} checklist document(s) are marked available.`],
    actions: percentage >= 70 ? [] : ["Attach receipts and maintain current registration, bank, tax, and financial document references."],
    metrics: { attachedReceipts, issuedDocumentCount, availableChecklistDocuments: availableChecklist },
  });
}

function dataQualityCategory(evidence: LoanReadinessEvidence): LoanReadinessCategory {
  const transactionCount = evidence.sourceCounts.transactions;
  const issues = evidence.dataQuality.missingCategories + evidence.dataQuality.missingPartyLinks +
    evidence.dataQuality.duplicateFingerprints + evidence.dataQuality.reversalCount +
    evidence.dataQuality.unresolvedBankRows + evidence.dataQuality.openTaxReviewItems;
  const denominator = Math.max(1, transactionCount + evidence.sourceCounts.bankRows + evidence.dataQuality.openTaxReviewItems);
  const percentage = Math.round(Math.max(0, 100 - (issues / denominator) * 100));
  return category({
    id: "data_quality",
    label: "Data quality and unresolved issues",
    formula: "LR_DATA_QUALITY_V1",
    percentage,
    status: transactionCount === 0 ? "Missing data" : percentage >= 80 ? "Ready" : "Needs attention",
    explanation: transactionCount === 0 ? "No transaction history is available for quality checks." : `${issues} record-quality or unresolved issue(s) were found.`,
    evidence: [
      `${evidence.dataQuality.missingCategories} missing categories; ${evidence.dataQuality.missingPartyLinks} missing party links.`,
      `${evidence.dataQuality.unresolvedBankRows} unresolved bank rows; ${evidence.dataQuality.openTaxReviewItems} open tax review items.`,
    ],
    actions: percentage >= 80 ? [] : ["Resolve missing categories, party links, bank items, duplicates, and tax review items."],
    metrics: evidence.dataQuality,
  });
}

function ratioCategory({
  id,
  label,
  formula,
  numerator,
  denominator,
  missing,
  explanation,
  evidence,
  action,
}: {
  id: LoanReadinessCategoryId;
  label: string;
  formula: string;
  numerator: number;
  denominator: number;
  missing: boolean;
  explanation: string;
  evidence: string[];
  action: string;
}) {
  const percentage = Math.round(Math.min(1, numerator / denominator) * 100);
  return category({
    id,
    label,
    formula,
    percentage,
    status: missing ? "Missing data" : percentage >= 70 ? "Ready" : "Needs attention",
    explanation,
    evidence,
    actions: percentage >= 70 && !missing ? [] : [action],
    metrics: { numerator, denominator },
  });
}

function category(input: Omit<LoanReadinessCategory, "weight" | "weightedPoints">): LoanReadinessCategory {
  const weight = weights[input.id];
  return {
    ...input,
    weight,
    weightedPoints: input.percentage === null ? 0 : round((input.percentage / 100) * weight, 2),
  };
}

function uniqueMonths(dates: Date[]) {
  return [...new Set(dates.map(monthKey))].sort();
}

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function debtorConcentration(debts: LoanReadinessFacts["debts"]) {
  const totals = new Map<string, number>();
  for (const debt of debts) {
    const key = debt.customerId || "unlinked";
    totals.set(key, (totals.get(key) ?? 0) + remaining(debt));
  }
  const total = sum([...totals.values()]);
  return total > 0 ? Math.round((Math.max(0, ...totals.values()) / total) * 100) : 0;
}

function sumRemaining(debts: LoanReadinessFacts["debts"]) {
  return sum(debts.map(remaining));
}

function remaining(debt: LoanReadinessFacts["debts"][number]) {
  return Math.max(0, debt.amount - debt.paidAmount);
}

function countDuplicates(values: string[]) {
  const seen = new Set<string>();
  let duplicates = 0;
  for (const value of values) {
    if (seen.has(value)) duplicates += 1;
    seen.add(value);
  }
  return duplicates;
}

function buildLimitations({
  bankRows,
  taxConfigured,
  transactionCount,
  inventoryItems,
}: {
  bankRows: number;
  taxConfigured: boolean;
  transactionCount: number;
  inventoryItems: number;
}) {
  const limitations = [
    "Account balances are app records and are not independently verified bank balances.",
    "The report uses only records held in this business workspace and does not query a credit bureau.",
  ];
  if (bankRows === 0) limitations.push("No imported bank statement rows were available for reconciliation coverage.");
  if (!taxConfigured) limitations.push("A verified business tax profile was not available.");
  if (transactionCount === 0) limitations.push("No non-reversed transactions were available in the trailing window.");
  if (inventoryItems === 0) limitations.push("Inventory evidence is marked not applicable because no active stock items are recorded.");
  return limitations;
}

function normalize(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function daysBetween(start: Date, end: Date) {
  return Math.max(0, Math.ceil((end.getTime() - start.getTime()) / 86_400_000));
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

function roundMoney(value: number) {
  return round(value, 2);
}

function round(value: number, places: number) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
