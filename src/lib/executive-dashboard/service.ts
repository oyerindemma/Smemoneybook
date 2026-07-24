import {
  DebtStatus,
  DebtType,
  Prisma,
  StockTransferStatus,
  TransactionType,
} from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { getStaffPerformanceSummary } from "@/lib/staff-performance/service";
import { staffPerformanceDisclaimer } from "@/lib/staff-performance/definitions";
import { calculateTaxAssistantForBusiness } from "@/lib/tax-assistant/service";
import {
  executiveDashboardMetricVersion,
  type ExecutiveDashboardAttentionItem,
  type ExecutiveDashboardBreakdown,
  type ExecutiveDashboardDataQualityStatus,
  type ExecutiveDashboardDrilldown,
  type ExecutiveDashboardDrilldownType,
  type ExecutiveDashboardMetric,
  type ExecutiveDashboardPeriod,
  type ExecutiveDashboardPeriodPreset,
  type ExecutiveDashboardSummary,
} from "@/lib/executive-dashboard/definitions";
import {
  ageingBandLabel,
  metric,
  roundMoney,
  roundPercent,
  statusFromCounts,
  worstStatus,
} from "@/lib/executive-dashboard/data-quality";

const maxCustomRangeDays = 366;
const drilldownLimit = 50;

type DecimalLike = Prisma.Decimal | number | string | { toString(): string };

export type ExecutiveDashboardPeriodInput = {
  preset?: ExecutiveDashboardPeriodPreset | string | null;
  from?: string | null;
  to?: string | null;
  now?: Date;
};

export type ExecutiveDashboardQuery = {
  businessId: string;
  locationId?: string;
  period: ResolvedExecutiveDashboardPeriod;
  includeStaffSummary?: boolean;
  generatedAt?: Date;
};

export type ResolvedExecutiveDashboardPeriod = {
  period: ExecutiveDashboardPeriod;
  comparisonPeriod: ExecutiveDashboardPeriod;
  periodStart: Date;
  periodEnd: Date;
  comparisonStart: Date;
  comparisonEnd: Date;
};

export type ExecutiveDashboardCalculationInput = {
  business: {
    id: string;
    name: string;
    currency: string;
  };
  location?: {
    id: string | null;
    name: string;
  };
  period: ExecutiveDashboardPeriod;
  comparisonPeriod: ExecutiveDashboardPeriod;
  generatedAt: Date;
  transactions: Array<{
    id: string;
    type: string;
    amount: DecimalLike;
    profit: DecimalLike;
    costOfGoods: DecimalLike;
    description: string;
    category?: string | null;
    paymentStatus?: string | null;
    occurredAt: Date | string;
    locationId?: string | null;
    customerId?: string | null;
    supplierId?: string | null;
    inventoryItemId?: string | null;
    inventoryItemName?: string | null;
    reversed?: boolean;
    isReversal?: boolean;
  }>;
  debts: Array<{
    id: string;
    type: string;
    amount: DecimalLike;
    paidAmount: DecimalLike;
    status: string;
    dueAt?: Date | string | null;
    createdAt: Date | string;
    partyName?: string | null;
  }>;
  inventoryItems: Array<{
    id: string;
    name: string;
    quantityOnHand: DecimalLike;
    lowStockLevel: DecimalLike;
    costPrice: DecimalLike;
    sellingPrice: DecimalLike;
  }>;
  locations: Array<{ id: string; name: string }>;
  pendingTransfers: number;
  bankRows: Array<{
    id: string;
    amount: DecimalLike;
    status: string;
    duplicateStatus: string;
    postedAt: Date | string;
    importedAt?: Date | string | null;
  }>;
  staffSummary?: {
    summaryCards: {
      attributedSalesAmount: number;
      activeStaff: number;
      unattributedRecords: number;
    };
    totals: {
      salesTransactions: number;
      expensesRecorded: number;
      stockInOperations: number;
      stockOutOperations: number;
      warehouseTransferActions: number;
      debtCollectionsRecorded: number;
      supplierSettlementsRecorded: number;
      reversalsCorrections: number;
    };
    rows: Array<{
      staff: { userId: string; name: string; role: string };
      metrics: { lastRecordedActivity: string | null };
    }>;
    dataQualityNotes: string[];
  } | null;
  staffRestricted?: boolean;
  taxSummary?: {
    figures: {
      netVatEstimate: number;
      whtDeductedByCustomers: number;
      whtDeductedFromSuppliers: number;
      dataCompletenessRate: number;
    };
    counts: {
      reviewItemCount: number;
    };
    source: {
      ruleSetVersion: string;
      ruleSetStatus: string;
    };
    missingInformation: string[];
    reviewItems: Array<{ issueType: string; severity: string; explanation: string; amount?: number }>;
  } | null;
  taxError?: string | null;
};

export async function getExecutiveDashboardSummary({
  businessId,
  locationId,
  period,
  includeStaffSummary = true,
  generatedAt = new Date(),
}: ExecutiveDashboardQuery): Promise<ExecutiveDashboardSummary> {
  const prisma = getPrisma();
  const windowStart = period.comparisonStart;
  const windowEnd = period.periodEnd;
  const locationFilter = locationId ? { locationId } : {};
  const [
    business,
    location,
    transactions,
    debts,
    inventoryItems,
    locations,
    pendingTransfers,
    bankRows,
    taxResult,
    staffResult,
  ] = await Promise.all([
    prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { id: true, name: true, currency: true },
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
        occurredAt: { gte: windowStart, lt: windowEnd },
        type: { in: [TransactionType.SALE, TransactionType.EXPENSE] },
        ...locationFilter,
      },
      orderBy: { occurredAt: "asc" },
      take: 10_000,
      select: {
        id: true,
        type: true,
        amount: true,
        profit: true,
        costOfGoods: true,
        description: true,
        category: true,
        paymentStatus: true,
        occurredAt: true,
        locationId: true,
        customerId: true,
        supplierId: true,
        inventoryItemId: true,
        reversesTransactionId: true,
        reversalTransaction: { select: { id: true } },
        inventoryItem: { select: { name: true } },
      },
    }),
    prisma.debt.findMany({
      where: {
        businessId,
        status: DebtStatus.OPEN,
        ...(locationId ? { sourceTransaction: { locationId } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 2_000,
      select: {
        id: true,
        type: true,
        amount: true,
        paidAmount: true,
        status: true,
        dueAt: true,
        createdAt: true,
        customer: { select: { name: true } },
        supplier: { select: { name: true } },
      },
    }),
    prisma.inventoryItem.findMany({
      where: {
        businessId,
        archivedAt: null,
        ...(locationId ? { locationBalances: { some: { locationId } } } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: 2_000,
      select: {
        id: true,
        name: true,
        quantityOnHandDecimal: true,
        lowStockLevelDecimal: true,
        costPrice: true,
        sellingPrice: true,
        locationBalances: {
          ...(locationId ? { where: { locationId } } : {}),
          take: 1,
          select: {
            quantityOnHandDecimal: true,
            lowStockLevelDecimal: true,
          },
        },
      },
    }),
    prisma.businessLocation.findMany({
      where: { businessId, archivedAt: null },
      select: { id: true, name: true },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      take: 100,
    }),
    prisma.stockTransfer.count({
      where: {
        businessId,
        status: { in: [StockTransferStatus.DRAFT, StockTransferStatus.APPROVED, StockTransferStatus.IN_TRANSIT, StockTransferStatus.PARTIALLY_RECEIVED] },
        ...(locationId ? { OR: [{ sourceLocationId: locationId }, { destinationLocationId: locationId }] } : {}),
      },
    }),
    prisma.bankStatementImportRow.findMany({
      where: {
        businessId,
        postedAt: { gte: windowStart, lt: windowEnd },
        ...(locationId ? { statementImport: { locationId } } : {}),
      },
      orderBy: { postedAt: "asc" },
      take: 10_000,
      select: {
        id: true,
        amount: true,
        status: true,
        duplicateStatus: true,
        postedAt: true,
        statementImport: {
          select: {
            importedAt: true,
          },
        },
      },
    }),
    calculateTaxAssistantForBusiness({
      businessId,
      locationId,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      now: generatedAt,
    })
      .then((summary) => ({ summary, error: null as string | null }))
      .catch((error) => ({
        summary: null,
        error: error instanceof Error ? error.message : "Tax readiness is unavailable.",
      })),
    includeStaffSummary
      ? getStaffPerformanceSummary({
          businessId,
          locationId,
          generatedAt,
          period: {
            preset: period.period.preset === "custom" ? "custom" : "custom",
            label: period.period.label,
            periodStart: period.periodStart,
            periodEnd: period.periodEnd,
          },
        })
          .then((summary) => ({ summary, error: null as string | null }))
          .catch((error) => ({
            summary: null,
            error: error instanceof Error ? error.message : "Staff summary is unavailable.",
          }))
      : Promise.resolve({ summary: null, error: null }),
  ]);

  return calculateExecutiveDashboard({
    business,
    location: location ? { id: location.id, name: location.name } : { id: null, name: "All locations" },
    period: period.period,
    comparisonPeriod: period.comparisonPeriod,
    generatedAt,
    transactions: transactions.map((transaction) => ({
      id: transaction.id,
      type: transaction.type.toString(),
      amount: transaction.amount,
      profit: transaction.profit,
      costOfGoods: transaction.costOfGoods,
      description: transaction.description,
      category: transaction.category,
      paymentStatus: transaction.paymentStatus.toString(),
      occurredAt: transaction.occurredAt,
      locationId: transaction.locationId,
      customerId: transaction.customerId,
      supplierId: transaction.supplierId,
      inventoryItemId: transaction.inventoryItemId,
      inventoryItemName: transaction.inventoryItem?.name,
      reversed: Boolean(transaction.reversalTransaction),
      isReversal: Boolean(transaction.reversesTransactionId),
    })),
    debts: debts.map((debt) => ({
      id: debt.id,
      type: debt.type.toString(),
      amount: debt.amount,
      paidAmount: debt.paidAmount,
      status: debt.status.toString(),
      dueAt: debt.dueAt,
      createdAt: debt.createdAt,
      partyName: debt.customer?.name ?? debt.supplier?.name,
    })),
    inventoryItems: inventoryItems.map((item) => {
      const balance = item.locationBalances[0];
      return {
        id: item.id,
        name: item.name,
        quantityOnHand: balance?.quantityOnHandDecimal ?? item.quantityOnHandDecimal,
        lowStockLevel: balance?.lowStockLevelDecimal ?? item.lowStockLevelDecimal,
        costPrice: item.costPrice,
        sellingPrice: item.sellingPrice,
      };
    }),
    locations,
    pendingTransfers,
    bankRows: bankRows.map((row) => ({
      id: row.id,
      amount: row.amount,
      status: row.status,
      duplicateStatus: row.duplicateStatus,
      postedAt: row.postedAt,
      importedAt: row.statementImport.importedAt,
    })),
    taxSummary: taxResult.summary,
    taxError: taxResult.error,
    staffSummary: staffResult.summary,
    staffRestricted: !includeStaffSummary,
  });
}

export function calculateExecutiveDashboard(input: ExecutiveDashboardCalculationInput): ExecutiveDashboardSummary {
  const businessId = input.business.id;
  const generatedAt = input.generatedAt.toISOString();
  const activeTransactions = input.transactions.filter((transaction) => !transaction.reversed && !transaction.isReversal);
  const currentTransactions = activeTransactions.filter((transaction) => inPeriod(transaction.occurredAt, input.period));
  const comparisonTransactions = activeTransactions.filter((transaction) => inPeriod(transaction.occurredAt, input.comparisonPeriod));
  const currentSales = currentTransactions.filter((transaction) => normalize(transaction.type) === "sale");
  const comparisonSales = comparisonTransactions.filter((transaction) => normalize(transaction.type) === "sale");
  const currentExpenses = currentTransactions.filter((transaction) => normalize(transaction.type) === "expense");
  const comparisonExpenses = comparisonTransactions.filter((transaction) => normalize(transaction.type) === "expense");
  const saleTotal = sum(currentSales.map((transaction) => transaction.amount));
  const comparisonSaleTotal = sum(comparisonSales.map((transaction) => transaction.amount));
  const paidSales = sum(currentSales.filter((transaction) => normalize(transaction.paymentStatus) === "paid").map((transaction) => transaction.amount));
  const comparisonPaidSales = sum(comparisonSales.filter((transaction) => normalize(transaction.paymentStatus) === "paid").map((transaction) => transaction.amount));
  const creditSales = sum(currentSales.filter((transaction) => normalize(transaction.paymentStatus) !== "paid").map((transaction) => transaction.amount));
  const comparisonCreditSales = sum(comparisonSales.filter((transaction) => normalize(transaction.paymentStatus) !== "paid").map((transaction) => transaction.amount));
  const expenseTotal = sum(currentExpenses.map((transaction) => transaction.amount));
  const comparisonExpenseTotal = sum(comparisonExpenses.map((transaction) => transaction.amount));
  const grossProfit = sum(currentSales.map((transaction) => transaction.profit));
  const comparisonGrossProfit = sum(comparisonSales.map((transaction) => transaction.profit));
  const netResult = grossProfit.minus(expenseTotal);
  const comparisonNetResult = comparisonGrossProfit.minus(comparisonExpenseTotal);
  const margin = saleTotal.gt(0) ? grossProfit.div(saleTotal).mul(100) : new Prisma.Decimal(0);
  const comparisonMargin = comparisonSaleTotal.gt(0) ? comparisonGrossProfit.div(comparisonSaleTotal).mul(100) : new Prisma.Decimal(0);
  const uncategorizedTransactions = currentTransactions.filter((transaction) => !transaction.category).length;
  const salesMissingCustomer = currentSales.filter((transaction) => !transaction.customerId).length;
  const expensesMissingSupplier = currentExpenses.filter((transaction) => !transaction.supplierId).length;
  const transactionQuality = statusFromCounts({
    total: currentTransactions.length,
    incomplete: uncategorizedTransactions + salesMissingCustomer + expensesMissingSupplier,
  });
  const currentBankRows = input.bankRows.filter((row) => inPeriod(row.postedAt, input.period));
  const comparisonBankRows = input.bankRows.filter((row) => inPeriod(row.postedAt, input.comparisonPeriod));
  const matchedBankRows = currentBankRows.filter((row) => row.status === "MATCHED");
  const unmatchedBankRows = currentBankRows.filter((row) => ["UNMATCHED", "SUGGESTED"].includes(row.status));
  const duplicateBankRows = currentBankRows.filter((row) => row.status === "DUPLICATE" || row.duplicateStatus !== "UNIQUE");
  const bankImportedAmount = sumAbs(currentBankRows.map((row) => row.amount));
  const bankMatchedAmount = sumAbs(matchedBankRows.map((row) => row.amount));
  const bankUnmatchedAmount = sumAbs(unmatchedBankRows.map((row) => row.amount));
  const bankDuplicateAmount = sumAbs(duplicateBankRows.map((row) => row.amount));
  const comparisonBankImportedAmount = sumAbs(comparisonBankRows.map((row) => row.amount));
  const comparisonBankMatchedAmount = sumAbs(comparisonBankRows.filter((row) => row.status === "MATCHED").map((row) => row.amount));
  const reconciliationRate = bankImportedAmount.gt(0) ? bankMatchedAmount.div(bankImportedAmount).mul(100) : new Prisma.Decimal(0);
  const comparisonReconciliationRate = comparisonBankImportedAmount.gt(0)
    ? comparisonBankMatchedAmount.div(comparisonBankImportedAmount).mul(100)
    : new Prisma.Decimal(0);
  const customerDebts = input.debts.filter((debt) => normalize(debt.type) === "customer_owes_business" && normalize(debt.status) === "open");
  const supplierDebts = input.debts.filter((debt) => normalize(debt.type) === "business_owes_supplier" && normalize(debt.status) === "open");
  const customerDebtTotal = sum(customerDebts.map(remainingDebt));
  const supplierDebtTotal = sum(supplierDebts.map(remainingDebt));
  const overdueCustomerDebt = sum(customerDebts.filter((debt) => isOverdue(debt, input.generatedAt)).map(remainingDebt));
  const overdueSupplierDebt = sum(supplierDebts.filter((debt) => isOverdue(debt, input.generatedAt)).map(remainingDebt));
  const comparisonCustomerDebt = sum(customerDebts.filter((debt) => new Date(debt.createdAt) < new Date(input.period.start)).map(remainingDebt));
  const stockCostValue = sum(input.inventoryItems.map((item) => dec(item.quantityOnHand).mul(dec(item.costPrice))));
  const potentialRevenue = sum(input.inventoryItems.map((item) => dec(item.quantityOnHand).mul(dec(item.sellingPrice))));
  const potentialProfit = potentialRevenue.minus(stockCostValue);
  const lowStockItems = input.inventoryItems.filter((item) => dec(item.quantityOnHand).lte(dec(item.lowStockLevel)));
  const stockWithMissingCost = input.inventoryItems.filter((item) => dec(item.costPrice).lte(0) && dec(item.quantityOnHand).gt(0)).length;
  const soldItemIds = new Set(currentSales.map((transaction) => transaction.inventoryItemId).filter(Boolean));
  const slowMovingItems = input.inventoryItems
    .filter((item) => dec(item.quantityOnHand).gt(0) && !soldItemIds.has(item.id))
    .map((item) => ({
      label: item.name,
      value: money(dec(item.quantityOnHand).mul(dec(item.costPrice))),
      count: Number(dec(item.quantityOnHand).toFixed(0)),
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
  const largestStockItemValue = Math.max(
    0,
    ...input.inventoryItems.map((item) => money(dec(item.quantityOnHand).mul(dec(item.costPrice)))),
  );
  const stockConcentration = stockCostValue.gt(0)
    ? new Prisma.Decimal(largestStockItemValue)
        .div(stockCostValue)
        .mul(100)
    : new Prisma.Decimal(0);
  const staffSummary = input.staffSummary;
  const staffNotes = input.staffRestricted
    ? ["Staff summary requires executive_dashboard:view_staff_summary permission."]
    : staffSummary?.dataQualityNotes ?? [];
  const staffActivityCount = staffSummary
    ? staffSummary.totals.salesTransactions +
      staffSummary.totals.expensesRecorded +
      staffSummary.totals.stockInOperations +
      staffSummary.totals.stockOutOperations +
      staffSummary.totals.warehouseTransferActions +
      staffSummary.totals.debtCollectionsRecorded +
      staffSummary.totals.supplierSettlementsRecorded +
      staffSummary.totals.reversalsCorrections
    : 0;
  const taxSummary = input.taxSummary;
  const taxSetupRequired = Boolean(input.taxError || taxSummary?.missingInformation.length);
  const taxQuality: ExecutiveDashboardDataQualityStatus = taxSummary
    ? taxSetupRequired
      ? "setup_required"
      : taxSummary.figures.dataCompletenessRate < 100
        ? "partial"
        : "complete"
    : "setup_required";
  const expenseCategories = Array.from(groupBy(currentExpenses, (transaction) => transaction.category || "Uncategorized").entries())
    .map(([label, transactions]) => ({
      label,
      value: money(sum(transactions.map((transaction) => transaction.amount))),
      count: transactions.length,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
  const currentMetric = <T,>(options: {
    value: T;
    comparisonValue?: T;
    formulaId: string;
    sourceService: string;
    status?: ExecutiveDashboardDataQualityStatus;
    unit?: ExecutiveDashboardMetric<T>["unit"];
    notes?: string[];
  }) => metric({
    value: options.value,
    comparisonValue: options.comparisonValue,
    period: input.period,
    comparisonPeriod: input.comparisonPeriod,
    formulaId: options.formulaId,
    sourceService: options.sourceService,
    dataQualityStatus: options.status ?? transactionQuality,
    lastCalculatedAt: generatedAt,
    businessId,
    unit: options.unit,
    notes: options.notes,
  });
  const salesMetric = currentMetric({
    value: money(saleTotal),
    comparisonValue: money(comparisonSaleTotal),
    formulaId: "executive.revenue.total_sales.v2",
    sourceService: "Transaction",
    unit: "money",
  });
  const expensesMetric = currentMetric({
    value: money(expenseTotal),
    comparisonValue: money(comparisonExpenseTotal),
    formulaId: "executive.expenses.total.v2",
    sourceService: "Transaction",
    unit: "money",
  });
  const customersOwingMetric = currentMetric({
    value: money(customerDebtTotal),
    comparisonValue: money(comparisonCustomerDebt),
    formulaId: "executive.receivables.open_customer_debt.v2",
    sourceService: "Debt",
    status: customerDebts.length ? "partial" : "insufficient_data",
    unit: "money",
    notes: ["Debt comparison uses current open debt records; historical settlement snapshots are not reconstructed."],
  });
  const supplierBillsMetric = currentMetric({
    value: money(supplierDebtTotal),
    formulaId: "executive.payables.open_supplier_debt.v2",
    sourceService: "Debt",
    status: supplierDebts.length ? "partial" : "insufficient_data",
    unit: "money",
  });
  const stockValueMetric = currentMetric({
    value: money(stockCostValue),
    formulaId: "executive.stock.cost_value.v2",
    sourceService: "InventoryItem",
    status: statusFromCounts({ total: input.inventoryItems.length, incomplete: stockWithMissingCost }),
    unit: "money",
    notes: ["Stock profit uses recorded cost prices."],
  });
  const bankItemsToReviewMetric = currentMetric({
    value: unmatchedBankRows.length,
    formulaId: "executive.reconciliation.unresolved_rows.v2",
    sourceService: "BankStatementImportRow",
    status: currentBankRows.length ? (unmatchedBankRows.length ? "partial" : "complete") : "insufficient_data",
    unit: "count",
  });
  const taxItemsToReviewMetric = currentMetric({
    value: taxSummary?.counts.reviewItemCount ?? 0,
    formulaId: "executive.tax.review_items.v2",
    sourceService: "TaxAssistant",
    status: taxQuality,
    unit: "count",
    notes: input.taxError ? [input.taxError] : undefined,
  });
  const notes = buildDataQualityNotes({
    uncategorizedTransactions,
    unmatchedBankRows: unmatchedBankRows.length,
    stockWithMissingCost,
    taxSummary,
    taxError: input.taxError,
    staffNotes,
  });
  const incompleteStatuses = [
    transactionQuality,
    stockValueMetric.dataQualityStatus,
    bankItemsToReviewMetric.dataQualityStatus,
    taxQuality,
    input.staffRestricted ? "partial" : "complete",
  ] as ExecutiveDashboardDataQualityStatus[];
  const attentionQueue = buildAttentionQueue({
    overdueCustomerDebt: money(overdueCustomerDebt),
    overdueSupplierDebt: money(overdueSupplierDebt),
    lowStockItems,
    unmatchedBankRows,
    taxSummary,
    expenseTotal: money(expenseTotal),
    comparisonExpenseTotal: money(comparisonExpenseTotal),
    staffSummary,
    stockWithMissingCost,
    taxError: input.taxError,
  });
  const latestTransaction = [...currentTransactions].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  )[0];
  const latestBankImport = [...currentBankRows].sort(
    (a, b) => new Date(b.importedAt ?? b.postedAt).getTime() - new Date(a.importedAt ?? a.postedAt).getTime(),
  )[0];
  const stale = latestTransaction
    ? input.generatedAt.getTime() - new Date(latestTransaction.occurredAt).getTime() > 30 * 24 * 60 * 60 * 1000
    : currentTransactions.length === 0;

  return {
    metricVersion: executiveDashboardMetricVersion,
    business: input.business,
    location: input.location ?? { id: null, name: "All locations" },
    period: input.period,
    comparisonPeriod: input.comparisonPeriod,
    generatedAt,
    headline: {
      sales: salesMetric,
      expenses: expensesMetric,
      profit: currentMetric({
        value: money(netResult),
        comparisonValue: money(comparisonNetResult),
        formulaId: "executive.profit.net_operating_result.v2",
        sourceService: "Transaction",
        unit: "money",
      }),
      customersOwing: customersOwingMetric,
      supplierBills: supplierBillsMetric,
      stockValue: stockValueMetric,
      bankEntriesToReview: bankItemsToReviewMetric,
      taxItemsToReview: taxItemsToReviewMetric,
    },
    revenue: {
      totalSales: salesMetric,
      paidSales: currentMetric({
        value: money(paidSales),
        comparisonValue: money(comparisonPaidSales),
        formulaId: "executive.revenue.paid_sales.v2",
        sourceService: "Transaction",
        unit: "money",
      }),
      creditSales: currentMetric({
        value: money(creditSales),
        comparisonValue: money(comparisonCreditSales),
        formulaId: "executive.revenue.credit_sales.v2",
        sourceService: "Transaction",
        unit: "money",
      }),
      averageSaleValue: currentMetric({
        value: currentSales.length ? money(saleTotal.div(currentSales.length)) : 0,
        comparisonValue: comparisonSales.length ? money(comparisonSaleTotal.div(comparisonSales.length)) : 0,
        formulaId: "executive.revenue.average_sale_value.v2",
        sourceService: "Transaction",
        status: currentSales.length ? transactionQuality : "insufficient_data",
        unit: "money",
      }),
    },
    expenses: {
      totalExpenses: expensesMetric,
      categories: expenseCategories,
      recurringTrend: currentMetric({
        value: money(expenseTotal),
        comparisonValue: money(comparisonExpenseTotal),
        formulaId: "executive.expenses.recurring_trend_proxy.v2",
        sourceService: "Transaction",
        status: currentExpenses.length ? "partial" : "insufficient_data",
        unit: "money",
        notes: ["Recurring expense trend uses category-level recorded expenses until recurring bills are modeled."],
      }),
    },
    profit: {
      recordedGrossProfit: currentMetric({
        value: money(grossProfit),
        comparisonValue: money(comparisonGrossProfit),
        formulaId: "executive.profit.recorded_gross_profit.v2",
        sourceService: "Transaction",
        unit: "money",
      }),
      estimatedNetOperatingResult: currentMetric({
        value: money(netResult),
        comparisonValue: money(comparisonNetResult),
        formulaId: "executive.profit.net_operating_result.v2",
        sourceService: "Transaction",
        unit: "money",
      }),
      marginPercentage: currentMetric({
        value: roundPercent(margin.toNumber()),
        comparisonValue: roundPercent(comparisonMargin.toNumber()),
        formulaId: "executive.profit.margin_percent.v2",
        sourceService: "Transaction",
        status: currentSales.length ? transactionQuality : "insufficient_data",
        unit: "percent",
      }),
      assumptions: [
        "Profit uses recorded sales profit minus recorded expenses.",
        "Owner withdrawals, unpaid tax liabilities, payroll accruals, and bank fees not recorded as transactions are excluded.",
      ],
    },
    cash: {
      recordedInflows: currentMetric({
        value: money(paidSales),
        comparisonValue: money(comparisonPaidSales),
        formulaId: "executive.cash.recorded_inflows.v2",
        sourceService: "Transaction",
        unit: "money",
      }),
      recordedOutflows: expensesMetric,
      netMovement: currentMetric({
        value: money(paidSales.minus(expenseTotal)),
        comparisonValue: money(comparisonPaidSales.minus(comparisonExpenseTotal)),
        formulaId: "executive.cash.net_movement.v2",
        sourceService: "Transaction",
        unit: "money",
      }),
      bankReconciledAmount: currentMetric({
        value: money(bankMatchedAmount),
        comparisonValue: money(comparisonBankMatchedAmount),
        formulaId: "executive.cash.bank_reconciled_amount.v2",
        sourceService: "BankStatementImportRow",
        status: currentBankRows.length ? "partial" : "insufficient_data",
        unit: "money",
      }),
      bankUnreconciledAmount: currentMetric({
        value: money(bankUnmatchedAmount),
        formulaId: "executive.cash.bank_unreconciled_amount.v2",
        sourceService: "BankStatementImportRow",
        status: currentBankRows.length ? (unmatchedBankRows.length ? "partial" : "complete") : "insufficient_data",
        unit: "money",
      }),
      disclosure: "Bank balance is not shown because imported statements are not an authoritative live bank balance.",
    },
    receivables: {
      totalCustomerDebt: customersOwingMetric,
      overdueCustomerDebt: currentMetric({
        value: money(overdueCustomerDebt),
        formulaId: "executive.receivables.overdue_customer_debt.v2",
        sourceService: "Debt",
        status: customerDebts.length ? "partial" : "insufficient_data",
        unit: "money",
      }),
      ageingBands: ageingBands(customerDebts, input.generatedAt),
      topDebtors: topParties(customerDebts),
    },
    payables: {
      supplierObligations: supplierBillsMetric,
      overdueObligations: currentMetric({
        value: money(overdueSupplierDebt),
        formulaId: "executive.payables.overdue_supplier_debt.v2",
        sourceService: "Debt",
        status: supplierDebts.length ? "partial" : "insufficient_data",
        unit: "money",
      }),
      ageingBands: ageingBands(supplierDebts, input.generatedAt),
      topSuppliers: topParties(supplierDebts),
    },
    stock: {
      stockCostValue: stockValueMetric,
      potentialRevenue: currentMetric({
        value: money(potentialRevenue),
        formulaId: "executive.stock.potential_revenue.v2",
        sourceService: "InventoryItem",
        status: stockValueMetric.dataQualityStatus,
        unit: "money",
      }),
      potentialProfit: currentMetric({
        value: money(potentialProfit),
        formulaId: "executive.stock.potential_profit.v2",
        sourceService: "InventoryItem",
        status: stockValueMetric.dataQualityStatus,
        unit: "money",
      }),
      lowStockItems: currentMetric({
        value: lowStockItems.length,
        formulaId: "executive.stock.low_stock_items.v2",
        sourceService: "InventoryItem",
        status: input.inventoryItems.length ? "complete" : "insufficient_data",
        unit: "count",
      }),
      slowMovingItems,
      warehouseCount: currentMetric({
        value: input.locations.length,
        formulaId: "executive.stock.warehouse_count.v2",
        sourceService: "BusinessLocation",
        status: input.locations.length ? "complete" : "insufficient_data",
        unit: "count",
      }),
      pendingTransfers: currentMetric({
        value: input.pendingTransfers,
        formulaId: "executive.stock.pending_transfers.v2",
        sourceService: "StockTransfer",
        unit: "count",
      }),
    },
    staff: {
      activeStaff: currentMetric({
        value: staffSummary?.summaryCards.activeStaff ?? 0,
        formulaId: "executive.staff.active_staff.v2",
        sourceService: "StaffPerformance",
        status: input.staffRestricted ? "partial" : staffSummary ? "complete" : "insufficient_data",
        unit: "count",
        notes: staffNotes,
      }),
      salesAttributedToStaff: currentMetric({
        value: staffSummary?.summaryCards.attributedSalesAmount ?? 0,
        formulaId: "executive.staff.attributed_sales.v2",
        sourceService: "StaffPerformance",
        status: input.staffRestricted ? "partial" : staffSummary ? "complete" : "insufficient_data",
        unit: "money",
        notes: staffNotes,
      }),
      unattributedActivity: currentMetric({
        value: staffSummary?.summaryCards.unattributedRecords ?? 0,
        formulaId: "executive.staff.unattributed_activity.v2",
        sourceService: "StaffPerformance",
        status: staffSummary?.summaryCards.unattributedRecords ? "partial" : input.staffRestricted ? "partial" : "complete",
        unit: "count",
        notes: staffNotes,
      }),
      operationalActivity: currentMetric({
        value: staffActivityCount,
        formulaId: "executive.staff.operational_activity.v2",
        sourceService: "StaffPerformance",
        status: input.staffRestricted ? "partial" : staffSummary ? "complete" : "insufficient_data",
        unit: "count",
      }),
      restricted: Boolean(input.staffRestricted),
      disclaimer: staffPerformanceDisclaimer,
    },
    reconciliation: {
      importedAmount: currentMetric({
        value: money(bankImportedAmount),
        comparisonValue: money(comparisonBankImportedAmount),
        formulaId: "executive.reconciliation.imported_amount.v2",
        sourceService: "BankStatementImportRow",
        status: currentBankRows.length ? "complete" : "insufficient_data",
        unit: "money",
      }),
      matchedAmount: currentMetric({
        value: money(bankMatchedAmount),
        comparisonValue: money(comparisonBankMatchedAmount),
        formulaId: "executive.reconciliation.matched_amount.v2",
        sourceService: "BankStatementImportRow",
        status: currentBankRows.length ? "partial" : "insufficient_data",
        unit: "money",
      }),
      unmatchedAmount: currentMetric({
        value: money(bankUnmatchedAmount),
        formulaId: "executive.reconciliation.unmatched_amount.v2",
        sourceService: "BankStatementImportRow",
        status: currentBankRows.length ? (unmatchedBankRows.length ? "partial" : "complete") : "insufficient_data",
        unit: "money",
      }),
      duplicateAmount: currentMetric({
        value: money(bankDuplicateAmount),
        formulaId: "executive.reconciliation.duplicate_amount.v2",
        sourceService: "BankStatementImportRow",
        status: duplicateBankRows.length ? "partial" : currentBankRows.length ? "complete" : "insufficient_data",
        unit: "money",
      }),
      reconciliationRate: currentMetric({
        value: roundPercent(reconciliationRate.toNumber()),
        comparisonValue: roundPercent(comparisonReconciliationRate.toNumber()),
        formulaId: "executive.reconciliation.rate.v2",
        sourceService: "BankStatementImportRow",
        status: currentBankRows.length ? (unmatchedBankRows.length ? "partial" : "complete") : "insufficient_data",
        unit: "percent",
      }),
      unresolvedItems: bankItemsToReviewMetric,
    },
    taxReadiness: {
      estimatedVatPosition: currentMetric({
        value: taxSummary?.figures.netVatEstimate ?? 0,
        formulaId: "executive.tax.net_vat_estimate.v2",
        sourceService: "TaxAssistant",
        status: taxQuality,
        unit: "money",
        notes: input.taxError ? [input.taxError] : undefined,
      }),
      whtRecorded: currentMetric({
        value: taxSummary
          ? roundMoney(taxSummary.figures.whtDeductedByCustomers + taxSummary.figures.whtDeductedFromSuppliers)
          : 0,
        formulaId: "executive.tax.wht_recorded.v2",
        sourceService: "TaxAssistant",
        status: taxQuality,
        unit: "money",
      }),
      unresolvedReviewItems: taxItemsToReviewMetric,
      dataCompleteness: currentMetric({
        value: taxSummary?.figures.dataCompletenessRate ?? 0,
        formulaId: "executive.tax.data_completeness.v2",
        sourceService: "TaxAssistant",
        status: taxQuality,
        unit: "percent",
      }),
      verifiedRuleSetVersion: currentMetric({
        value: taxSummary?.source.ruleSetVersion ?? "setup_required",
        formulaId: "executive.tax.rule_set_version.v2",
        sourceService: "TaxAssistant",
        status: taxQuality,
        unit: "text",
      }),
    },
    healthIndicators: {
      salesTrend: salesMetric,
      expenseTrend: expensesMetric,
      receivablesTrend: customersOwingMetric,
      stockConcentration: currentMetric({
        value: roundPercent(stockConcentration.toNumber()),
        formulaId: "executive.health.stock_concentration.v2",
        sourceService: "InventoryItem",
        status: stockValueMetric.dataQualityStatus,
        unit: "percent",
      }),
      reconciliationTrend: currentMetric({
        value: roundPercent(reconciliationRate.toNumber()),
        comparisonValue: roundPercent(comparisonReconciliationRate.toNumber()),
        formulaId: "executive.health.reconciliation_trend.v2",
        sourceService: "BankStatementImportRow",
        status: currentBankRows.length ? (unmatchedBankRows.length ? "partial" : "complete") : "insufficient_data",
        unit: "percent",
      }),
      dataQualityTrend: currentMetric({
        value: Math.max(0, 100 - notes.length * 10),
        formulaId: "executive.health.data_quality_trend.v2",
        sourceService: "ExecutiveDashboard",
        status: worstStatus(incompleteStatuses),
        unit: "percent",
      }),
    },
    attentionQueue,
    dataQuality: {
      status: worstStatus(incompleteStatuses),
      notes,
      incompleteMetricCount: incompleteStatuses.filter((status) => status !== "complete").length,
    },
    sourceMetrics: {
      transactionCount: currentTransactions.length,
      saleCount: currentSales.length,
      expenseCount: currentExpenses.length,
      openDebtCount: customerDebts.length + supplierDebts.length,
      inventoryItemCount: input.inventoryItems.length,
      bankRowCount: currentBankRows.length,
      staffMemberCount: staffSummary?.rows.length ?? 0,
      taxReviewItemCount: taxSummary?.counts.reviewItemCount ?? 0,
    },
    freshness: {
      latestTransactionAt: latestTransaction ? new Date(latestTransaction.occurredAt).toISOString() : null,
      latestBankImportAt: latestBankImport ? new Date(latestBankImport.importedAt ?? latestBankImport.postedAt).toISOString() : null,
      generatedAt,
      stale,
    },
    assumptions: [
      "All figures are based on records currently in SME MoneyBook for the selected business scope.",
      "Reversed transactions and reversal records are excluded.",
      "Bank metrics use imported statements only and do not represent a live bank balance.",
      "Tax readiness reuses deterministic Tax Assistant estimates and is not a filed tax return.",
      "Staff operation metrics are activity indicators, not employment rankings.",
    ],
  };
}

export async function getExecutiveDashboardDrilldown({
  businessId,
  locationId,
  period,
  type,
  includeStaffSummary = true,
}: ExecutiveDashboardQuery & {
  type: ExecutiveDashboardDrilldownType;
}): Promise<ExecutiveDashboardDrilldown> {
  const prisma = getPrisma();
  const locationFilter = locationId ? { locationId } : {};
  const base = {
    type,
    period: period.period,
    generatedAt: new Date().toISOString(),
    dataQualityStatus: "complete" as ExecutiveDashboardDataQualityStatus,
  };

  if (type === "revenue" || type === "expenses") {
    const transactions = await prisma.transaction.findMany({
      where: {
        businessId,
        ...locationFilter,
        type: type === "revenue" ? TransactionType.SALE : TransactionType.EXPENSE,
        occurredAt: { gte: period.periodStart, lt: period.periodEnd },
        reversesTransactionId: null,
      },
      orderBy: { occurredAt: "desc" },
      take: drilldownLimit,
      select: {
        id: true,
        description: true,
        amount: true,
        category: true,
        paymentStatus: true,
        occurredAt: true,
        reversalTransaction: { select: { id: true } },
      },
    });
    const rows = transactions.filter((transaction) => !transaction.reversalTransaction).map((transaction) => ({
      id: transaction.id,
      description: transaction.description,
      amount: money(transaction.amount),
      category: transaction.category ?? "Uncategorized",
      status: transaction.paymentStatus.toString(),
      occurredAt: transaction.occurredAt.toISOString(),
    }));

    return { ...base, rows, total: rows.length };
  }

  if (type === "receivables" || type === "payables") {
    const debts = await prisma.debt.findMany({
      where: {
        businessId,
        status: DebtStatus.OPEN,
        type: type === "receivables" ? DebtType.CUSTOMER_OWES_BUSINESS : DebtType.BUSINESS_OWES_SUPPLIER,
        ...(locationId ? { sourceTransaction: { locationId } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: drilldownLimit,
      select: {
        id: true,
        amount: true,
        paidAmount: true,
        dueAt: true,
        createdAt: true,
        customer: { select: { name: true } },
        supplier: { select: { name: true } },
      },
    });
    const rows = debts.map((debt) => ({
      id: debt.id,
      party: debt.customer?.name ?? debt.supplier?.name ?? "Unassigned",
      remaining: money(debt.amount.minus(debt.paidAmount)),
      dueAt: debt.dueAt?.toISOString() ?? null,
      createdAt: debt.createdAt.toISOString(),
    }));

    return { ...base, rows, total: rows.length, dataQualityStatus: "partial" };
  }

  if (type === "stock") {
    const items = await prisma.inventoryItem.findMany({
      where: { businessId, archivedAt: null },
      orderBy: { updatedAt: "desc" },
      take: drilldownLimit,
      select: {
        id: true,
        name: true,
        quantityOnHandDecimal: true,
        lowStockLevelDecimal: true,
        costPrice: true,
        sellingPrice: true,
      },
    });
    const rows = items.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: money(item.quantityOnHandDecimal),
      lowStockLevel: money(item.lowStockLevelDecimal),
      stockValue: money(item.quantityOnHandDecimal.mul(item.costPrice)),
      potentialRevenue: money(item.quantityOnHandDecimal.mul(item.sellingPrice)),
    }));

    return { ...base, rows, total: rows.length };
  }

  if (type === "reconciliation") {
    const rows = await prisma.bankStatementImportRow.findMany({
      where: {
        businessId,
        postedAt: { gte: period.periodStart, lt: period.periodEnd },
        status: { in: ["UNMATCHED", "SUGGESTED", "DUPLICATE"] },
        ...(locationId ? { statementImport: { locationId } } : {}),
      },
      orderBy: { postedAt: "desc" },
      take: drilldownLimit,
      select: {
        id: true,
        amount: true,
        status: true,
        duplicateStatus: true,
        description: true,
        postedAt: true,
      },
    });

    return {
      ...base,
      rows: rows.map((row) => ({
        id: row.id,
        description: row.description,
        amount: money(row.amount),
        status: row.status,
        duplicateStatus: row.duplicateStatus,
        postedAt: row.postedAt.toISOString(),
      })),
      total: rows.length,
      dataQualityStatus: rows.length ? "partial" : "complete",
    };
  }

  if (type === "tax") {
    const summary = await calculateTaxAssistantForBusiness({
      businessId,
      locationId,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
    });
    const rows = summary.reviewItems.slice(0, drilldownLimit).map((item) => ({
      id: item.id,
      issueType: item.issueType,
      severity: item.severity,
      amount: item.amount ?? null,
      explanation: item.explanation,
    }));

    return {
      ...base,
      rows,
      total: rows.length,
      dataQualityStatus: summary.missingInformation.length || rows.length ? "partial" : "complete",
    };
  }

  if (type === "staff" && includeStaffSummary) {
    const summary = await getStaffPerformanceSummary({
      businessId,
      locationId,
      period: {
        preset: "custom",
        label: period.period.label,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
      },
    });
    const rows = summary.rows.slice(0, drilldownLimit).map((row) => ({
      userId: row.staff.userId,
      name: row.staff.name,
      role: row.staff.role,
      salesRecorded: row.metrics.salesAmountRecorded,
      activityCount:
        row.metrics.salesTransactions +
        row.metrics.expensesRecorded +
        row.metrics.stockInOperations +
        row.metrics.stockOutOperations,
      lastActivity: row.metrics.lastRecordedActivity,
    }));

    return {
      ...base,
      rows,
      total: rows.length,
      dataQualityStatus: summary.dataQualityNotes.length ? "partial" : "complete",
    };
  }

  return {
    ...base,
    rows: [],
    total: 0,
    dataQualityStatus: "partial",
  };
}

export function resolveExecutiveDashboardPeriod(input: ExecutiveDashboardPeriodInput = {}): ResolvedExecutiveDashboardPeriod {
  const now = input.now ?? new Date();
  const preset = normalizePreset(input.preset);
  let periodStart: Date;
  let periodEnd: Date;
  let label: string;

  if (preset === "custom") {
    periodStart = parseDate(input.from) ?? monthStart(now);
    periodEnd = parseDate(input.to) ?? addDays(periodStart, 30);

    if (periodEnd <= periodStart) {
      throw new Error("Choose a valid Executive Dashboard date range.");
    }

    if (daysBetween(periodStart, periodEnd) > maxCustomRangeDays) {
      throw new Error("Keep Executive Dashboard custom ranges to 366 days or less.");
    }

    label = `${shortDate(periodStart)} - ${shortDate(periodEnd)}`;
  } else if (preset === "today") {
    periodStart = dayStart(now);
    periodEnd = addDays(periodStart, 1);
    label = "Today";
  } else if (preset === "last_7_days") {
    periodEnd = addDays(dayStart(now), 1);
    periodStart = addDays(periodEnd, -7);
    label = "Last 7 days";
  } else if (preset === "previous_month") {
    const current = monthStart(now);
    periodStart = addMonths(current, -1);
    periodEnd = current;
    label = "Previous month";
  } else if (preset === "quarter") {
    periodStart = quarterStart(now);
    periodEnd = addMonths(periodStart, 3);
    label = "This quarter";
  } else if (preset === "year") {
    periodStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    periodEnd = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1));
    label = "This year";
  } else {
    periodStart = monthStart(now);
    periodEnd = addMonths(periodStart, 1);
    label = "This month";
  }

  const durationMs = periodEnd.getTime() - periodStart.getTime();
  const comparisonEnd = periodStart;
  const comparisonStart = new Date(periodStart.getTime() - durationMs);
  const period = buildPeriod(preset, label, periodStart, periodEnd);
  const comparisonPeriod = buildPeriod("custom", `Previous ${label.toLowerCase()}`, comparisonStart, comparisonEnd);

  return {
    period,
    comparisonPeriod,
    periodStart,
    periodEnd,
    comparisonStart,
    comparisonEnd,
  };
}

function buildPeriod(
  preset: ExecutiveDashboardPeriodPreset,
  label: string,
  start: Date,
  end: Date,
): ExecutiveDashboardPeriod {
  return {
    preset,
    label,
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function buildDataQualityNotes({
  uncategorizedTransactions,
  unmatchedBankRows,
  stockWithMissingCost,
  taxSummary,
  taxError,
  staffNotes,
}: {
  uncategorizedTransactions: number;
  unmatchedBankRows: number;
  stockWithMissingCost: number;
  taxSummary: ExecutiveDashboardCalculationInput["taxSummary"];
  taxError?: string | null;
  staffNotes: string[];
}) {
  const notes: string[] = [];

  if (uncategorizedTransactions > 0) {
    notes.push(`${uncategorizedTransactions} transactions are not categorized.`);
  }

  if (unmatchedBankRows > 0) {
    notes.push(`${unmatchedBankRows} bank entries are unreconciled.`);
  }

  if (stockWithMissingCost > 0) {
    notes.push(`${stockWithMissingCost} stock items have missing cost prices.`);
  }

  if (taxError) {
    notes.push(`Tax readiness is unavailable: ${taxError}`);
  } else if (taxSummary?.missingInformation.length) {
    notes.push(`Tax estimate excludes setup gaps: ${taxSummary.missingInformation.join("; ")}`);
  } else if (taxSummary && taxSummary.counts.reviewItemCount > 0) {
    notes.push(`Tax estimate includes ${taxSummary.counts.reviewItemCount} review items.`);
  }

  for (const note of staffNotes) {
    notes.push(note);
  }

  return Array.from(new Set(notes)).slice(0, 8);
}

function buildAttentionQueue({
  overdueCustomerDebt,
  overdueSupplierDebt,
  lowStockItems,
  unmatchedBankRows,
  taxSummary,
  expenseTotal,
  comparisonExpenseTotal,
  staffSummary,
  stockWithMissingCost,
  taxError,
}: {
  overdueCustomerDebt: number;
  overdueSupplierDebt: number;
  lowStockItems: ExecutiveDashboardCalculationInput["inventoryItems"];
  unmatchedBankRows: ExecutiveDashboardCalculationInput["bankRows"];
  taxSummary: ExecutiveDashboardCalculationInput["taxSummary"];
  expenseTotal: number;
  comparisonExpenseTotal: number;
  staffSummary: ExecutiveDashboardCalculationInput["staffSummary"];
  stockWithMissingCost: number;
  taxError?: string | null;
}) {
  const items: ExecutiveDashboardAttentionItem[] = [];

  if (overdueCustomerDebt > 0) {
    items.push({
      id: "attention:overdue_customer_debt",
      severity: "warning",
      title: "Customers owing",
      detail: "Some customer debts are overdue.",
      amount: overdueCustomerDebt,
      sourceService: "Debt",
      actionLabel: "Review debtors",
      drilldownType: "receivables",
    });
  }

  if (overdueSupplierDebt > 0) {
    items.push({
      id: "attention:overdue_supplier_debt",
      severity: "warning",
      title: "Supplier bills",
      detail: "Supplier obligations need review.",
      amount: overdueSupplierDebt,
      sourceService: "Debt",
      actionLabel: "Review supplier bills",
      drilldownType: "payables",
    });
  }

  if (lowStockItems.length > 0) {
    items.push({
      id: "attention:low_stock",
      severity: "information",
      title: "Low stock",
      detail: "Some stock items are at or below their low-stock level.",
      count: lowStockItems.length,
      sourceService: "InventoryItem",
      actionLabel: "Review stock",
      drilldownType: "stock",
    });
  }

  if (unmatchedBankRows.length > 0) {
    items.push({
      id: "attention:unreconciled_bank_entries",
      severity: "warning",
      title: "Bank entries to review",
      detail: "Imported bank entries remain unmatched or suggested.",
      count: unmatchedBankRows.length,
      amount: money(sumAbs(unmatchedBankRows.map((row) => row.amount))),
      sourceService: "BankStatementImportRow",
      actionLabel: "Review bank entries",
      drilldownType: "reconciliation",
    });
  }

  if (taxError || taxSummary?.missingInformation.length || taxSummary?.counts.reviewItemCount) {
    items.push({
      id: "attention:tax_readiness",
      severity: taxError || taxSummary?.missingInformation.length ? "critical" : "warning",
      title: "Tax items to review",
      detail: taxError ?? "Tax readiness has incomplete data or open review items.",
      count: taxSummary?.counts.reviewItemCount ?? taxSummary?.missingInformation.length ?? 1,
      sourceService: "TaxAssistant",
      actionLabel: "Review tax data",
      drilldownType: "tax",
    });
  }

  if (comparisonExpenseTotal > 0 && expenseTotal > comparisonExpenseTotal * 1.5) {
    items.push({
      id: "attention:large_expense_change",
      severity: "information",
      title: "Expense change",
      detail: "Expenses increased by more than 50% against the comparison period.",
      amount: roundMoney(expenseTotal - comparisonExpenseTotal),
      sourceService: "Transaction",
      actionLabel: "Review expenses",
      drilldownType: "expenses",
    });
  }

  if (staffSummary?.summaryCards.unattributedRecords) {
    items.push({
      id: "attention:unattributed_staff_activity",
      severity: "information",
      title: "Unattributed activity",
      detail: "Some operational records are not tied to a staff activity source.",
      count: staffSummary.summaryCards.unattributedRecords,
      sourceService: "StaffPerformance",
      actionLabel: "Review staff activity",
      drilldownType: "staff",
    });
  }

  if (stockWithMissingCost > 0) {
    items.push({
      id: "attention:stock_setup",
      severity: "information",
      title: "Stock setup",
      detail: "Some stock items need cost prices for reliable profit estimates.",
      count: stockWithMissingCost,
      sourceService: "InventoryItem",
      actionLabel: "Review stock setup",
      drilldownType: "stock",
    });
  }

  return items.slice(0, 8);
}

function ageingBands(debts: ExecutiveDashboardCalculationInput["debts"], now: Date): ExecutiveDashboardBreakdown[] {
  const totals = new Map<string, { value: Prisma.Decimal; count: number }>();

  for (const debt of debts) {
    const date = debt.dueAt ? new Date(debt.dueAt) : new Date(debt.createdAt);
    const days = Math.max(0, Math.floor((now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000)));
    const label = ageingBandLabel(days);
    const current = totals.get(label) ?? { value: new Prisma.Decimal(0), count: 0 };
    totals.set(label, {
      value: current.value.plus(remainingDebt(debt)),
      count: current.count + 1,
    });
  }

  return ["0-30 days", "31-60 days", "61-90 days", "90+ days"].map((label) => ({
    label,
    value: money(totals.get(label)?.value ?? 0),
    count: totals.get(label)?.count ?? 0,
  }));
}

function topParties(debts: ExecutiveDashboardCalculationInput["debts"]) {
  const totals = new Map<string, Prisma.Decimal>();

  for (const debt of debts) {
    const label = debt.partyName || "Unassigned";
    totals.set(label, (totals.get(label) ?? new Prisma.Decimal(0)).plus(remainingDebt(debt)));
  }

  return Array.from(totals.entries())
    .map(([label, value]) => ({ label, value: money(value) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
}

function groupBy<T>(items: T[], key: (item: T) => string) {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const label = key(item);
    groups.set(label, [...(groups.get(label) ?? []), item]);
  }

  return groups;
}

function remainingDebt(debt: ExecutiveDashboardCalculationInput["debts"][number]): Prisma.Decimal {
  return Prisma.Decimal.max(dec(debt.amount).minus(dec(debt.paidAmount)), 0);
}

function isOverdue(debt: ExecutiveDashboardCalculationInput["debts"][number], now: Date) {
  return Boolean(debt.dueAt && new Date(debt.dueAt).getTime() < now.getTime());
}

function inPeriod(value: Date | string, period: ExecutiveDashboardPeriod) {
  const date = new Date(value);
  return date >= new Date(period.start) && date < new Date(period.end);
}

function sum(values: DecimalLike[]): Prisma.Decimal {
  return values.reduce<Prisma.Decimal>((total, value) => total.plus(dec(value)), new Prisma.Decimal(0));
}

function sumAbs(values: DecimalLike[]): Prisma.Decimal {
  return values.reduce<Prisma.Decimal>((total, value) => total.plus(dec(value).abs()), new Prisma.Decimal(0));
}

function dec(value: DecimalLike): Prisma.Decimal {
  return new Prisma.Decimal(value.toString());
}

function money(value: DecimalLike): number {
  return roundMoney(dec(value).toNumber());
}

function normalize(value?: string | null) {
  return String(value ?? "").toLowerCase();
}

function normalizePreset(value?: string | null): ExecutiveDashboardPeriodPreset {
  const normalized = String(value ?? "this_month").toLowerCase();

  if (
    normalized === "today" ||
    normalized === "last_7_days" ||
    normalized === "this_month" ||
    normalized === "previous_month" ||
    normalized === "quarter" ||
    normalized === "year" ||
    normalized === "custom"
  ) {
    return normalized;
  }

  return "this_month";
}

function parseDate(value?: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dayStart(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function monthStart(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

function quarterStart(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), Math.floor(value.getUTCMonth() / 3) * 3, 1));
}

function addDays(value: Date, days: number) {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

function addMonths(value: Date, months: number) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, value.getUTCDate()));
}

function daysBetween(start: Date, end: Date) {
  return Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

function shortDate(value: Date) {
  return value.toISOString().slice(0, 10);
}
