import { describe, expect, it } from "vitest";
import {
  calculateContributionArrears,
  summarizeCooperativeLedger,
  validateCooperativeLedgerEntries,
} from "@/lib/phase3/cooperative-ledger";

const asOf = new Date("2026-07-19T12:00:00.000Z");

describe("cooperative ledger integrity", () => {
  it("rejects entries that are negative, empty, or both debit and credit", () => {
    const validation = validateCooperativeLedgerEntries([
      { id: "negative", entryType: "bad", debit: -1, credit: 0 },
      { id: "both", entryType: "bad", debit: 100, credit: 100 },
      { id: "empty", entryType: "bad", debit: 0, credit: 0 },
    ]);

    expect(validation.valid).toBe(false);
    expect(validation.violations).toHaveLength(3);
    expect(validation.violations.join(" ")).toContain("both debit and credit");
  });

  it("summarizes member balances from the separate cooperative ledger", () => {
    const summary = summarizeCooperativeLedger({
      asOf,
      members: [
        { id: "member_1", displayName: "Ada" },
        { id: "member_2", displayName: "Tunde" },
      ],
      contributionPlans: [],
      contributions: [],
      loans: [],
      repayments: [],
      expenses: [],
      distributions: [],
      ledgerEntries: [
        { memberId: "member_1", entryType: "CONTRIBUTION", debit: 0, credit: 10_000 },
        { memberId: "member_1", entryType: "LOAN_DISBURSEMENT", debit: 4_000, credit: 0 },
        { memberId: "member_2", entryType: "CONTRIBUTION", debit: 0, credit: 7_500 },
      ],
    });

    expect(summary.formulaVersion).toBe("cooperative-ledger-v1");
    expect(summary.memberBalances).toEqual([
      { memberId: "member_1", displayName: "Ada", balance: 6_000 },
      { memberId: "member_2", displayName: "Tunde", balance: 7_500 },
    ]);
    expect(summary.validation.valid).toBe(true);
  });

  it("keeps group cash separate from the normal business ledger", () => {
    const summary = summarizeCooperativeLedger({
      asOf,
      members: [{ id: "member_1", displayName: "Ada" }],
      contributionPlans: [],
      contributions: [{ memberId: "member_1", amount: 50_000, paidAt: asOf }],
      loans: [{ id: "loan_1", memberId: "member_1", principal: 20_000, totalDue: 22_000, disbursedAmount: 20_000 }],
      repayments: [{ loanId: "loan_1", memberId: "member_1", amount: 5_000, paidAt: asOf }],
      expenses: [{ amount: 2_000, spentAt: asOf }],
      distributions: [{ memberId: "member_1", amount: 3_000, status: "PAID" }],
      ledgerEntries: [
        { memberId: "member_1", entryType: "CONTRIBUTION", debit: 0, credit: 50_000 },
        { memberId: "member_1", entryType: "LOAN_DISBURSEMENT", debit: 20_000, credit: 0 },
        { memberId: "member_1", entryType: "LOAN_REPAYMENT", debit: 0, credit: 5_000 },
      ],
    });

    expect(summary.groupCashBalance).toBe(30_000);
    expect(summary.contributionTotal).toBe(50_000);
    expect(summary.repaymentTotal).toBe(5_000);
    expect(summary.loanDisbursementTotal).toBe(20_000);
    expect(summary.expenseTotal).toBe(2_000);
    expect(summary.distributionTotal).toBe(3_000);
  });

  it("calculates loan outstanding without going negative", () => {
    const summary = summarizeCooperativeLedger({
      asOf,
      members: [{ id: "member_1", displayName: "Ada" }],
      contributionPlans: [],
      contributions: [],
      loans: [
        { id: "loan_1", memberId: "member_1", principal: 10_000, interestAmount: 1_000, penaltyAmount: 500 },
      ],
      repayments: [{ loanId: "loan_1", memberId: "member_1", amount: 12_000, paidAt: asOf }],
      expenses: [],
      distributions: [],
      ledgerEntries: [{ memberId: "member_1", entryType: "LOAN_REPAYMENT", debit: 0, credit: 12_000 }],
    });

    expect(summary.loanBalances[0]).toEqual({
      loanId: "loan_1",
      memberId: "member_1",
      totalDue: 11_500,
      repaidAmount: 12_000,
      outstandingAmount: 0,
      overdue: false,
    });
  });

  it("calculates contribution arrears and penalties by member and plan", () => {
    const arrears = calculateContributionArrears({
      asOf,
      members: [{ id: "member_1", displayName: "Ada" }],
      plans: [
        {
          id: "plan_1",
          amount: 5_000,
          frequency: "monthly",
          startDate: "2026-05-01T00:00:00.000Z",
          graceDays: 5,
          penaltyAmount: 500,
        },
      ],
      contributions: [{ memberId: "member_1", planId: "plan_1", amount: 5_000, paidAt: asOf }],
    });

    expect(arrears).toEqual([
      {
        memberId: "member_1",
        planId: "plan_1",
        expectedAmount: 15_000,
        paidAmount: 5_000,
        arrearsAmount: 10_000,
        penaltyAccrued: 1_500,
        periodsDue: 3,
      },
    ]);
  });
});
