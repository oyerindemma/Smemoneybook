import { describe, expect, it } from "vitest";
import {
  assertCanApprovePayroll,
  assertCanPostPayrollExpense,
  assertCanRejectPayroll,
  assertCanReversePayroll,
  assertCanSubmitPayroll,
} from "@/lib/payroll/approval";

describe("Phase 3I payroll approval controls", () => {
  it("allows calculated payroll to be submitted for review", () => {
    expect(() => assertCanSubmitPayroll("CALCULATED")).not.toThrow();
  });

  it("requires separation of duties when dual approval is enabled", () => {
    expect(() =>
      assertCanApprovePayroll({
        status: "UNDER_REVIEW",
        preparedByUserId: "owner_1",
        approverUserId: "owner_1",
        requiresDualApproval: true,
      }),
    ).toThrow("different user");
  });

  it("allows single-owner approval when dual approval is not required", () => {
    expect(() =>
      assertCanApprovePayroll({
        status: "UNDER_REVIEW",
        preparedByUserId: "owner_1",
        approverUserId: "owner_1",
        requiresDualApproval: false,
      }),
    ).not.toThrow();
  });

  it("requires approval before expense posting", () => {
    expect(() => assertCanPostPayrollExpense("UNDER_REVIEW")).toThrow("Approve payroll");
    expect(() => assertCanPostPayrollExpense("APPROVED")).not.toThrow();
  });

  it("allows rejection before final approval and reversal after approval", () => {
    expect(() => assertCanRejectPayroll("UNDER_REVIEW")).not.toThrow();
    expect(() => assertCanReversePayroll("EXPENSE_POSTED")).not.toThrow();
    expect(() => assertCanReversePayroll("CALCULATED")).toThrow("Only approved or posted");
  });
});
