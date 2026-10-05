import { PayrollDomainError } from "@/lib/payroll/api";

export function assertCanSubmitPayroll(status: string) {
  if (!["DRAFT", "CALCULATED"].includes(status)) {
    throw new PayrollDomainError("Only draft or calculated payroll can be submitted for review.");
  }
}

export function assertCanApprovePayroll({
  status,
  preparedByUserId,
  approverUserId,
  requiresDualApproval,
}: {
  status: string;
  preparedByUserId?: string | null;
  approverUserId: string;
  requiresDualApproval: boolean;
}) {
  if (status !== "UNDER_REVIEW") {
    throw new PayrollDomainError("Submit payroll for review before approval.");
  }

  if (requiresDualApproval && preparedByUserId === approverUserId) {
    throw new PayrollDomainError("A different user must approve this payroll period.", 409, "dual_approval_required");
  }
}

export function assertCanRejectPayroll(status: string) {
  if (!["DRAFT", "CALCULATED", "UNDER_REVIEW"].includes(status)) {
    throw new PayrollDomainError("Only draft, calculated, or review payroll can be rejected.");
  }
}

export function assertCanPostPayrollExpense(status: string) {
  if (status !== "APPROVED") {
    throw new PayrollDomainError("Approve payroll before posting the payroll expense.");
  }
}

export function assertCanReversePayroll(status: string) {
  if (!["APPROVED", "EXPENSE_POSTED", "LOCKED"].includes(status)) {
    throw new PayrollDomainError("Only approved or posted payroll periods can be reversed.");
  }
}
