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
import { postPayrollExpense } from "@/lib/payroll/service";
import { periodActionSchema } from "@/lib/payroll/validation";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "payroll.period.post_expense", 15, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const body = await parseJsonBody(request, periodActionSchema);
    const access = await requirePayrollAccess({
      userId: user.id,
      businessId: body.businessId,
      permission: "payroll:post_expense",
    });
    const { id } = await params;
    const result = await postPayrollExpense({
      businessId: access.businessId,
      periodId: id,
      actorId: user.id,
    });

    await logPayrollAudit({
      access,
      action: "payroll.expense_posted",
      metadata: {
        periodId: result.period.id,
        transactionId: result.transaction.id,
        alreadyPosted: result.alreadyPosted,
      },
    });

    return Response.json({ result, capabilities: payrollCapabilityPayload(access) });
  } catch (error) {
    return payrollErrorResponse(error, "Could not post payroll expense.");
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
