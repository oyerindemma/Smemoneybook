export const staffPerformanceFormulaVersion = "staff-performance-v1";

export type StaffPerformanceMember = {
  userId: string;
  name: string;
  role: string;
};

export type StaffPerformanceEvent = {
  actorId: string | null;
  action: string;
  createdAt: Date | string;
  locationId?: string | null;
  amount?: number | null;
};

export type StaffPerformanceGoalInput = {
  id: string;
  staffUserId?: string | null;
  label: string;
  metric: string;
  targetValue: number;
  periodStart: Date | string;
  periodEnd: Date | string;
};

export type StaffPerformanceRow = {
  userId: string;
  name: string;
  role: string;
  salesRecorded: number;
  revenueHandled: number | null;
  transactionsProcessed: number;
  returnsProcessed: number;
  debtActions: number;
  goalProgress: Array<{
    goalId: string;
    label: string;
    metric: string;
    targetValue: number;
    currentValue: number;
    progressPercent: number;
  }>;
};

export type StaffPerformanceSummary = {
  formulaVersion: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  rows: StaffPerformanceRow[];
  warnings: string[];
  sourceMetrics: {
    memberCount: number;
    eventCount: number;
    unattributedEventCount: number;
    revenueAmountEventCount: number;
  };
  metricDefinitions: Record<string, string>;
};

export function calculateStaffPerformance({
  members,
  events,
  goals = [],
  periodStart,
  periodEnd,
  generatedAt = new Date(),
}: {
  members: StaffPerformanceMember[];
  events: StaffPerformanceEvent[];
  goals?: StaffPerformanceGoalInput[];
  periodStart: Date;
  periodEnd: Date;
  generatedAt?: Date;
}): StaffPerformanceSummary {
  const rowsByUser = new Map<string, StaffPerformanceRow>();
  const eventsInPeriod = events.filter((event) => {
    const createdAt = new Date(event.createdAt);
    return createdAt >= periodStart && createdAt < periodEnd;
  });

  for (const member of members) {
    rowsByUser.set(member.userId, {
      userId: member.userId,
      name: member.name,
      role: member.role,
      salesRecorded: 0,
      revenueHandled: null,
      transactionsProcessed: 0,
      returnsProcessed: 0,
      debtActions: 0,
      goalProgress: [],
    });
  }

  for (const event of eventsInPeriod) {
    if (!event.actorId) {
      continue;
    }

    const row = rowsByUser.get(event.actorId);

    if (!row) {
      continue;
    }

    if (isSaleAction(event.action)) {
      row.salesRecorded += 1;

      if (typeof event.amount === "number" && Number.isFinite(event.amount)) {
        row.revenueHandled = (row.revenueHandled ?? 0) + event.amount;
      }
    }

    if (isTransactionAction(event.action)) {
      row.transactionsProcessed += 1;
    }

    if (isReturnAction(event.action)) {
      row.returnsProcessed += 1;
    }

    if (isDebtAction(event.action)) {
      row.debtActions += 1;
    }
  }

  const rows = Array.from(rowsByUser.values()).map((row) => ({
    ...row,
    revenueHandled: row.revenueHandled === null ? null : roundMetric(row.revenueHandled),
    goalProgress: goals
      .filter((goal) => !goal.staffUserId || goal.staffUserId === row.userId)
      .map((goal) => {
        const currentValue = currentMetricValue(row, goal.metric);
        return {
          goalId: goal.id,
          label: goal.label,
          metric: goal.metric,
          targetValue: goal.targetValue,
          currentValue,
          progressPercent: goal.targetValue > 0 ? Math.min(100, roundMetric((currentValue / goal.targetValue) * 100)) : 0,
        };
      }),
  }));
  const salesWithoutAmounts = rows.some((row) => row.salesRecorded > 0 && row.revenueHandled === null);
  const warnings: string[] = [
    "Staff performance uses transparent business records only. It must not be used for hidden surveillance.",
  ];

  if (salesWithoutAmounts) {
    warnings.push("Revenue handled is unavailable for some staff because source audit events do not include amounts.");
  }

  return {
    formulaVersion: staffPerformanceFormulaVersion,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    generatedAt: generatedAt.toISOString(),
    rows,
    warnings,
    sourceMetrics: {
      memberCount: members.length,
      eventCount: eventsInPeriod.length,
      unattributedEventCount: eventsInPeriod.filter((event) => !event.actorId).length,
      revenueAmountEventCount: eventsInPeriod.filter((event) => typeof event.amount === "number").length,
    },
    metricDefinitions: {
      salesRecorded: "Count of recorded sale actions attributed to the staff user in the selected period.",
      revenueHandled: "Sum of explicit sale amounts in auditable source metadata. Null means unavailable.",
      transactionsProcessed: "Count of transaction or POS actions recorded by the staff user.",
      returnsProcessed: "Count of customer or supplier return actions recorded by the staff user.",
      debtActions: "Count of collection, settlement, or reminder actions recorded by the staff user.",
    },
  };
}

function isSaleAction(action: string) {
  return ["transaction.sale", "pos.sale"].includes(action);
}

function isTransactionAction(action: string) {
  return action.startsWith("transaction.") || action === "pos.sale";
}

function isReturnAction(action: string) {
  return action === "customer.return" || action === "supplier.return";
}

function isDebtAction(action: string) {
  return action.startsWith("debt.");
}

function currentMetricValue(row: StaffPerformanceRow, metric: string) {
  if (metric === "salesRecorded") {
    return row.salesRecorded;
  }

  if (metric === "revenueHandled") {
    return row.revenueHandled ?? 0;
  }

  if (metric === "returnsProcessed") {
    return row.returnsProcessed;
  }

  if (metric === "debtActions") {
    return row.debtActions;
  }

  return row.transactionsProcessed;
}

function roundMetric(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
