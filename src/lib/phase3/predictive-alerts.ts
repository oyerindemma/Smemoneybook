export const predictiveAlertsRuleVersion = "predictive-alerts-v1";

export type PredictiveAlertType =
  | "revenue_drop"
  | "expense_spike"
  | "duplicate_transaction"
  | "unusual_refund"
  | "unusual_discount"
  | "stock_shrinkage"
  | "cash_mismatch"
  | "customer_payment_slowdown"
  | "supplier_price_increase"
  | "dormant_high_value_customer"
  | "product_demand_shift"
  | "potential_cash_shortage";

export type PredictiveAlertSeverity = "info" | "warning" | "critical";
export type PredictiveAlertStatus = "active" | "dismissed" | "confirmed" | "incorrect" | "resolved";

export type PredictiveAlertTransaction = {
  id: string;
  accountId?: string | null;
  type: string;
  amount: number;
  profit?: number;
  costOfGoods?: number;
  description?: string | null;
  category?: string | null;
  paymentStatus?: string | null;
  occurredAt: Date;
  locationId?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  supplierId?: string | null;
  supplierName?: string | null;
  inventoryItemId?: string | null;
  productName?: string | null;
  inventoryQuantity?: number | null;
  invoiceItems?: unknown;
  reversed?: boolean;
};

export type PredictiveAlertDebt = {
  type: string;
  amount: number;
  paidAmount: number;
  status: string;
  dueAt?: Date | null;
  createdAt?: Date | null;
  customerId?: string | null;
  customerName?: string | null;
  supplierId?: string | null;
};

export type PredictiveAlertInventoryItem = {
  id: string;
  name: string;
  quantityOnHand: number;
  lowStockLevel: number;
  costPrice: number;
  sellingPrice: number;
};

export type PredictiveAlertInventoryMovement = {
  id: string;
  itemId: string;
  itemName?: string | null;
  type: string;
  quantity: number;
  adjustmentType?: string | null;
  reason?: string | null;
  createdAt: Date;
  locationId?: string | null;
  sourceLocationId?: string | null;
  destinationLocationId?: string | null;
};

export type PredictiveAlertReturn = {
  id: string;
  refundAmount: number;
  createdAt: Date;
  reason?: string | null;
  locationId?: string | null;
};

export type PredictiveAlertCashflowSnapshot = {
  id: string;
  horizonDays: number;
  confidence: string;
  forecastEndingCash: number;
  lowerBound: number;
  forecastStart: Date;
  forecastEnd: Date;
  generatedAt: Date;
};

export type PredictiveAlertBankImportSignal = {
  id: string;
  status: string;
  rowCount: number;
  matchedCount: number;
  duplicateRowCount: number;
  importedAt: Date;
};

export type PredictiveAlertInput = {
  businessId: string;
  locationId?: string;
  generatedAt?: Date;
  periodDays?: number;
  transactions: PredictiveAlertTransaction[];
  debts: PredictiveAlertDebt[];
  inventoryItems: PredictiveAlertInventoryItem[];
  inventoryMovements: PredictiveAlertInventoryMovement[];
  returns: PredictiveAlertReturn[];
  cashflowForecasts?: PredictiveAlertCashflowSnapshot[];
  bankImports?: PredictiveAlertBankImportSignal[];
};

export type PredictiveAlertCandidate = {
  alertKey: string;
  type: PredictiveAlertType;
  severity: PredictiveAlertSeverity;
  confidence: number;
  impactAmount: number;
  title: string;
  explanation: string;
  recommendedAction: string;
  sourcePeriodStart: string;
  sourcePeriodEnd: string;
  sourceMetrics: Record<string, number | string | boolean | null>;
};

type Period = {
  start: Date;
  end: Date;
  label: string;
};

type InvoiceLine = {
  inventoryItemId?: string;
  name?: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
};

const dayMs = 86_400_000;
const minimumAbsoluteImpact = 5_000;

export function detectPredictiveAlerts(input: PredictiveAlertInput): PredictiveAlertCandidate[] {
  const generatedAt = input.generatedAt ?? new Date();
  const periodDays = Math.max(7, Math.min(30, Math.round(input.periodDays ?? 14)));
  const current: Period = {
    start: addDays(generatedAt, -periodDays),
    end: generatedAt,
    label: `last_${periodDays}_days`,
  };
  const previous: Period = {
    start: addDays(generatedAt, -periodDays * 2),
    end: addDays(generatedAt, -periodDays),
    label: `previous_${periodDays}_days`,
  };
  const activeTransactions = input.transactions
    .filter((transaction) => !transaction.reversed)
    .filter((transaction) => transaction.occurredAt < generatedAt);
  const alerts = [
    detectRevenueDrop(input, activeTransactions, current, previous),
    detectExpenseSpike(input, activeTransactions, current, previous),
    detectDuplicateTransaction(input, activeTransactions, current),
    detectUnusualRefund(input, activeTransactions, input.returns, current, previous),
    detectUnusualDiscount(input, activeTransactions, current, previous),
    detectStockShrinkage(input, current),
    detectCashMismatch(input, current),
    detectCustomerPaymentSlowdown(input, activeTransactions, current),
    detectSupplierPriceIncrease(input, activeTransactions, current, previous),
    detectDormantHighValueCustomer(input, activeTransactions, generatedAt),
    detectProductDemandShift(input, activeTransactions, current, previous),
    detectPotentialCashShortage(input),
  ].flatMap((alert) => (alert ? [alert] : []));

  return alerts.sort(compareAlertPriority).slice(0, 12);
}

function detectRevenueDrop(
  input: PredictiveAlertInput,
  transactions: PredictiveAlertTransaction[],
  current: Period,
  previous: Period,
): PredictiveAlertCandidate | null {
  const currentSales = summarizeTransactions(transactions, "sale", current);
  const previousSales = summarizeTransactions(transactions, "sale", previous);

  if (currentSales.count < 2 || previousSales.count < 2 || previousSales.amount < minimumAbsoluteImpact) {
    return null;
  }

  const dropAmount = previousSales.amount - currentSales.amount;
  const dropRatio = previousSales.amount > 0 ? dropAmount / previousSales.amount : 0;

  if (dropRatio < 0.3 || dropAmount < minimumAbsoluteImpact) {
    return null;
  }

  return buildAlert(input, {
    current,
    type: "revenue_drop",
    severity: dropRatio >= 0.55 ? "critical" : "warning",
    confidence: confidenceFromSamples(currentSales.count + previousSales.count, dropRatio),
    impactAmount: dropAmount,
    title: "Revenue dropped",
    explanation: `Recorded sales are ${formatPercent(dropRatio)} lower than the previous ${daysBetween(previous.start, previous.end)} day period.`,
    recommendedAction: "Review best-selling products, recent customer activity, and stock availability before changing prices.",
    sourceMetrics: {
      currentRevenue: roundMoney(currentSales.amount),
      previousRevenue: roundMoney(previousSales.amount),
      dropAmount: roundMoney(dropAmount),
      dropPercent: roundPercent(dropRatio),
      currentSalesCount: currentSales.count,
      previousSalesCount: previousSales.count,
      ruleVersion: predictiveAlertsRuleVersion,
    },
  });
}

function detectExpenseSpike(
  input: PredictiveAlertInput,
  transactions: PredictiveAlertTransaction[],
  current: Period,
  previous: Period,
): PredictiveAlertCandidate | null {
  const currentExpenses = summarizeTransactions(transactions, "expense", current);
  const previousExpenses = summarizeTransactions(transactions, "expense", previous);

  if (currentExpenses.count < 2 || currentExpenses.amount < minimumAbsoluteImpact) {
    return null;
  }

  const baseline = previousExpenses.amount > 0 ? previousExpenses.amount : currentExpenses.amount / 2;
  const increase = currentExpenses.amount - baseline;
  const increaseRatio = baseline > 0 ? increase / baseline : 0;

  if (increaseRatio < 0.5 || increase < minimumAbsoluteImpact) {
    return null;
  }

  return buildAlert(input, {
    current,
    type: "expense_spike",
    severity: increaseRatio >= 1 ? "critical" : "warning",
    confidence: confidenceFromSamples(currentExpenses.count + previousExpenses.count, increaseRatio),
    impactAmount: increase,
    title: "Expenses increased quickly",
    explanation: `Recorded expenses are ${formatPercent(increaseRatio)} higher than the comparison period.`,
    recommendedAction: "Check large expense categories and supplier bills before approving more spending.",
    sourceMetrics: {
      currentExpenses: roundMoney(currentExpenses.amount),
      previousExpenses: roundMoney(previousExpenses.amount),
      increaseAmount: roundMoney(increase),
      increasePercent: roundPercent(increaseRatio),
      currentExpenseCount: currentExpenses.count,
      previousExpenseCount: previousExpenses.count,
      ruleVersion: predictiveAlertsRuleVersion,
    },
  });
}

function detectDuplicateTransaction(
  input: PredictiveAlertInput,
  transactions: PredictiveAlertTransaction[],
  current: Period,
): PredictiveAlertCandidate | null {
  const groups = new Map<string, PredictiveAlertTransaction[]>();

  for (const transaction of transactions.filter((item) => inPeriod(item.occurredAt, current))) {
    if (!["sale", "expense"].includes(normalize(transaction.type)) || transaction.amount <= 0) {
      continue;
    }

    const key = [
      normalize(transaction.type),
      roundMoney(transaction.amount).toFixed(2),
      dateKey(transaction.occurredAt),
      normalize(transaction.description ?? ""),
      transaction.accountId ?? "account_unknown",
    ].join("|");
    groups.set(key, [...(groups.get(key) ?? []), transaction]);
  }

  const duplicateGroup = Array.from(groups.values())
    .filter((group) => group.length >= 2)
    .sort((left, right) => sumAmounts(right) - sumAmounts(left))[0];

  if (!duplicateGroup) {
    return null;
  }

  const duplicateAmount = sumAmounts(duplicateGroup) - cleanAmount(duplicateGroup[0].amount);

  return buildAlert(input, {
    current,
    type: "duplicate_transaction",
    severity: duplicateAmount >= 25_000 ? "warning" : "info",
    confidence: 0.82,
    impactAmount: duplicateAmount,
    title: "Possible duplicate transaction",
    explanation: `${duplicateGroup.length} similar ${normalize(duplicateGroup[0].type)} records share the same amount, date, account, and description.`,
    recommendedAction: "Review the matching records and reverse only after owner confirmation if one was entered twice.",
    sourceMetrics: {
      transactionCount: duplicateGroup.length,
      duplicateAmount: roundMoney(duplicateAmount),
      sampleTransactionId: duplicateGroup[0].id,
      transactionDate: dateKey(duplicateGroup[0].occurredAt),
      ruleVersion: predictiveAlertsRuleVersion,
    },
  });
}

function detectUnusualRefund(
  input: PredictiveAlertInput,
  transactions: PredictiveAlertTransaction[],
  returns: PredictiveAlertReturn[],
  current: Period,
  previous: Period,
): PredictiveAlertCandidate | null {
  const currentReturns = returns.filter((item) => inPeriod(item.createdAt, current));
  const previousReturns = returns.filter((item) => inPeriod(item.createdAt, previous));
  const largestRefund = currentReturns.sort((left, right) => right.refundAmount - left.refundAmount)[0];

  if (!largestRefund || largestRefund.refundAmount < minimumAbsoluteImpact) {
    return null;
  }

  const currentRevenue = summarizeTransactions(transactions, "sale", current).amount;
  const previousAverageRefund = previousReturns.length > 0 ? sumRefunds(previousReturns) / previousReturns.length : 0;
  const revenueShare = currentRevenue > 0 ? largestRefund.refundAmount / currentRevenue : 0;
  const unusualAgainstHistory = previousAverageRefund > 0 && largestRefund.refundAmount >= previousAverageRefund * 2;
  const unusualAgainstRevenue = revenueShare >= 0.15;

  if (!unusualAgainstHistory && !unusualAgainstRevenue) {
    return null;
  }

  return buildAlert(input, {
    current,
    type: "unusual_refund",
    severity: revenueShare >= 0.25 ? "critical" : "warning",
    confidence: confidenceFromSamples(currentReturns.length + previousReturns.length, Math.max(revenueShare, 0.4)),
    impactAmount: largestRefund.refundAmount,
    title: "Large refund needs review",
    explanation: "A customer return refund is unusually large compared with recent refunds or recorded sales.",
    recommendedAction: "Review the return reason, refund transaction, and stock disposition before closing the period.",
    sourceMetrics: {
      refundId: largestRefund.id,
      refundAmount: roundMoney(largestRefund.refundAmount),
      currentRefundCount: currentReturns.length,
      previousAverageRefund: roundMoney(previousAverageRefund),
      currentRevenue: roundMoney(currentRevenue),
      refundShareOfRevenue: roundPercent(revenueShare),
      ruleVersion: predictiveAlertsRuleVersion,
    },
  });
}

function detectUnusualDiscount(
  input: PredictiveAlertInput,
  transactions: PredictiveAlertTransaction[],
  current: Period,
  previous: Period,
): PredictiveAlertCandidate | null {
  const currentDiscount = summarizeDiscounts(transactions.filter((transaction) => inPeriod(transaction.occurredAt, current)));
  const previousDiscount = summarizeDiscounts(transactions.filter((transaction) => inPeriod(transaction.occurredAt, previous)));

  if (currentDiscount.totalDiscount < 2_000 || currentDiscount.discountedLineCount === 0) {
    return null;
  }

  const currentRevenue = summarizeTransactions(transactions, "sale", current).amount;
  const discountShare = currentRevenue > 0 ? currentDiscount.totalDiscount / currentRevenue : 0;
  const historicalIncrease = previousDiscount.totalDiscount > 0
    ? currentDiscount.totalDiscount / previousDiscount.totalDiscount
    : currentDiscount.totalDiscount > 10_000
      ? 2
      : 0;

  if (discountShare < 0.12 && historicalIncrease < 1.8 && currentDiscount.maxLineDiscountShare < 0.35) {
    return null;
  }

  return buildAlert(input, {
    current,
    type: "unusual_discount",
    severity: discountShare >= 0.2 || currentDiscount.maxLineDiscountShare >= 0.5 ? "warning" : "info",
    confidence: confidenceFromSamples(currentDiscount.discountedLineCount + previousDiscount.discountedLineCount, Math.max(discountShare, 0.35)),
    impactAmount: currentDiscount.totalDiscount,
    title: "Discounts are higher than usual",
    explanation: "Recorded invoice discounts are high compared with sales or the previous period.",
    recommendedAction: "Check whether the discount was approved and whether product prices need adjustment.",
    sourceMetrics: {
      currentDiscount: roundMoney(currentDiscount.totalDiscount),
      previousDiscount: roundMoney(previousDiscount.totalDiscount),
      currentRevenue: roundMoney(currentRevenue),
      discountShareOfRevenue: roundPercent(discountShare),
      discountedLineCount: currentDiscount.discountedLineCount,
      maxLineDiscountShare: roundPercent(currentDiscount.maxLineDiscountShare),
      ruleVersion: predictiveAlertsRuleVersion,
    },
  });
}

function detectStockShrinkage(input: PredictiveAlertInput, current: Period): PredictiveAlertCandidate | null {
  const itemCostById = new Map(input.inventoryItems.map((item) => [item.id, item.costPrice]));
  const reductionTypes = new Set(["damaged", "expired", "lost", "theft", "count_correction", "personal_use", "promotional_giveaway"]);
  const reductions = input.inventoryMovements.filter((movement) =>
    inPeriod(movement.createdAt, current) &&
    normalize(movement.type) === "adjustment" &&
    reductionTypes.has(normalize(movement.adjustmentType ?? "")) &&
    cleanAmount(movement.quantity) > 0
  );
  const estimatedCost = roundMoney(
    reductions.reduce((sum, movement) => sum + cleanAmount(movement.quantity) * (itemCostById.get(movement.itemId) ?? 0), 0),
  );

  if (reductions.length < 2 && estimatedCost < minimumAbsoluteImpact) {
    return null;
  }

  return buildAlert(input, {
    current,
    type: "stock_shrinkage",
    severity: estimatedCost >= 25_000 ? "warning" : "info",
    confidence: confidenceFromSamples(reductions.length, estimatedCost >= minimumAbsoluteImpact ? 0.45 : 0.25),
    impactAmount: estimatedCost,
    title: "Stock reduction needs review",
    explanation: "Recent stock adjustments reduced inventory outside normal sales flow. This is a review signal, not an accusation.",
    recommendedAction: "Compare the adjustment notes with physical stock counts and supplier/customer return records.",
    sourceMetrics: {
      adjustmentCount: reductions.length,
      estimatedCost: roundMoney(estimatedCost),
      affectedItemCount: new Set(reductions.map((movement) => movement.itemId)).size,
      ruleVersion: predictiveAlertsRuleVersion,
    },
  });
}

function detectCashMismatch(input: PredictiveAlertInput, current: Period): PredictiveAlertCandidate | null {
  const imports = (input.bankImports ?? []).filter((item) => inPeriod(item.importedAt, current));
  const rowCount = imports.reduce((sum, item) => sum + item.rowCount, 0);
  const matchedCount = imports.reduce((sum, item) => sum + item.matchedCount, 0);
  const duplicateRows = imports.reduce((sum, item) => sum + item.duplicateRowCount, 0);
  const unmatchedRows = Math.max(0, rowCount - matchedCount - duplicateRows);

  if (rowCount < 5 || (unmatchedRows < 3 && duplicateRows === 0)) {
    return null;
  }

  const mismatchShare = rowCount > 0 ? (unmatchedRows + duplicateRows) / rowCount : 0;

  return buildAlert(input, {
    current,
    type: "cash_mismatch",
    severity: mismatchShare >= 0.4 ? "warning" : "info",
    confidence: confidenceFromSamples(rowCount, mismatchShare),
    impactAmount: 0,
    title: "Bank reconciliation backlog",
    explanation: "Recent bank imports include unmatched or duplicate rows that can make cash reports less reliable.",
    recommendedAction: "Open Bank Reconciliation and confirm matches before relying on cash totals.",
    sourceMetrics: {
      importCount: imports.length,
      rowCount,
      matchedCount,
      unmatchedRows,
      duplicateRows,
      mismatchShare: roundPercent(mismatchShare),
      ruleVersion: predictiveAlertsRuleVersion,
    },
  });
}

function detectCustomerPaymentSlowdown(
  input: PredictiveAlertInput,
  transactions: PredictiveAlertTransaction[],
  current: Period,
): PredictiveAlertCandidate | null {
  const openCustomerDebts = input.debts.filter(
    (debt) => normalize(debt.type) === "customer_owes_business" && normalize(debt.status) === "open",
  );
  const overdueDebts = openCustomerDebts.filter((debt) => debt.dueAt && debt.dueAt < current.end);
  const overdueAmount = sumDebtOutstanding(overdueDebts);
  const revenue30 = sumBy(
    transactions.filter((transaction) => normalize(transaction.type) === "sale" && transaction.occurredAt >= addDays(current.end, -30) && transaction.occurredAt < current.end),
    (transaction) => transaction.amount,
  );
  const overdueShare = revenue30 > 0 ? overdueAmount / revenue30 : overdueAmount > minimumAbsoluteImpact ? 1 : 0;

  if (overdueDebts.length < 2 || overdueAmount < minimumAbsoluteImpact || overdueShare < 0.2) {
    return null;
  }

  return buildAlert(input, {
    current,
    type: "customer_payment_slowdown",
    severity: overdueShare >= 0.5 ? "critical" : "warning",
    confidence: confidenceFromSamples(overdueDebts.length, overdueShare),
    impactAmount: overdueAmount,
    title: "Customer payments are slowing",
    explanation: "Overdue customer balances are high compared with recent recorded sales.",
    recommendedAction: "Send reminders to overdue customers and review credit sales before extending more credit.",
    sourceMetrics: {
      overdueCustomerDebt: roundMoney(overdueAmount),
      overdueDebtCount: overdueDebts.length,
      revenueLast30Days: roundMoney(revenue30),
      overdueShareOfRevenue: roundPercent(overdueShare),
      ruleVersion: predictiveAlertsRuleVersion,
    },
  });
}

function detectSupplierPriceIncrease(
  input: PredictiveAlertInput,
  transactions: PredictiveAlertTransaction[],
  current: Period,
  previous: Period,
): PredictiveAlertCandidate | null {
  const currentSupplierExpenses = groupSupplierExpenses(transactions, current);
  const previousSupplierExpenses = groupSupplierExpenses(transactions, previous);
  const candidates = Array.from(currentSupplierExpenses.entries()).flatMap(([supplierId, currentSummary]) => {
    const previousSummary = previousSupplierExpenses.get(supplierId);

    if (!previousSummary || currentSummary.count < 2 || previousSummary.count < 2) {
      return [];
    }

    const currentAverage = currentSummary.amount / currentSummary.count;
    const previousAverage = previousSummary.amount / previousSummary.count;
    const increase = currentAverage - previousAverage;
    const increaseRatio = previousAverage > 0 ? increase / previousAverage : 0;

    if (increaseRatio < 0.25 || increase < 2_000) {
      return [];
    }

    return [{ supplierId, currentSummary, previousSummary, currentAverage, previousAverage, increase, increaseRatio }];
  }).sort((left, right) => right.increase - left.increase);
  const candidate = candidates[0];

  if (!candidate) {
    return null;
  }

  return buildAlert(input, {
    current,
    type: "supplier_price_increase",
    severity: candidate.increaseRatio >= 0.5 ? "warning" : "info",
    confidence: confidenceFromSamples(candidate.currentSummary.count + candidate.previousSummary.count, candidate.increaseRatio),
    impactAmount: candidate.increase * candidate.currentSummary.count,
    title: "Supplier expenses changed",
    explanation: `${candidate.currentSummary.supplierName} average recorded expense increased by ${formatPercent(candidate.increaseRatio)} against the previous period.`,
    recommendedAction: "Compare recent supplier receipts and confirm whether the cost increase is temporary or permanent.",
    sourceMetrics: {
      supplierId: candidate.supplierId,
      supplierName: candidate.currentSummary.supplierName,
      currentAverageExpense: roundMoney(candidate.currentAverage),
      previousAverageExpense: roundMoney(candidate.previousAverage),
      increasePercent: roundPercent(candidate.increaseRatio),
      currentExpenseCount: candidate.currentSummary.count,
      previousExpenseCount: candidate.previousSummary.count,
      ruleVersion: predictiveAlertsRuleVersion,
    },
  });
}

function detectDormantHighValueCustomer(
  input: PredictiveAlertInput,
  transactions: PredictiveAlertTransaction[],
  generatedAt: Date,
): PredictiveAlertCandidate | null {
  const ninetyDaysAgo = addDays(generatedAt, -90);
  const thirtyDaysAgo = addDays(generatedAt, -30);
  const customerSales = new Map<string, { customerName: string; revenue: number; latestSaleAt: Date }>();

  for (const transaction of transactions) {
    if (normalize(transaction.type) !== "sale" || !transaction.customerId || transaction.occurredAt < ninetyDaysAgo) {
      continue;
    }

    const current = customerSales.get(transaction.customerId) ?? {
      customerName: transaction.customerName ?? "Customer",
      revenue: 0,
      latestSaleAt: transaction.occurredAt,
    };
    current.revenue += cleanAmount(transaction.amount);
    if (transaction.occurredAt > current.latestSaleAt) {
      current.latestSaleAt = transaction.occurredAt;
    }
    customerSales.set(transaction.customerId, current);
  }

  const candidate = Array.from(customerSales.entries())
    .filter(([, customer]) => customer.revenue >= minimumAbsoluteImpact && customer.latestSaleAt < thirtyDaysAgo)
    .sort((left, right) => right[1].revenue - left[1].revenue)[0];

  if (!candidate) {
    return null;
  }

  const [customerId, customer] = candidate;
  const period = { start: ninetyDaysAgo, end: generatedAt, label: "last_90_days" };

  return buildAlert(input, {
    current: period,
    type: "dormant_high_value_customer",
    severity: customer.revenue >= 50_000 ? "warning" : "info",
    confidence: 0.74,
    impactAmount: customer.revenue,
    title: "High-value customer has gone quiet",
    explanation: `${customer.customerName} recorded strong sales in the last 90 days but has no sale in the last 30 days.`,
    recommendedAction: "Consider a reviewed reactivation message or follow-up call if the customer has consented to contact.",
    sourceMetrics: {
      customerId,
      customerName: customer.customerName,
      revenueLast90Days: roundMoney(customer.revenue),
      latestSaleAt: customer.latestSaleAt.toISOString(),
      inactiveDays: daysBetween(customer.latestSaleAt, generatedAt),
      ruleVersion: predictiveAlertsRuleVersion,
    },
  });
}

function detectProductDemandShift(
  input: PredictiveAlertInput,
  transactions: PredictiveAlertTransaction[],
  current: Period,
  previous: Period,
): PredictiveAlertCandidate | null {
  const currentDemand = groupProductDemand(transactions, current);
  const previousDemand = groupProductDemand(transactions, previous);
  const shifts = Array.from(previousDemand.entries()).flatMap(([itemId, previousSummary]) => {
    const currentSummary = currentDemand.get(itemId);

    if (!currentSummary || previousSummary.quantity < 3 || currentSummary.quantity < 1) {
      return [];
    }

    const ratio = currentSummary.quantity / previousSummary.quantity;
    const drop = 1 - ratio;
    const surge = ratio - 1;
    const significant = drop >= 0.45 || surge >= 0.8;

    if (!significant) {
      return [];
    }

    return [{
      itemId,
      itemName: currentSummary.itemName || previousSummary.itemName,
      currentQuantity: currentSummary.quantity,
      previousQuantity: previousSummary.quantity,
      ratio,
      shift: drop > surge ? drop : surge,
      direction: drop > surge ? "drop" : "surge",
    }];
  }).sort((left, right) => right.shift - left.shift);
  const shift = shifts[0];

  if (!shift) {
    return null;
  }

  return buildAlert(input, {
    current,
    type: "product_demand_shift",
    severity: shift.shift >= 0.7 ? "warning" : "info",
    confidence: confidenceFromSamples(Math.round(shift.currentQuantity + shift.previousQuantity), shift.shift),
    impactAmount: 0,
    title: "Product demand shifted",
    explanation: `${shift.itemName} demand shows a ${shift.direction} compared with the previous period.`,
    recommendedAction: "Review pricing, stock levels, and customer demand before reordering this product.",
    sourceMetrics: {
      itemId: shift.itemId,
      itemName: shift.itemName,
      currentQuantity: roundQuantity(shift.currentQuantity),
      previousQuantity: roundQuantity(shift.previousQuantity),
      demandRatio: roundPercent(shift.ratio),
      direction: shift.direction,
      ruleVersion: predictiveAlertsRuleVersion,
    },
  });
}

function detectPotentialCashShortage(input: PredictiveAlertInput): PredictiveAlertCandidate | null {
  const latestShortage = (input.cashflowForecasts ?? [])
    .filter((forecast) => forecast.forecastEndingCash < 0 || forecast.lowerBound < 0)
    .sort((left, right) => left.horizonDays - right.horizonDays || right.generatedAt.getTime() - left.generatedAt.getTime())[0];

  if (!latestShortage) {
    return null;
  }

  const shortageAmount = Math.abs(Math.min(latestShortage.forecastEndingCash, latestShortage.lowerBound));

  return buildAlert(input, {
    current: {
      start: latestShortage.forecastStart,
      end: latestShortage.forecastEnd,
      label: `${latestShortage.horizonDays}_day_forecast`,
    },
    type: "potential_cash_shortage",
    severity: latestShortage.forecastEndingCash < 0 ? "critical" : "warning",
    confidence: confidenceFromForecast(latestShortage.confidence),
    impactAmount: shortageAmount,
    title: "Potential cash shortage",
    explanation: `The latest ${latestShortage.horizonDays} day cashflow forecast projects cash could fall below zero.`,
    recommendedAction: "Review expected customer collections and upcoming supplier obligations before new expenses.",
    sourceMetrics: {
      forecastSnapshotId: latestShortage.id,
      horizonDays: latestShortage.horizonDays,
      confidence: latestShortage.confidence,
      forecastEndingCash: roundMoney(latestShortage.forecastEndingCash),
      lowerBound: roundMoney(latestShortage.lowerBound),
      shortageAmount: roundMoney(shortageAmount),
      ruleVersion: predictiveAlertsRuleVersion,
    },
  });
}

function buildAlert(
  input: PredictiveAlertInput,
  alert: Omit<PredictiveAlertCandidate, "alertKey" | "sourcePeriodStart" | "sourcePeriodEnd"> & {
    current: Period;
  },
): PredictiveAlertCandidate {
  return {
    alertKey: [
      predictiveAlertsRuleVersion,
      alert.type,
      input.locationId ?? "business",
      dateKey(alert.current.start),
      dateKey(alert.current.end),
      keyMetric(alert.sourceMetrics),
    ].join(":"),
    type: alert.type,
    severity: alert.severity,
    confidence: clamp(roundQuantity(alert.confidence), 0, 1),
    impactAmount: roundMoney(alert.impactAmount),
    title: alert.title,
    explanation: alert.explanation,
    recommendedAction: alert.recommendedAction,
    sourcePeriodStart: alert.current.start.toISOString(),
    sourcePeriodEnd: alert.current.end.toISOString(),
    sourceMetrics: {
      ...alert.sourceMetrics,
      periodLabel: alert.current.label,
      locationScoped: Boolean(input.locationId),
    },
  };
}

function summarizeTransactions(
  transactions: PredictiveAlertTransaction[],
  type: "sale" | "expense",
  period: Period,
) {
  const scoped = transactions.filter((transaction) => normalize(transaction.type) === type && inPeriod(transaction.occurredAt, period));

  return {
    count: scoped.length,
    amount: roundMoney(sumBy(scoped, (transaction) => transaction.amount)),
  };
}

function summarizeDiscounts(transactions: PredictiveAlertTransaction[]) {
  let totalDiscount = 0;
  let discountedLineCount = 0;
  let maxLineDiscountShare = 0;

  for (const transaction of transactions) {
    for (const line of parseInvoiceLines(transaction.invoiceItems)) {
      if (line.discount <= 0) {
        continue;
      }

      const gross = line.unitPrice * line.quantity;
      totalDiscount += line.discount;
      discountedLineCount += 1;
      if (gross > 0) {
        maxLineDiscountShare = Math.max(maxLineDiscountShare, line.discount / gross);
      }
    }
  }

  return {
    totalDiscount: roundMoney(totalDiscount),
    discountedLineCount,
    maxLineDiscountShare,
  };
}

function groupSupplierExpenses(transactions: PredictiveAlertTransaction[], period: Period) {
  const grouped = new Map<string, { supplierName: string; amount: number; count: number }>();

  for (const transaction of transactions) {
    if (normalize(transaction.type) !== "expense" || !transaction.supplierId || !inPeriod(transaction.occurredAt, period)) {
      continue;
    }

    const current = grouped.get(transaction.supplierId) ?? {
      supplierName: transaction.supplierName ?? "Supplier",
      amount: 0,
      count: 0,
    };
    current.amount += cleanAmount(transaction.amount);
    current.count += 1;
    grouped.set(transaction.supplierId, current);
  }

  return grouped;
}

function groupProductDemand(transactions: PredictiveAlertTransaction[], period: Period) {
  const grouped = new Map<string, { itemName: string; quantity: number }>();

  for (const transaction of transactions) {
    if (normalize(transaction.type) !== "sale" || !inPeriod(transaction.occurredAt, period)) {
      continue;
    }

    const invoiceLines = parseInvoiceLines(transaction.invoiceItems);
    const lines = invoiceLines.length > 0
      ? invoiceLines
      : transaction.inventoryItemId
        ? [
            {
              inventoryItemId: transaction.inventoryItemId,
              name: transaction.productName ?? "Product",
              quantity: cleanAmount(transaction.inventoryQuantity ?? 1),
              unitPrice: cleanAmount(transaction.amount),
              discount: 0,
              total: cleanAmount(transaction.amount),
            },
          ]
        : [];

    for (const line of lines) {
      if (!line.inventoryItemId || line.quantity <= 0) {
        continue;
      }

      const current = grouped.get(line.inventoryItemId) ?? {
        itemName: line.name ?? transaction.productName ?? "Product",
        quantity: 0,
      };
      current.quantity += cleanAmount(line.quantity);
      grouped.set(line.inventoryItemId, current);
    }
  }

  return grouped;
}

function parseInvoiceLines(value: unknown): InvoiceLine[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const candidate = item as Record<string, unknown>;
    const quantity = cleanAmount(Number(candidate.quantity));
    const unitPrice = cleanAmount(Number(candidate.unitPrice));
    const discount = cleanAmount(Number(candidate.discount));
    const total = cleanAmount(Number(candidate.total));

    if (quantity <= 0) {
      return [];
    }

    return [{
      inventoryItemId: typeof candidate.inventoryItemId === "string" ? candidate.inventoryItemId : undefined,
      name: typeof candidate.name === "string" ? candidate.name : undefined,
      quantity,
      unitPrice,
      discount,
      total,
    }];
  });
}

function compareAlertPriority(left: PredictiveAlertCandidate, right: PredictiveAlertCandidate) {
  const severityRank: Record<PredictiveAlertSeverity, number> = { critical: 3, warning: 2, info: 1 };
  const severityDelta = severityRank[right.severity] - severityRank[left.severity];

  if (severityDelta !== 0) {
    return severityDelta;
  }

  const impactDelta = right.impactAmount - left.impactAmount;

  if (impactDelta !== 0) {
    return impactDelta;
  }

  return right.confidence - left.confidence;
}

function keyMetric(metrics: Record<string, number | string | boolean | null>) {
  const idMetric = ["sampleTransactionId", "refundId", "customerId", "supplierId", "itemId", "forecastSnapshotId"]
    .map((key) => metrics[key])
    .find((value) => typeof value === "string");

  if (idMetric) {
    return String(idMetric).slice(0, 32);
  }

  return String(metrics.ruleVersion ?? "summary");
}

function confidenceFromSamples(sampleCount: number, signalStrength: number) {
  const sampleConfidence = Math.min(0.4, sampleCount / 40);
  const signalConfidence = Math.min(0.45, Math.max(0, signalStrength) * 0.45);

  return 0.25 + sampleConfidence + signalConfidence;
}

function confidenceFromForecast(confidence: string) {
  return {
    high: 0.82,
    medium: 0.68,
    low: 0.52,
    insufficient_data: 0.35,
  }[normalize(confidence)] ?? 0.45;
}

function sumBy<T>(items: T[], getValue: (item: T) => number) {
  return items.reduce((sum, item) => sum + cleanAmount(getValue(item)), 0);
}

function sumAmounts(transactions: PredictiveAlertTransaction[]) {
  return sumBy(transactions, (transaction) => transaction.amount);
}

function sumRefunds(returns: PredictiveAlertReturn[]) {
  return sumBy(returns, (item) => item.refundAmount);
}

function sumDebtOutstanding(debts: PredictiveAlertDebt[]) {
  return roundMoney(debts.reduce((sum, debt) => sum + Math.max(0, cleanAmount(debt.amount) - cleanAmount(debt.paidAmount)), 0));
}

function inPeriod(date: Date, period: Period) {
  return date >= period.start && date < period.end;
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * dayMs);
}

function daysBetween(start: Date, end: Date) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / dayMs));
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function cleanAmount(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function roundMoney(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function roundQuantity(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function roundPercent(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 10_000) / 100;
}

function formatPercent(value: number) {
  return `${roundPercent(value)}%`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
