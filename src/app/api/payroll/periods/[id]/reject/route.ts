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
import { rejectPayrollPeriod } from "@/lib/payroll/service";
import { periodRejectSchema } from "@/lib/payroll/validation";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "payroll.period.reject", 20, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const body = await parseJsonBody(request, periodRejectSchema);
    const access = await requirePayrollAccess({
      userId: user.id,
      businessId: body.businessId,
      permission: "payroll:approve",
    });
    const { id } = await params;
    const period = await rejectPayrollPeriod({
      businessId: access.businessId,
      periodId: id,
      actorId: user.id,
      reason: body.reason,
    });

    await logPayrollAudit({
      access,
      action: "payroll.period_rejected",
      metadata: { periodId: period.id },
    });

    return Response.json({ period, capabilities: payrollCapabilityPayload(access) });
  } catch (error) {
    return payrollErrorResponse(error, "Could not reject payroll period.");
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
