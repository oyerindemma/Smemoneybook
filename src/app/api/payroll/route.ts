import { z } from "zod";
import { assertSameOriginRequest } from "@/lib/api/http";
import { parseJsonBody } from "@/lib/api/validation";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { requireUser } from "@/lib/auth/session";
import {
  logPayrollAudit,
  parsePayrollBusinessRequest,
  payrollCapabilityPayload,
  payrollErrorResponse,
  payrollMethodNotAllowed,
} from "@/lib/payroll/api";
import { requirePayrollAccess } from "@/lib/payroll/authorization";
import {
  approvePayrollPeriod,
  calculatePayrollPeriod,
  createPayrollEmployee,
  createPayrollPeriod,
  getPayrollPeriod,
  listPayrollDashboard,
  postPayrollExpense,
  reversePayrollPeriod,
  serializePayrollEmployee,
  submitPayrollForReview,
} from "@/lib/payroll/service";
import {
  employeeCreateSchema,
  payrollBusinessIdSchema,
  periodCreateSchema,
  periodReverseSchema,
} from "@/lib/payroll/validation";

export const runtime = "nodejs";

const legacyActionSchema = z.discriminatedUnion("action", [
  employeeCreateSchema.extend({ action: z.literal("create_employee") }),
  periodCreateSchema.extend({ action: z.literal("draft_run") }),
  z.object({
    action: z.literal("approve_run"),
    businessId: payrollBusinessIdSchema,
    runId: z.string().trim().min(1, "Choose a payroll run."),
  }),
  z.object({
    action: z.literal("lock_run"),
    businessId: payrollBusinessIdSchema,
    runId: z.string().trim().min(1, "Choose a payroll run."),
  }),
  periodReverseSchema.extend({
    action: z.literal("reverse_run"),
    runId: z.string().trim().min(1, "Choose a payroll run."),
  }),
]);

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "payroll.read", 80, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const filters = parsePayrollBusinessRequest(request.url);
    const access = await requirePayrollAccess({
      userId: user.id,
      businessId: filters.businessId,
      permission: "payroll:read",
    });
    const dashboard = await listPayrollDashboard({
      businessId: access.businessId,
      locationId: filters.locationId,
      includeSensitive: access.canViewSensitive,
    });

    return Response.json({
      dashboard,
      setup: dashboard.setup,
      capabilities: payrollCapabilityPayload(access),
    });
  } catch (error) {
    return payrollErrorResponse(error, "Could not load payroll.");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const body = await parseJsonBody(request, legacyActionSchema);
    const limited = await enforceRateLimit(request, "payroll.write", 30, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const access = await requirePayrollAccess({
      userId: user.id,
      businessId: body.businessId,
      permission: permissionForLegacyAction(body.action),
    });
    const result = await runLegacyAction({
      businessId: access.businessId,
      actorId: user.id,
      body,
      canViewSensitive: access.canViewSensitive,
    });

    await logPayrollAudit({
      access,
      action: auditActionForLegacyAction(body.action),
      metadata: {
        action: body.action,
        resultId: result.id,
      },
    });

    return Response.json({
      result,
      message: "Payroll action recorded.",
      capabilities: payrollCapabilityPayload(access),
    });
  } catch (error) {
    return payrollErrorResponse(error, "Could not record payroll action.");
  }
}

export function PUT() {
  return payrollMethodNotAllowed("GET, POST");
}

export function PATCH() {
  return payrollMethodNotAllowed("GET, POST");
}

export function DELETE() {
  return payrollMethodNotAllowed("GET, POST");
}

async function runLegacyAction({
  businessId,
  actorId,
  body,
  canViewSensitive,
}: {
  businessId: string;
  actorId: string;
  body: z.infer<typeof legacyActionSchema>;
  canViewSensitive: boolean;
}) {
  if (body.action === "create_employee") {
    const employee = await createPayrollEmployee({
      ...body,
      businessId,
    });

    return serializePayrollEmployee(employee, canViewSensitive);
  }

  if (body.action === "draft_run") {
    const period = await createPayrollPeriod({
      ...body,
      businessId,
      actorId,
    });
    const calculated = await calculatePayrollPeriod({
      businessId,
      periodId: period.id,
      actorId,
    });

    return { ...calculated, id: period.id };
  }

  if (body.action === "approve_run") {
    const period = await getPayrollPeriod({ businessId, periodId: body.runId });

    if (period.status === "CALCULATED" || period.status === "DRAFT") {
      await submitPayrollForReview({ businessId, periodId: body.runId, actorId });
    }

    return approvePayrollPeriod({ businessId, periodId: body.runId, actorId });
  }

  if (body.action === "lock_run") {
    const posted = await postPayrollExpense({ businessId, periodId: body.runId, actorId });
    return posted.period;
  }

  return reversePayrollPeriod({
    businessId,
    periodId: body.runId,
    actorId,
    reason: body.reason,
  });
}

function permissionForLegacyAction(action: z.infer<typeof legacyActionSchema>["action"]) {
  if (action === "create_employee") {
    return "payroll:manage_employees" as const;
  }

  if (action === "draft_run") {
    return "payroll:prepare" as const;
  }

  if (action === "lock_run") {
    return "payroll:post_expense" as const;
  }

  return "payroll:approve" as const;
}

function auditActionForLegacyAction(action: z.infer<typeof legacyActionSchema>["action"]) {
  if (action === "create_employee") {
    return "payroll.employee_created" as const;
  }

  if (action === "draft_run") {
    return "payroll.period_calculated" as const;
  }

  if (action === "lock_run") {
    return "payroll.expense_posted" as const;
  }

  if (action === "reverse_run") {
    return "payroll.period_reversed" as const;
  }

  return "payroll.period_approved" as const;
}
