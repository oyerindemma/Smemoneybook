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
import { generatePayrollPayslips } from "@/lib/payroll/service";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "payroll.period.payslips", 30, 60 * 60 * 1000);

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
    const payslips = await generatePayrollPayslips({
      businessId: access.businessId,
      periodId: id,
      actorId: user.id,
    });

    await logPayrollAudit({
      access,
      action: "payroll.payslips_generated",
      metadata: { periodId: id, count: payslips.length },
    });

    return Response.json({
      payslips,
      capabilities: payrollCapabilityPayload(access),
    });
  } catch (error) {
    return payrollErrorResponse(error, "Could not generate payroll payslips.");
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
