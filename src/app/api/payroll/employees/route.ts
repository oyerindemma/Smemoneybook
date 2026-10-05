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
  createPayrollEmployee,
  getPayrollSetup,
  listPayrollDashboard,
  serializePayrollEmployee,
} from "@/lib/payroll/service";
import { employeeCreateSchema } from "@/lib/payroll/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "payroll.employees.read", 80, 15 * 60 * 1000);

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
      employees: dashboard.employees,
      setup: dashboard.setup,
      capabilities: payrollCapabilityPayload(access),
    });
  } catch (error) {
    return payrollErrorResponse(error, "Could not load payroll employees.");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "payroll.employees.create", 30, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const body = await parseJsonBody(request, employeeCreateSchema);
    const access = await requirePayrollAccess({
      userId: user.id,
      businessId: body.businessId,
      permission: "payroll:manage_employees",
    });
    const employee = await createPayrollEmployee({
      ...body,
      businessId: access.businessId,
    });

    await logPayrollAudit({
      access,
      action: "payroll.employee_created",
      metadata: {
        employeeId: employee.id,
        employeeNumber: employee.employeeNumber ?? employee.employeeCode,
      },
    });

    return Response.json({
      employee: serializePayrollEmployee(employee, access.canViewSensitive),
      setup: getPayrollSetup(employee.country),
      capabilities: payrollCapabilityPayload(access),
    }, { status: 201 });
  } catch (error) {
    return payrollErrorResponse(error, "Could not create payroll employee.");
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
