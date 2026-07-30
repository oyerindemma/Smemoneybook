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
  createPayrollPeriod,
  listPayrollDashboard,
  serializePayrollPeriod,
} from "@/lib/payroll/service";
import { periodCreateSchema } from "@/lib/payroll/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "payroll.periods.read", 80, 15 * 60 * 1000);

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
      periods: dashboard.periods,
      setup: dashboard.setup,
      capabilities: payrollCapabilityPayload(access),
    });
  } catch (error) {
    return payrollErrorResponse(error, "Could not load payroll periods.");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "payroll.periods.create", 30, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const body = await parseJsonBody(request, periodCreateSchema);
    const access = await requirePayrollAccess({
      userId: user.id,
      businessId: body.businessId,
      permission: "payroll:prepare",
    });
    const period = await createPayrollPeriod({
      ...body,
      businessId: access.businessId,
      actorId: user.id,
    });

    await logPayrollAudit({
      access,
      action: "payroll.period_prepared",
      metadata: { periodId: period.id, requiresDualApproval: period.requiresDualApproval },
    });

    return Response.json({
      period: serializePayrollPeriod(period),
      capabilities: payrollCapabilityPayload(access),
    }, { status: 201 });
  } catch (error) {
    return payrollErrorResponse(error, "Could not prepare payroll period.");
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
