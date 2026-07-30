import { Prisma } from "@prisma/client";
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { getPrisma } from "@/lib/prisma";
import { PayrollAccessError, type PayrollAccess } from "@/lib/payroll/authorization";

export class PayrollDomainError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = "payroll_invalid") {
    super(message);
    this.name = "PayrollDomainError";
    this.status = status;
    this.code = code;
  }
}

export function parsePayrollBusinessRequest(url: string) {
  const searchParams = new URL(url).searchParams;

  return {
    businessId: searchParams.get("businessId")?.trim() ?? "",
    locationId: searchParams.get("locationId")?.trim() || undefined,
  };
}

export function payrollMethodNotAllowed(allow = "GET") {
  return Response.json(
    { error: "Method not allowed." },
    {
      status: 405,
      headers: { Allow: allow },
    },
  );
}

export function payrollErrorResponse(error: unknown, fallback: string) {
  if (error instanceof PayrollAccessError || error instanceof PayrollDomainError) {
    return jsonError(error.message, error.status);
  }

  if (error instanceof Response) {
    return jsonError(error.statusText || "Sign in to continue.", error.status);
  }

  console.error("payroll.request_failed", error);
  return jsonErrorFromUnknown(error, fallback);
}

export function payrollCapabilityPayload(access: PayrollAccess) {
  return {
    canRead: access.canRead,
    canManageEmployees: access.canManageEmployees,
    canPrepare: access.canPrepare,
    canReview: access.canReview,
    canApprove: access.canApprove,
    canExport: access.canExport,
    canPostExpense: access.canPostExpense,
    canViewSensitive: access.canViewSensitive,
  };
}

export async function logPayrollAudit({
  access,
  action,
  metadata = {},
}: {
  access: PayrollAccess;
  action:
    | "payroll.employee_created"
    | "payroll.employee_updated"
    | "payroll.period_prepared"
    | "payroll.period_calculated"
    | "payroll.submitted_for_review"
    | "payroll.period_approved"
    | "payroll.period_rejected"
    | "payroll.expense_posted"
    | "payroll.period_reversed"
    | "payroll.payslips_generated"
    | "payroll.export_generated";
  metadata?: Record<string, unknown>;
}) {
  await getPrisma().auditLog.create({
    data: {
      businessId: access.businessId,
      actorId: access.userId,
      action,
      message: payrollAuditMessage(action),
      metadata: {
        feature: "phase3i_payroll",
        role: access.role,
        ...metadata,
      } as Prisma.InputJsonObject,
    },
  }).catch(() => undefined);
}

function payrollAuditMessage(action: string) {
  if (action === "payroll.employee_created") {
    return "Payroll employee profile created.";
  }

  if (action === "payroll.employee_updated") {
    return "Payroll employee profile updated.";
  }

  if (action === "payroll.period_prepared") {
    return "Payroll period prepared.";
  }

  if (action === "payroll.period_calculated") {
    return "Payroll period calculated.";
  }

  if (action === "payroll.submitted_for_review") {
    return "Payroll submitted for review.";
  }

  if (action === "payroll.period_approved") {
    return "Payroll period approved.";
  }

  if (action === "payroll.period_rejected") {
    return "Payroll period rejected.";
  }

  if (action === "payroll.expense_posted") {
    return "Payroll expense posted.";
  }

  if (action === "payroll.period_reversed") {
    return "Payroll period reversed.";
  }

  if (action === "payroll.payslips_generated") {
    return "Payroll payslips generated.";
  }

  return "Payroll export generated.";
}
