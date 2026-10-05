import { assertSameOriginRequest } from "@/lib/api/http";
import { parseJsonBody } from "@/lib/api/validation";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { requireUser } from "@/lib/auth/session";
import {
  logPayrollAudit,
  payrollCapabilityPayload,
  payrollErrorResponse,
  payrollMethodNotAllowed,
} from "@/lib/payroll/api";
import { requirePayrollAccess } from "@/lib/payroll/authorization";
import { calculatePayrollPeriod, serializePayrollPeriod } from "@/lib/payroll/service";
import { periodActionSchema } from "@/lib/payroll/validation";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "payroll.period.calculate", 25, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const body = await parseJsonBody(request, periodActionSchema);
    const access = await requirePayrollAccess({
      userId: user.id,
      businessId: body.businessId,
      permission: "payroll:prepare",
    });
    const { id } = await params;
    const period = await calculatePayrollPeriod({
      businessId: access.businessId,
      periodId: id,
      actorId: user.id,
    });

    await logPayrollAudit({
      access,
      action: "payroll.period_calculated",
      metadata: { periodId: period.id, employeeCount: period.employeeCount },
    });

    return Response.json({
      period: serializePayrollPeriod(period),
      capabilities: payrollCapabilityPayload(access),
    });
  } catch (error) {
    return payrollErrorResponse(error, "Could not calculate payroll period.");
  }
}

export function GET() {
  return payrollMethodNotAllowed("POST");
}

export function PUT() {
  return payrollMethodNotAllowed("POST");
}

export function PATCH() {
  return payrollMethodNotAllowed("POST");
}

export function DELETE() {
  return payrollMethodNotAllowed("POST");
}
