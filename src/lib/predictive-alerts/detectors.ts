import {
  defaultPredictiveAlertRules,
  predictiveAlertsRuleVersion,
  type BusinessAlertPreferenceInput,
  type PredictiveAlertCandidate,
  type PredictiveAlertInput,
  type PredictiveAlertInventorySignal,
  type PredictiveAlertRuleDefinition,
  type PredictiveAlertSeverity,
  type PredictiveAlertTransactionSignal,
} from "@/lib/predictive-alerts/definitions";
import { buildPredictiveAlertDedupeKey } from "@/lib/predictive-alerts/deduplication";
import {
  buildPredictiveAlertEvidence,
  deterministicExplanation,
} from "@/lib/predictive-alerts/explanations";

const dayMs = 86_400_000;

type Period = {
  label: string;
  start: Date;
  end: Date;
  comparisonStart: Date;
  comparisonEnd: Date;
};

type DetectorContext = {
  input: PredictiveAlertInput;
  generatedAt: Date;
  period: Period;
  activeTransactions: PredictiveAlertTransactionSignal[];
  preferences: Map<string, BusinessAlertPreferenceInput>;
};

export function detectPredictiveAlerts(input: PredictiveAlertInput): PredictiveAlertCandidate[] {
  const generatedAt = input.generatedAt ?? new Date();
  const periodDays = Math.max(14, Math.min(30, Math.round(input.periodDays ?? 30)));
  const period: Period = {
    label: `last_${periodDays}_days`,
    start: addDays(generatedAt, -periodDays),
    end: generatedAt,
    comparisonStart: addDays(generatedAt, -periodDays * 2),
    comparisonEnd: addDays(generatedAt, -periodDays),
  };
  const context: DetectorContext = {
    input,
    generatedAt,
    period,
    activeTransactions: input.transactions
      .filter((transaction) => !transaction.reversed)
      .filter((transaction) => toDate(transaction.occurredAt) < generatedAt),
    preferences: new Map((input.preferences ?? []).map((preference) => [preference.ruleKey, preference])),
  };
  const candidates = [
    detectSalesDecline(context),
    detectExpenseSpike(context),
    detectReceivablesConcentration(context),
    detectOverdueDebtIncrease(context),
    detectSupplierPaymentPressure(context),
    detectLowStockRisk(context),
    detectStockOutForecast(context),
    detectSlowMovingStock(context),
    detectReconciliationBacklog(context),
    detectDuplicateImportRisk(context),
    detectTaxReadinessGap(context),
    detectMissingDataRisk(context),
    detectStaffAttributionAnomaly(context),
    detectCashPressureIndicator(context),
    detectSubscriptionSetupRisk(context),
  ].flatMap((candidate) => (candidate ? [candidate] : []));

  return candidates.sort(compareAlertPriority);
}

function detectSalesDecline(context: DetectorContext) {
  const rule = getRule("sales_decline");
  const thresholds = thresholdsFor(context, rule);
  const current = summarizeTransactions(context.activeTransactions, "sale", context.period.start, context.period.end);
  const previous = summarizeTransactions(context.activeTransactions, "sale", context.period.comparisonStart, context.period.comparisonEnd);
  const minimumTransactions = numberThreshold(thresholds, "minimumTransactions");
  const minimumPreviousSales = numberThreshold(thresholds, "minimumPreviousSales");
  const minimumDropAmount = numberThreshold(thresholds, "minimumDropAmount");
  const dropPercentThreshold = numberThreshold(thresholds, "dropPercent") / 100;

  if (current.count < minimumTransactions || previous.count < minimumTransactions || previous.amount < minimumPreviousSales) {
    return null;
  }

  const dropAmount = previous.amount - current.amount;
  const dropPercent = previous.amount > 0 ? dropAmount / previous.amount : 0;

  if (dropAmount < minimumDropAmount || dropPercent < dropPercentThreshold) {
    return null;
  }

  return candidate(context, rule, {
    severity: dropPercent >= 0.55 ? "critical" : "high",
    impactAmount: dropAmount,
    confidence: confidenceFromSamples(current.count + previous.count, dropPercent),
    entityKey: "sales",
    title: "Recorded sales declined",
    explanation: `Recorded sales decreased by ${formatPercent(dropPercent)} compared with the previous ${daysBetween(context.period.comparisonStart, context.period.comparisonEnd)} days.`,
    recommendedAction: "Review recent sales, stock availability, customer activity, and pricing before making operational changes.",
    metricValues: {
      currentSales: roundMoney(current.amount),
      previousSales: roundMoney(previous.amount),
      dropAmount: roundMoney(dropAmount),
      dropPercent: roundPercent(dropPercent),
      currentTransactionCount: current.count,
      previousTransactionCount: previous.count,
    },
    threshold: thresholds,
  });
}

function detectExpenseSpike(context: DetectorContext) {
  const rule = getRule("expense_spike");
  const thresholds = thresholdsFor(context, rule);
  const current = summarizeTransactions(context.activeTransactions, "expense", context.period.start, context.period.end);
  const previous = summarizeTransactions(context.activeTransactions, "expense", context.period.comparisonStart, context.period.comparisonEnd);
  const minimumTransactions = numberThreshold(thresholds, "minimumTransactions");
  const minimumIncreaseAmount = numberThreshold(thresholds, "minimumIncreaseAmount");
  const increasePercentThreshold = numberThreshold(thresholds, "increasePercent") / 100;

  if (current.count < minimumTransactions || current.amount < minimumIncreaseAmount) {
    return null;
  }

  const baseline = previous.amount > 0 ? previous.amount : current.amount / 2;
  const increaseAmount = current.amount - baseline;
  const increasePercent = baseline > 0 ? increaseAmount / baseline : 0;

  if (increaseAmount < minimumIncreaseAmount || increasePercent < increasePercentThreshold) {
    return null;
  }

  const categories = groupTransactions(context.activeTransactions, "expense", context.period.start, context.period.end, "category");
  const topCategory = categories[0];

  return candidate(context, rule, {
    severity: increasePercent >= 1 ? "high" : "medium",
    impactAmount: increaseAmount,
    confidence: confidenceFromSamples(current.count + previous.count, increasePercent),
    entityKey: topCategory?.key ?? "expenses",
    title: "Expenses increased quickly",
    explanation: `Recorded expenses increased by ${formatPercent(increasePercent)} against the comparison period${topCategory ? `, mainly from ${topCategory.label}` : ""}.`,
    recommendedAction: "Review large categories and supplier bills before approving more spending.",
    metricValues: {
      currentExpenses: roundMoney(current.amount),
      previousExpenses: roundMoney(previous.amount),
      increaseAmount: roundMoney(increaseAmount),
      increasePercent: roundPercent(increasePercent),
      currentExpenseCount: current.count,
      previousExpenseCount: previous.count,
      topCategory: topCategory?.label ?? "Uncategorized",
      topCategoryAmount: roundMoney(topCategory?.amount ?? 0),
    },
    threshold: thresholds,
  });
}

function detectReceivablesConcentration(context: DetectorContext) {
  const rule = getRule("receivables_concentration");
  const thresholds = thresholdsFor(context, rule);
  const openCustomerDebts = context.input.debts.filter((debt) =>
    normalize(debt.type) === "customer_owes_business" && normalize(debt.status) === "open",
  );
  const totalDebt = openCustomerDebts.reduce((sum, debt) => sum + remainingDebt(debt), 0);
  const minimumDebtAmount = numberThreshold(thresholds, "minimumDebtAmount");
  const concentrationThreshold = numberThreshold(thresholds, "concentrationPercent") / 100;

  if (totalDebt < minimumDebtAmount) {
    return null;
  }

  const top = Array.from(groupDebts(openCustomerDebts, "customer").values()).sort((left, right) => right.amount - left.amount)[0];
  const concentration = top ? top.amount / totalDebt : 0;

  if (!top || concentration < concentrationThreshold || top.amount < minimumDebtAmount) {
    return null;
  }

  return candidate(context, rule, {
    severity: concentration >= 0.7 ? "high" : "medium",
    impactAmount: top.amount,
    confidence: confidenceFromSamples(openCustomerDebts.length, concentration),
    entityKey: top.id,
    title: "Customer debt is concentrated",
    explanation: `${top.name} represents ${formatPercent(concentration)} of open customer debt.`,
    recommendedAction: "Review this customer's payment plan before offering new deferred-payment terms.",
    metricValues: {
      customerName: top.name,
      customerDebt: roundMoney(top.amount),
      totalCustomerDebt: roundMoney(totalDebt),
      concentrationPercent: roundPercent(concentration),
      openDebtCount: openCustomerDebts.length,
    },
    threshold: thresholds,
  });
}

function detectOverdueDebtIncrease(context: DetectorContext) {
  const rule = getRule("overdue_debt_increase");
  const thresholds = thresholdsFor(context, rule);
  const openCustomerDebts = context.input.debts.filter((debt) =>
    normalize(debt.type) === "customer_owes_business" && normalize(debt.status) === "open" && isOverdue(debt.dueAt, context.generatedAt),
  );
  const currentOverdue = openCustomerDebts
    .filter((debt) => inPeriod(debt.createdAt ?? debt.dueAt, context.period.start, context.period.end) || toDate(debt.dueAt ?? context.generatedAt) < context.period.end)
    .reduce((sum, debt) => sum + remainingDebt(debt), 0);
  const comparisonOverdue = openCustomerDebts
    .filter((debt) => inPeriod(debt.createdAt ?? debt.dueAt, context.period.comparisonStart, context.period.comparisonEnd))
    .reduce((sum, debt) => sum + remainingDebt(debt), 0);
  const minimumOverdueAmount = numberThreshold(thresholds, "minimumOverdueAmount");
  const minimumIncreaseAmount = numberThreshold(thresholds, "minimumIncreaseAmount");
  const increasePercentThreshold = numberThreshold(thresholds, "increasePercent") / 100;
  const increaseAmount = currentOverdue - comparisonOverdue;
  const increasePercent = comparisonOverdue > 0 ? increaseAmount / comparisonOverdue : currentOverdue > 0 ? 1 : 0;

  if (currentOverdue < minimumOverdueAmount) {
    return null;
  }

  if (comparisonOverdue > 0 && (increaseAmount < minimumIncreaseAmount || increasePercent < increasePercentThreshold)) {
    return null;
  }

  return candidate(context, rule, {
    severity: currentOverdue >= 100_000 || increasePercent >= 0.75 ? "high" : "medium",
    impactAmount: currentOverdue,
    confidence: confidenceFromSamples(openCustomerDebts.length, Math.max(0.35, increasePercent)),
    entityKey: "overdue_customer_debt",
    title: "Overdue customer debt needs review",
    explanation: `Overdue customer debt is ${formatMoney(currentOverdue)}${comparisonOverdue > 0 ? `, up ${formatPercent(increasePercent)} against the comparison period` : ""}.`,
    recommendedAction: "Review overdue balances and contact customers manually where consent and relationship context support it.",
    metricValues: {
      currentOverdueDebt: roundMoney(currentOverdue),
      comparisonOverdueDebt: roundMoney(comparisonOverdue),
      increaseAmount: roundMoney(Math.max(0, increaseAmount)),
      increasePercent: roundPercent(Math.max(0, increasePercent)),
      overdueDebtCount: openCustomerDebts.length,
    },
    threshold: thresholds,
  });
}

function detectSupplierPaymentPressure(context: DetectorContext) {
  const rule = getRule("supplier_payment_pressure");
  const thresholds = thresholdsFor(context, rule);
  const dueSoonDays = numberThreshold(thresholds, "dueSoonDays");
  const minimumSupplierObligations = numberThreshold(thresholds, "minimumSupplierObligations");
  const openSupplierDebts = context.input.debts.filter((debt) =>
    normalize(debt.type) === "business_owes_supplier" && normalize(debt.status) === "open",
  );
  const dueBoundary = addDays(context.generatedAt, dueSoonDays);
  const pressureDebts = openSupplierDebts.filter((debt) => {
    const dueAt = debt.dueAt ? toDate(debt.dueAt) : null;
    return dueAt && dueAt <= dueBoundary;
  });
  const pressureAmount = pressureDebts.reduce((sum, debt) => sum + remainingDebt(debt), 0);

  if (pressureAmount < minimumSupplierObligations) {
    return null;
  }

  const top = Array.from(groupDebts(pressureDebts, "supplier").values()).sort((left, right) => right.amount - left.amount)[0];

  return candidate(context, rule, {
    severity: pressureAmount >= 100_000 ? "high" : "medium",
    impactAmount: pressureAmount,
    confidence: confidenceFromSamples(pressureDebts.length, 0.6),
    entityKey: top?.id ?? "suppliers",
    title: "Supplier payments are due soon",
    explanation: `${formatMoney(pressureAmount)} in supplier obligations is overdue or due within ${dueSoonDays} days.`,
    recommendedAction: "Review supplier bills and payment timing before making new purchase commitments.",
    metricValues: {
      supplierObligationsDueSoon: roundMoney(pressureAmount),
      affectedSupplierCount: new Set(pressureDebts.map((debt) => debt.supplierId ?? debt.supplierName ?? "supplier")).size,
      topSupplier: top?.name ?? "Supplier",
      topSupplierAmount: roundMoney(top?.amount ?? 0),
    },
    threshold: thresholds,
  });
}

function detectLowStockRisk(context: DetectorContext) {
  const rule = getRule("low_stock_risk");
  const thresholds = thresholdsFor(context, rule);
  const minimumStockValue = numberThreshold(thresholds, "minimumStockValue");
  const lowStock = context.input.inventoryItems
    .map((item) => ({ item, value: item.quantityOnHand * item.costPrice }))
    .filter(({ item, value }) => item.quantityOnHand <= item.lowStockLevel && value >= minimumStockValue)
    .sort((left, right) => right.value - left.value);

  if (!lowStock.length) {
    return null;
  }

  const top = lowStock[0];
  const totalValue = lowStock.reduce((sum, item) => sum + item.value, 0);

  return candidate(context, rule, {
    severity: lowStock.length >= 5 || totalValue >= 75_000 ? "high" : "medium",
    impactAmount: totalValue,
    confidence: confidenceFromSamples(lowStock.length, 0.7),
    entityKey: top.item.id,
    title: "Low stock needs review",
    explanation: `${lowStock.length} item(s) are at or below reorder level, led by ${top.item.name}.`,
    recommendedAction: "Review current demand, supplier lead times, and reorder quantities before purchasing.",
    metricValues: {
      lowStockItemCount: lowStock.length,
      topItem: top.item.name,
      topItemQuantity: top.item.quantityOnHand,
      topItemLowStockLevel: top.item.lowStockLevel,
      estimatedStockValueAtRisk: roundMoney(totalValue),
    },
    threshold: thresholds,
  });
}

function detectStockOutForecast(context: DetectorContext) {
  const rule = getRule("stock_out_forecast");
  const thresholds = thresholdsFor(context, rule);
  const forecastDays = numberThreshold(thresholds, "forecastDays");
  const minimumSalesQuantity = numberThreshold(thresholds, "minimumSalesQuantity");
  const currentSales = context.activeTransactions.filter((transaction) =>
    normalize(transaction.type) === "sale" && inPeriod(transaction.occurredAt, context.period.start, context.period.end) && transaction.inventoryItemId,
  );
  const velocityByItem = new Map<string, number>();

  for (const sale of currentSales) {
    velocityByItem.set(sale.inventoryItemId!, (velocityByItem.get(sale.inventoryItemId!) ?? 0) + Math.max(0, sale.inventoryQuantity ?? 0));
  }

  const risks = context.input.inventoryItems.flatMap((item) => {
    const soldQuantity = velocityByItem.get(item.id) ?? 0;
    const dailyVelocity = soldQuantity / Math.max(1, daysBetween(context.period.start, context.period.end));
    const daysRemaining = dailyVelocity > 0 ? item.quantityOnHand / dailyVelocity : Number.POSITIVE_INFINITY;

    if (soldQuantity < minimumSalesQuantity || daysRemaining > forecastDays) {
      return [];
    }

    return [{ item, soldQuantity, dailyVelocity, daysRemaining }];
  }).sort((left, right) => left.daysRemaining - right.daysRemaining);

  if (!risks.length) {
    return null;
  }

  const top = risks[0];

  return candidate(context, rule, {
    severity: top.daysRemaining <= 3 ? "critical" : "high",
    impactAmount: top.item.quantityOnHand * top.item.sellingPrice,
    confidence: confidenceFromSamples(Math.round(top.soldQuantity), 0.75),
    entityKey: top.item.id,
    title: "Stock-out risk detected",
    explanation: `${top.item.name} may run out in about ${Math.ceil(top.daysRemaining)} day(s) at recent sales velocity.`,
    recommendedAction: "Review physical stock, supplier timing, and reorder level before promising availability.",
    metricValues: {
      itemName: top.item.name,
      quantityOnHand: top.item.quantityOnHand,
      soldQuantityInPeriod: top.soldQuantity,
      dailySalesVelocity: roundNumber(top.dailyVelocity),
      estimatedDaysRemaining: roundNumber(top.daysRemaining),
      affectedItemCount: risks.length,
    },
    threshold: thresholds,
  });
}

function detectSlowMovingStock(context: DetectorContext) {
  const rule = getRule("slow_moving_stock");
  const thresholds = thresholdsFor(context, rule);
  const minimumStockValue = numberThreshold(thresholds, "minimumStockValue");
  const lookbackDays = numberThreshold(thresholds, "lookbackDays");
  const lookbackStart = addDays(context.generatedAt, -lookbackDays);
  const soldItemIds = new Set(
    context.activeTransactions
      .filter((transaction) => normalize(transaction.type) === "sale" && inPeriod(transaction.occurredAt, lookbackStart, context.generatedAt))
      .map((transaction) => transaction.inventoryItemId)
      .filter(Boolean),
  );
  const slowItems = context.input.inventoryItems
    .map((item) => ({ item, value: item.quantityOnHand * item.costPrice }))
    .filter(({ item, value }) => item.quantityOnHand > 0 && value >= minimumStockValue && !soldItemIds.has(item.id))
    .sort((left, right) => right.value - left.value);

  if (!slowItems.length) {
    return null;
  }

  const totalValue = slowItems.reduce((sum, item) => sum + item.value, 0);

  return candidate(context, rule, {
    severity: totalValue >= 100_000 ? "medium" : "low",
    impactAmount: totalValue,
    confidence: confidenceFromSamples(slowItems.length, 0.55),
    entityKey: slowItems[0].item.id,
    title: "Slow-moving stock needs review",
    explanation: `${slowItems.length} high-value item(s) have stock on hand but no recorded sale in the last ${lookbackDays} days.`,
    recommendedAction: "Review pricing, display, expiry risk, and reorder decisions for these items.",
    metricValues: {
      slowMovingItemCount: slowItems.length,
      topItem: slowItems[0].item.name,
      topItemValue: roundMoney(slowItems[0].value),
      totalSlowMovingValue: roundMoney(totalValue),
      lookbackDays,
    },
    threshold: thresholds,
  });
}

function detectReconciliationBacklog(context: DetectorContext) {
  const rule = getRule("reconciliation_backlog");
  const thresholds = thresholdsFor(context, rule);
  const rows = context.input.bankRows.filter((row) => inPeriod(row.postedAt, context.period.start, context.period.end));
  const unresolved = rows.filter((row) => ["unmatched", "suggested"].includes(normalize(row.status)));
  const unresolvedAmount = unresolved.reduce((sum, row) => sum + Math.abs(row.amount), 0);
  const oldestAgeDays = unresolved.reduce((age, row) => Math.max(age, daysBetween(toDate(row.postedAt), context.generatedAt)), 0);

  if (
    unresolved.length < numberThreshold(thresholds, "minimumUnresolvedRows") &&
    unresolvedAmount < numberThreshold(thresholds, "minimumUnresolvedAmount") &&
    oldestAgeDays < numberThreshold(thresholds, "minimumAgeDays")
  ) {
    return null;
  }

  return candidate(context, rule, {
    severity: unresolvedAmount >= 150_000 || oldestAgeDays >= 14 ? "high" : "medium",
    impactAmount: unresolvedAmount,
    confidence: confidenceFromSamples(rows.length, unresolved.length / Math.max(1, rows.length)),
    entityKey: "bank_backlog",
    title: "Bank reconciliation backlog",
    explanation: `${unresolved.length} imported bank row(s) remain unresolved, totalling ${formatMoney(unresolvedAmount)}.`,
    recommendedAction: "Open Bank Reconciliation and review unmatched rows before relying on cash movement reports.",
    disclaimer: "Imported bank rows are not a live bank balance.",
    metricValues: {
      unresolvedRows: unresolved.length,
      unresolvedAmount: roundMoney(unresolvedAmount),
      importedRowCount: rows.length,
      oldestUnresolvedAgeDays: oldestAgeDays,
    },
    threshold: thresholds,
  });
}

function detectDuplicateImportRisk(context: DetectorContext) {
  const rule = getRule("duplicate_import_risk");
  const thresholds = thresholdsFor(context, rule);
  const rows = context.input.bankRows.filter((row) => inPeriod(row.postedAt, context.period.start, context.period.end));
  const duplicates = rows.filter((row) => normalize(row.status) === "duplicate" || normalize(row.duplicateStatus) !== "unique");
  const duplicateAmount = duplicates.reduce((sum, row) => sum + Math.abs(row.amount), 0);

  if (
    duplicates.length < numberThreshold(thresholds, "minimumDuplicateRows") &&
    duplicateAmount < numberThreshold(thresholds, "minimumDuplicateAmount")
  ) {
    return null;
  }

  return candidate(context, rule, {
    severity: duplicateAmount >= 75_000 ? "high" : "medium",
    impactAmount: duplicateAmount,
    confidence: confidenceFromSamples(duplicates.length, 0.82),
    entityKey: "duplicate_bank_rows",
    title: "Duplicate bank entries need review",
    explanation: `${duplicates.length} imported bank row(s) are marked duplicate or probable duplicate.`,
    recommendedAction: "Review duplicate imported rows and keep the reconciliation audit trail before ignoring entries.",
    metricValues: {
      duplicateRows: duplicates.length,
      duplicateAmount: roundMoney(duplicateAmount),
      importedRowCount: rows.length,
    },
    threshold: thresholds,
  });
}

function detectTaxReadinessGap(context: DetectorContext) {
  const rule = getRule("tax_readiness_gap");
  const thresholds = thresholdsFor(context, rule);
  const openItems = context.input.taxReviewItems.filter((item) => !["resolved", "reviewed", "closed"].includes(normalize(item.status)));
  const criticalItems = openItems.filter((item) => ["critical", "high"].includes(normalize(item.severity)));

  if (openItems.length < numberThreshold(thresholds, "minimumOpenItems") && criticalItems.length === 0) {
    return null;
  }

  return candidate(context, rule, {
    severity: criticalItems.length > 0 ? "high" : "medium",
    impactAmount: 0,
    confidence: confidenceFromSamples(openItems.length, criticalItems.length ? 0.75 : 0.55),
    entityKey: "tax_review",
    title: "Tax-readiness items need review",
    explanation: `${openItems.length} Tax Assistant review item(s) remain open.`,
    recommendedAction: "Open Tax Assistant and review missing receipts, classifications, WHT, and VAT setup before filing decisions.",
    disclaimer: "Tax readiness is deterministic support information, not a filed tax return.",
    metricValues: {
      openTaxReviewItems: openItems.length,
      criticalTaxReviewItems: criticalItems.length,
      topIssueType: openItems[0]?.issueType ?? "setup",
    },
    threshold: thresholds,
  });
}

function detectMissingDataRisk(context: DetectorContext) {
  const rule = getRule("missing_data_risk");
  const thresholds = thresholdsFor(context, rule);
  const transactions = context.activeTransactions.filter((transaction) =>
    ["sale", "expense"].includes(normalize(transaction.type)) && inPeriod(transaction.occurredAt, context.period.start, context.period.end),
  );
  const totalAmount = transactions.reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
  const missingTransactions = transactions.filter((transaction) => {
    const type = normalize(transaction.type);
    return !transaction.category ||
      (type === "sale" && normalize(transaction.paymentStatus ?? "") !== "paid" && !transaction.customerId) ||
      (type === "expense" && !transaction.supplierId);
  });
  const missingAmount = missingTransactions.reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
  const missingShare = totalAmount > 0 ? missingAmount / totalAmount : 0;

  if (missingAmount < numberThreshold(thresholds, "minimumAmount") || missingShare < numberThreshold(thresholds, "missingDataPercent") / 100) {
    return null;
  }

  return candidate(context, rule, {
    severity: missingShare >= 0.5 ? "high" : "medium",
    impactAmount: missingAmount,
    confidence: confidenceFromSamples(missingTransactions.length, missingShare),
    entityKey: "missing_transaction_data",
    title: "Missing data may weaken alerts",
    explanation: `${formatPercent(missingShare)} of recorded sale/expense value in this period is missing category, customer, or supplier detail.`,
    recommendedAction: "Complete categories and counterparties before using alerts for owner decisions.",
    metricValues: {
      missingDataAmount: roundMoney(missingAmount),
      totalRecordedAmount: roundMoney(totalAmount),
      missingDataPercent: roundPercent(missingShare),
      affectedTransactionCount: missingTransactions.length,
    },
    missingData: ["Some transactions are missing category, customer, or supplier detail."],
    threshold: thresholds,
  });
}

function detectStaffAttributionAnomaly(context: DetectorContext) {
  const rule = getRule("staff_attribution_anomaly");
  const thresholds = thresholdsFor(context, rule);
  const signal = context.input.staffAttribution;

  if (!signal || signal.totalActivityCount < numberThreshold(thresholds, "minimumTransactions")) {
    return null;
  }

  const unattributedShare = signal.unattributedActivityCount / Math.max(1, signal.totalActivityCount);

  if (unattributedShare < numberThreshold(thresholds, "minimumUnattributedPercent") / 100) {
    return null;
  }

  return candidate(context, rule, {
    severity: unattributedShare >= 0.75 ? "medium" : "low",
    impactAmount: Math.max(0, signal.totalSalesAmount - signal.attributedSalesAmount),
    confidence: confidenceFromSamples(signal.totalActivityCount, unattributedShare),
    entityKey: "staff_attribution",
    title: "Staff attribution is incomplete",
    explanation: `${formatPercent(unattributedShare)} of operational activity lacks reliable staff attribution.`,
    recommendedAction: "Review Staff Performance data quality and audit logs before using staff activity summaries.",
    disclaimer: "This is an operational attribution signal, not an employment decision.",
    metricValues: {
      totalActivityCount: signal.totalActivityCount,
      attributedActivityCount: signal.attributedActivityCount,
      unattributedActivityCount: signal.unattributedActivityCount,
      unattributedPercent: roundPercent(unattributedShare),
      totalSalesAmount: roundMoney(signal.totalSalesAmount),
      attributedSalesAmount: roundMoney(signal.attributedSalesAmount),
    },
    missingData: signal.dataQualityNotes,
    threshold: thresholds,
  });
}

function detectCashPressureIndicator(context: DetectorContext) {
  const rule = getRule("cash_pressure_indicator");
  const thresholds = thresholdsFor(context, rule);
  const sales = context.activeTransactions.filter((transaction) =>
    normalize(transaction.type) === "sale" && inPeriod(transaction.occurredAt, context.period.start, context.period.end),
  );
  const expenses = context.activeTransactions.filter((transaction) =>
    normalize(transaction.type) === "expense" && inPeriod(transaction.occurredAt, context.period.start, context.period.end),
  );
  const paidInflows = sales
    .filter((transaction) => normalize(transaction.paymentStatus ?? "paid") === "paid")
    .reduce((sum, transaction) => sum + Math.max(0, transaction.amount), 0);
  const recordedOutflows = expenses.reduce((sum, transaction) => sum + Math.max(0, transaction.amount), 0);
  const supplierObligations = context.input.debts
    .filter((debt) => normalize(debt.type) === "business_owes_supplier" && normalize(debt.status) === "open")
    .reduce((sum, debt) => sum + remainingDebt(debt), 0);
  const overdueReceivables = context.input.debts
    .filter((debt) => normalize(debt.type) === "customer_owes_business" && normalize(debt.status) === "open" && isOverdue(debt.dueAt, context.generatedAt))
    .reduce((sum, debt) => sum + remainingDebt(debt), 0);
  const pressureAmount = recordedOutflows + supplierObligations - paidInflows - overdueReceivables * 0.25;

  if (pressureAmount < numberThreshold(thresholds, "minimumPressureAmount")) {
    return null;
  }

  return candidate(context, rule, {
    severity: pressureAmount >= 150_000 ? "critical" : "high",
    impactAmount: pressureAmount,
    confidence: confidenceFromSamples(sales.length + expenses.length + context.input.debts.length, 0.6),
    entityKey: "cash_pressure",
    title: "Cash-flow pressure indicator",
    explanation: "Recorded outflows and supplier obligations exceed recorded paid inflows after applying a conservative receivables credit.",
    recommendedAction: "Review incoming collections, supplier payment timing, and bank reconciliation before making payment commitments.",
    disclaimer: "This is an operational indicator, not a bank balance forecast or credit decision.",
    metricValues: {
      paidInflows: roundMoney(paidInflows),
      recordedOutflows: roundMoney(recordedOutflows),
      supplierObligations: roundMoney(supplierObligations),
      overdueReceivables: roundMoney(overdueReceivables),
      pressureAmount: roundMoney(pressureAmount),
    },
    threshold: thresholds,
  });
}

function detectSubscriptionSetupRisk(context: DetectorContext) {
  const rule = getRule("subscription_setup_risk");
  const setup = context.input.setup;

  if (!setup) {
    return null;
  }

  const issues = [
    setup.onboardingCompleted ? null : "Business onboarding is incomplete.",
    setup.hasPredictiveAlertsEntitlement ? null : "The active plan does not include Predictive Alerts.",
    setup.taxProfileConfigured ? null : "Tax profile is not configured.",
    setup.bankImportCount > 0 ? null : "No bank statement imports are available for reconciliation signals.",
  ].filter(Boolean) as string[];

  if (!issues.length) {
    return null;
  }

  return candidate(context, rule, {
    severity: issues.length >= 2 ? "low" : "information",
    impactAmount: 0,
    confidence: 0.7,
    entityKey: "setup",
    title: "Setup gaps may limit alert quality",
    explanation: "Some setup inputs that improve alert quality are missing.",
    recommendedAction: "Complete setup items before treating Predictive Alerts as comprehensive.",
    metricValues: {
      onboardingCompleted: setup.onboardingCompleted,
      planId: setup.planId,
      hasPredictiveAlertsEntitlement: setup.hasPredictiveAlertsEntitlement,
      taxProfileConfigured: setup.taxProfileConfigured,
      bankImportCount: setup.bankImportCount,
      issueCount: issues.length,
    },
    missingData: issues,
  });
}

function candidate(
  context: DetectorContext,
  rule: PredictiveAlertRuleDefinition,
  options: {
    severity: PredictiveAlertSeverity;
    impactAmount: number;
    confidence: number;
    entityKey: string;
    title: string;
    explanation: string;
    recommendedAction: string;
    metricValues: Record<string, number | string | boolean | null>;
    threshold?: Record<string, number | string | boolean | null>;
    missingData?: string[];
    disclaimer?: string;
  },
): PredictiveAlertCandidate | null {
  const preference = context.preferences.get(rule.key);

  if (preference?.enabled === false) {
    return null;
  }

  const severity = preference?.severityOverride ?? options.severity;
  const dedupeKey = buildPredictiveAlertDedupeKey({
    businessId: context.input.businessId,
    locationId: context.input.locationId,
    ruleKey: rule.key,
    category: rule.category,
    entityKey: options.entityKey,
  });
  const evidence = buildPredictiveAlertEvidence({
    rule,
    whatChanged: options.explanation,
    comparedPeriod: `${context.period.comparisonStart.toISOString()} to ${context.period.comparisonEnd.toISOString()}`,
    metricValues: {
      ...options.metricValues,
      ruleVersion: predictiveAlertsRuleVersion,
    },
    threshold: options.threshold,
    missingData: options.missingData ?? [],
    recommendedReviewAction: options.recommendedAction,
    disclaimer: options.disclaimer,
  });

  return {
    ruleKey: rule.key,
    category: rule.category,
    severity,
    title: options.title,
    explanation: deterministicExplanation(options.explanation),
    recommendedAction: options.recommendedAction,
    evidence,
    period: {
      label: context.period.label,
      start: context.period.start.toISOString(),
      end: context.period.end.toISOString(),
      comparisonStart: context.period.comparisonStart.toISOString(),
      comparisonEnd: context.period.comparisonEnd.toISOString(),
    },
    impactAmount: roundMoney(options.impactAmount),
    confidence: clamp(options.confidence, 0, 1),
    formulaReference: rule.formulaReference,
    dedupeKey,
    sourceMetrics: evidence.metricValues,
    missingData: evidence.missingData,
    delivery: {
      inApp: preference?.inAppEnabled !== false,
      email: false,
      whatsapp: false,
    },
  };
}

export function legacySeverity(severity: PredictiveAlertSeverity) {
  if (severity === "critical") {
    return "critical";
  }

  if (severity === "high" || severity === "medium") {
    return "warning";
  }

  return "info";
}

function getRule(key: string) {
  const rule = defaultPredictiveAlertRules.find((item) => item.key === key);

  if (!rule) {
    throw new Error(`Missing predictive alert rule: ${key}`);
  }

  return rule;
}

function thresholdsFor(context: DetectorContext, rule: PredictiveAlertRuleDefinition) {
  return {
    ...rule.thresholdConfig,
    ...(context.preferences.get(rule.key)?.thresholdOverride ?? {}),
  };
}

function numberThreshold(thresholds: Record<string, unknown>, key: string) {
  const value = thresholds[key];
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function summarizeTransactions(
  transactions: PredictiveAlertTransactionSignal[],
  type: "sale" | "expense",
  start: Date,
  end: Date,
) {
  const rows = transactions.filter((transaction) => normalize(transaction.type) === type && inPeriod(transaction.occurredAt, start, end));
  return {
    amount: rows.reduce((sum, transaction) => sum + Math.max(0, transaction.amount), 0),
    count: rows.length,
  };
}

function groupTransactions(
  transactions: PredictiveAlertTransactionSignal[],
  type: "sale" | "expense",
  start: Date,
  end: Date,
  groupKey: "category",
) {
  const groups = new Map<string, { key: string; label: string; amount: number; count: number }>();

  for (const transaction of transactions) {
    if (normalize(transaction.type) !== type || !inPeriod(transaction.occurredAt, start, end)) {
      continue;
    }

    const label = transaction[groupKey] || "Uncategorized";
    const key = normalize(label);
    const current = groups.get(key) ?? { key, label, amount: 0, count: 0 };
    current.amount += Math.max(0, transaction.amount);
    current.count += 1;
    groups.set(key, current);
  }

  return Array.from(groups.values()).sort((left, right) => right.amount - left.amount);
}

function groupDebts(
  debts: PredictiveAlertInput["debts"],
  party: "customer" | "supplier",
) {
  const groups = new Map<string, { id: string; name: string; amount: number; count: number }>();

  for (const debt of debts) {
    const id = party === "customer" ? debt.customerId ?? debt.customerName ?? "customer" : debt.supplierId ?? debt.supplierName ?? "supplier";
    const name = party === "customer" ? debt.customerName ?? "Customer" : debt.supplierName ?? "Supplier";
    const current = groups.get(id) ?? { id, name, amount: 0, count: 0 };
    current.amount += remainingDebt(debt);
    current.count += 1;
    groups.set(id, current);
  }

  return groups;
}

function remainingDebt(debt: { amount: number; paidAmount: number }) {
  return Math.max(0, debt.amount - debt.paidAmount);
}

function isOverdue(value: Date | string | null | undefined, now: Date) {
  return Boolean(value && toDate(value) < now);
}

function inPeriod(value: Date | string | null | undefined, start: Date, end: Date) {
  if (!value) {
    return false;
  }

  const date = toDate(value);
  return date >= start && date < end;
}

function toDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * dayMs);
}

function daysBetween(start: Date, end: Date) {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / dayMs));
}

function confidenceFromSamples(samples: number, signalStrength: number) {
  const sampleScore = Math.min(0.45, samples * 0.035);
  const signalScore = Math.min(0.45, Math.max(0, signalStrength) * 0.45);
  return roundNumber(0.1 + sampleScore + signalScore);
}

function compareAlertPriority(left: PredictiveAlertCandidate, right: PredictiveAlertCandidate) {
  const rank: Record<PredictiveAlertSeverity, number> = {
    critical: 5,
    high: 4,
    medium: 3,
    low: 2,
    information: 1,
  };
  return rank[right.severity] - rank[left.severity] || right.impactAmount - left.impactAmount;
}

function normalize(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function roundMoney(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function roundPercent(value: number) {
  return Math.round(value * 10_000) / 100;
}

function roundNumber(value: number) {
  return Math.round(value * 100) / 100;
}

function formatPercent(value: number) {
  return `${roundPercent(value)}%`;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}

export function stockValue(item: PredictiveAlertInventorySignal) {
  return Math.max(0, item.quantityOnHand) * Math.max(0, item.costPrice);
}
