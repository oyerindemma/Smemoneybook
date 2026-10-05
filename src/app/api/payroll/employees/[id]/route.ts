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
  listPayrollDashboard,
  serializePayrollEmployee,
  updatePayrollEmployee,
} from "@/lib/payroll/service";
import { employeeUpdateSchema } from "@/lib/payroll/validation";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const limited = await enforceRateLimit(request, "payroll.employees.detail", 80, 15 * 60 * 1000);

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
      includeSensitive: access.canViewSensitive,
    });
    const employee = dashboard.employees.find((item) => item.id === id);

    if (!employee) {
      return Response.json({ error: "Choose a valid payroll employee." }, { status: 404 });
    }

    return Response.json({
      employee,
      setup: dashboard.setup,
      capabilities: payrollCapabilityPayload(access),
    });
  } catch (error) {
    return payrollErrorResponse(error, "Could not load payroll employee.");
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const { id } = await params;
    const limited = await enforceRateLimit(request, "payroll.employees.update", 30, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const body = await parseJsonBody(request, employeeUpdateSchema);
    const access = await requirePayrollAccess({
      userId: user.id,
      businessId: body.businessId,
      permission: "payroll:manage_employees",
    });
    const employee = await updatePayrollEmployee({
      ...body,
      businessId: access.businessId,
      employeeId: id,
    });

    await logPayrollAudit({
      access,
      action: "payroll.employee_updated",
      metadata: { employeeId: id },
    });

    return Response.json({
      employee: serializePayrollEmployee(employee, access.canViewSensitive),
      capabilities: payrollCapabilityPayload(access),
    });
  } catch (error) {
    return payrollErrorResponse(error, "Could not update payroll employee.");
  }
}

export function POST() {
  return payrollMethodNotAllowed("GET, PUT");
}

export function PATCH() {
  return payrollMethodNotAllowed("GET, PUT");
}

export function DELETE() {
  return payrollMethodNotAllowed("GET, PUT");
}
