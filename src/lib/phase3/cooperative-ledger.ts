export const cooperativeLedgerFormulaVersion = "cooperative-ledger-v1";

export type CooperativeLedgerEntryInput = {
  id?: string;
  memberId?: string | null;
  entryType: string;
  debit: number;
  credit: number;
  entryDate?: Date | string;
};

export type CooperativeMemberInput = {
  id: string;
  displayName: string;
  status?: string;
};

export type CooperativeContributionPlanInput = {
  id: string;
  amount: number;
  frequency?: "weekly" | "monthly" | "quarterly" | "annual" | string;
  startDate: Date | string;
  graceDays?: number;
  penaltyAmount?: number;
  status?: string;
};

export type CooperativeContributionInput = {
  memberId: string;
  planId?: string | null;
  amount: number;
  penaltyAmount?: number;
  dueDate?: Date | string | null;
  paidAt: Date | string;
  status?: string;
};

export type CooperativeLoanInput = {
  id: string;
  memberId: string;
  principal: number;
  interestAmount?: number;
  penaltyAmount?: number;
  totalDue?: number;
  disbursedAmount?: number;
  dueAt?: Date | string | null;
  status?: string;
};

export type CooperativeLoanRepaymentInput = {
  loanId: string;
  memberId: string;
  amount: number;
  principalPortion?: number;
  interestPortion?: number;
  penaltyPortion?: number;
  paidAt: Date | string;
};

export type CooperativeExpenseInput = {
  amount: number;
  spentAt: Date | string;
};

export type CooperativeDistributionInput = {
  memberId?: string | null;
  amount: number;
  status?: string;
};

export type CooperativeLedgerValidation = {
  valid: boolean;
  violations: string[];
};

export type CooperativeArrears = {
  memberId: string;
  planId: string;
  expectedAmount: number;
  paidAmount: number;
  arrearsAmount: number;
  penaltyAccrued: number;
  periodsDue: number;
};

export type CooperativeLoanBalance = {
  loanId: string;
  memberId: string;
  totalDue: number;
  repaidAmount: number;
  outstandingAmount: number;
  overdue: boolean;
};

export type CooperativeLedgerSummary = {
  formulaVersion: string;
  generatedAt: string;
  groupCashBalance: number;
  contributionTotal: number;
  loanDisbursementTotal: number;
  repaymentTotal: number;
  expenseTotal: number;
  distributionTotal: number;
  memberBalances: Array<{
    memberId: string;
    displayName?: string;
    balance: number;
  }>;
  loanBalances: CooperativeLoanBalance[];
  arrears: CooperativeArrears[];
  validation: CooperativeLedgerValidation;
  warnings: string[];
  sourceMetrics: {
    memberCount: number;
    contributionCount: number;
    loanCount: number;
    repaymentCount: number;
    ledgerEntryCount: number;
  };
};

export function validateCooperativeLedgerEntries(entries: CooperativeLedgerEntryInput[]): CooperativeLedgerValidation {
  const violations = entries.flatMap((entry, index) => {
    const label = entry.id ?? `entry_${index + 1}`;
    const debit = safeMoney(entry.debit);
    const credit = safeMoney(entry.credit);
    const entryViolations: string[] = [];

    if (debit < 0 || credit < 0) {
      entryViolations.push(`${label} has a negative debit or credit.`);
    }

    if (debit > 0 && credit > 0) {
      entryViolations.push(`${label} records both debit and credit.`);
    }

    if (debit === 0 && credit === 0) {
      entryViolations.push(`${label} has no financial movement.`);
    }

    return entryViolations;
  });

  return {
    valid: violations.length === 0,
    violations,
  };
}

export function summarizeCooperativeLedger({
  members,
  contributionPlans,
  contributions,
  loans,
  repayments,
  expenses,
  distributions,
  ledgerEntries,
  asOf = new Date(),
}: {
  members: CooperativeMemberInput[];
  contributionPlans: CooperativeContributionPlanInput[];
  contributions: CooperativeContributionInput[];
  loans: CooperativeLoanInput[];
  repayments: CooperativeLoanRepaymentInput[];
  expenses: CooperativeExpenseInput[];
  distributions: CooperativeDistributionInput[];
  ledgerEntries: CooperativeLedgerEntryInput[];
  asOf?: Date;
}): CooperativeLedgerSummary {
  const activeMembers = members.filter((member) => (member.status ?? "ACTIVE").toUpperCase() !== "EXITED");
  const validation = validateCooperativeLedgerEntries(ledgerEntries);
  const contributionTotal = sumMoney(
    contributions
      .filter((contribution) => (contribution.status ?? "RECORDED").toUpperCase() !== "REVERSED")
      .map((contribution) => safeMoney(contribution.amount) + safeMoney(contribution.penaltyAmount ?? 0)),
  );
  const repaymentTotal = sumMoney(repayments.map((repayment) => repayment.amount));
  const loanDisbursementTotal = sumMoney(loans.map((loan) => loan.disbursedAmount ?? loan.principal));
  const expenseTotal = sumMoney(expenses.map((expense) => expense.amount));
  const distributionTotal = sumMoney(
    distributions
      .filter((distribution) => !["VOID", "REVERSED"].includes((distribution.status ?? "DRAFT").toUpperCase()))
      .map((distribution) => distribution.amount),
  );
  const memberNames = new Map(activeMembers.map((member) => [member.id, member.displayName]));
  const memberBalanceMap = new Map(activeMembers.map((member) => [member.id, 0]));

  for (const entry of ledgerEntries) {
    if (!entry.memberId) {
      continue;
    }

    const current = memberBalanceMap.get(entry.memberId) ?? 0;
    memberBalanceMap.set(entry.memberId, roundMoney(current + safeMoney(entry.credit) - safeMoney(entry.debit)));
  }

  const loanBalances = loans.map((loan) => {
    const totalDue = safeMoney(loan.totalDue ?? safeMoney(loan.principal) + safeMoney(loan.interestAmount ?? 0) + safeMoney(loan.penaltyAmount ?? 0));
    const loanRepayments = repayments.filter((repayment) => repayment.loanId === loan.id);
    const repaidAmount = sumMoney(loanRepayments.map((repayment) => repayment.amount));

    return {
      loanId: loan.id,
      memberId: loan.memberId,
      totalDue,
      repaidAmount,
      outstandingAmount: Math.max(0, roundMoney(totalDue - repaidAmount)),
      overdue: Boolean(loan.dueAt && new Date(loan.dueAt).getTime() < asOf.getTime() && totalDue > repaidAmount),
    };
  });
  const arrears = calculateContributionArrears({
    members: activeMembers,
    plans: contributionPlans,
    contributions,
    asOf,
  });
  const groupCashBalance = roundMoney(
    contributionTotal + repaymentTotal - loanDisbursementTotal - expenseTotal - distributionTotal,
  );
  const warnings: string[] = [];

  if (!validation.valid) {
    warnings.push("Some cooperative ledger entries fail debit and credit integrity checks.");
  }

  if (arrears.some((item) => item.arrearsAmount > 0)) {
    warnings.push("Some members have contribution arrears.");
  }

  if (loanBalances.some((loan) => loan.overdue)) {
    warnings.push("Some cooperative loans are overdue.");
  }

  return {
    formulaVersion: cooperativeLedgerFormulaVersion,
    generatedAt: asOf.toISOString(),
    groupCashBalance,
    contributionTotal,
    loanDisbursementTotal,
    repaymentTotal,
    expenseTotal,
    distributionTotal,
    memberBalances: Array.from(memberBalanceMap.entries()).map(([memberId, balance]) => ({
      memberId,
      displayName: memberNames.get(memberId),
      balance,
    })),
    loanBalances,
    arrears,
    validation,
    warnings,
    sourceMetrics: {
      memberCount: activeMembers.length,
      contributionCount: contributions.length,
      loanCount: loans.length,
      repaymentCount: repayments.length,
      ledgerEntryCount: ledgerEntries.length,
    },
  };
}

export function calculateContributionArrears({
  members,
  plans,
  contributions,
  asOf,
}: {
  members: CooperativeMemberInput[];
  plans: CooperativeContributionPlanInput[];
  contributions: CooperativeContributionInput[];
  asOf: Date;
}): CooperativeArrears[] {
  const activePlans = plans.filter((plan) => (plan.status ?? "ACTIVE").toUpperCase() === "ACTIVE");
  const arrears: CooperativeArrears[] = [];

  for (const member of members) {
    for (const plan of activePlans) {
      const periodsDue = countDuePeriods(plan, asOf);
      const expectedAmount = roundMoney(periodsDue * safeMoney(plan.amount));
      const paidAmount = sumMoney(
        contributions
          .filter((contribution) => contribution.memberId === member.id && contribution.planId === plan.id)
          .map((contribution) => contribution.amount),
      );
      const arrearsAmount = Math.max(0, roundMoney(expectedAmount - paidAmount));
      const penaltyAccrued = arrearsAmount > 0 && isPastGracePeriod(plan, asOf)
        ? roundMoney(periodsDue * safeMoney(plan.penaltyAmount ?? 0))
        : 0;

      if (expectedAmount > 0 || paidAmount > 0) {
        arrears.push({
          memberId: member.id,
          planId: plan.id,
          expectedAmount,
          paidAmount,
          arrearsAmount,
          penaltyAccrued,
          periodsDue,
        });
      }
    }
  }

  return arrears;
}

function countDuePeriods(plan: CooperativeContributionPlanInput, asOf: Date) {
  const start = new Date(plan.startDate);

  if (Number.isNaN(start.getTime()) || start.getTime() > asOf.getTime()) {
    return 0;
  }

  const days = Math.floor((asOf.getTime() - start.getTime()) / 86_400_000);
  const frequency = (plan.frequency ?? "monthly").toLowerCase();

  if (frequency === "weekly") {
    return Math.floor(days / 7) + 1;
  }

  if (frequency === "quarterly") {
    return Math.floor(days / 91) + 1;
  }

  if (frequency === "annual" || frequency === "yearly") {
    return Math.floor(days / 365) + 1;
  }

  return monthDistance(start, asOf) + 1;
}

function isPastGracePeriod(plan: CooperativeContributionPlanInput, asOf: Date) {
  const start = new Date(plan.startDate);

  if (Number.isNaN(start.getTime())) {
    return false;
  }

  return asOf.getTime() - start.getTime() > safeMoney(plan.graceDays ?? 0) * 86_400_000;
}

function monthDistance(start: Date, end: Date) {
  return Math.max(0, (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth());
}

function safeMoney(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function sumMoney(values: number[]) {
  return roundMoney(values.reduce((total, value) => total + safeMoney(value), 0));
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
