import { describe, expect, it } from "vitest";
import { assertLedgerBatchBalanced } from "@/lib/cooperatives/ledger";
import { calculateCooperativeLoanTerms } from "@/lib/cooperatives/loans";

describe("Phase 3J Cooperatives ledger and loan formulas", () => {
  it("accepts balanced cooperative ledger batches", () => {
    expect(() =>
      assertLedgerBatchBalanced([
        { accountCode: "CASH_CONTROL", debit: 10000 },
        { accountCode: "MEMBER_SAVINGS", credit: 10000 },
      ]),
    ).not.toThrow();
  });

  it("rejects unbalanced cooperative ledger batches", () => {
    expect(() =>
      assertLedgerBatchBalanced([
        { accountCode: "CASH_CONTROL", debit: 10000 },
        { accountCode: "MEMBER_SAVINGS", credit: 9000 },
      ]),
    ).toThrow("debits and credits must balance");
  });

  it("calculates zero-interest schedules", () => {
    const terms = calculateCooperativeLoanTerms({
      principal: 30000,
      interestMethod: "zero",
      termCount: 3,
    });

    expect(terms.totalDue).toBe(30000);
    expect(terms.schedule).toHaveLength(3);
    expect(terms.schedule[0].principalDue).toBe(10000);
  });

  it("calculates flat-interest schedules", () => {
    const terms = calculateCooperativeLoanTerms({
      principal: 50000,
      interestMethod: "flat",
      interestRate: 10,
      termCount: 2,
    });

    expect(terms.interestAmount).toBe(5000);
    expect(terms.totalDue).toBe(55000);
    expect(terms.schedule[0].interestDue).toBe(2500);
  });

  it("rejects reducing-balance loans until formula validation is complete", () => {
    expect(() =>
      calculateCooperativeLoanTerms({
        principal: 50000,
        interestMethod: "reducing_balance",
        interestRate: 10,
      }),
    ).toThrow("Reducing balance");
  });
});
