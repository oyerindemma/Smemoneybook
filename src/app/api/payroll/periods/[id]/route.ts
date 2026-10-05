import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { requireUser } from "@/lib/auth/session";
import {
  parsePayrollBusinessRequest,
  payrollCapabilityPayload,
  payrollErrorResponse,
  payrollMethodNotAllowed,
} from "@/lib/payroll/api";
import { requirePayrollAccess } from "@/lib/payroll/authorization";
import { getPayrollPeriod, getPayrollSetup } from "@/lib/payroll/service";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "payroll.period.detail", 80, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const filters = parsePayrollBusinessRequest(request.url);
    const access = await requirePayrollAccess({
      userId: user.id,
      businessId: filters.businessId,
      permission: "payroll:read",
    });
    const { id } = await params;
    const period = await getPayrollPeriod({
      businessId: access.businessId,
      periodId: id,
    });

    return Response.json({
      period,
      setup: getPayrollSetup(),
      capabilities: payrollCapabilityPayload(access),
    });
  } catch (error) {
    return payrollErrorResponse(error, "Could not load payroll period.");
  }
}

export function POST() {
  return payrollMethodNotAllowed("GET");
}

export function PUT() {
  return payrollMethodNotAllowed("GET");
}

export function PATCH() {
  return payrollMethodNotAllowed("GET");
}

export function DELETE() {
  return payrollMethodNotAllowed("GET");
}
