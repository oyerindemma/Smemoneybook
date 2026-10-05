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
import { reversePayrollPeriod } from "@/lib/payroll/service";
import { periodReverseSchema } from "@/lib/payroll/validation";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "payroll.period.reverse", 15, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const body = await parseJsonBody(request, periodReverseSchema);
    const access = await requirePayrollAccess({
      userId: user.id,
      businessId: body.businessId,
      permission: "payroll:approve",
    });
    const { id } = await params;
    const period = await reversePayrollPeriod({
      businessId: access.businessId,
      periodId: id,
      actorId: user.id,
      reason: body.reason,
    });

    await logPayrollAudit({
      access,
      action: "payroll.period_reversed",
      metadata: { periodId: period.id },
    });

    return Response.json({ period, capabilities: payrollCapabilityPayload(access) });
  } catch (error) {
    return payrollErrorResponse(error, "Could not reverse payroll period.");
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
