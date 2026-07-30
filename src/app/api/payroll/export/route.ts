import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { requireUser } from "@/lib/auth/session";
import {
  logPayrollAudit,
  parsePayrollBusinessRequest,
  payrollErrorResponse,
  payrollMethodNotAllowed,
} from "@/lib/payroll/api";
import { requirePayrollAccess } from "@/lib/payroll/authorization";
import { payrollDashboardToCsv } from "@/lib/payroll/export";
import { listPayrollDashboard } from "@/lib/payroll/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "payroll.export", 20, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const filters = parsePayrollBusinessRequest(request.url);
    const access = await requirePayrollAccess({
      userId: user.id,
      businessId: filters.businessId,
      permission: "payroll:export",
    });
    const dashboard = await listPayrollDashboard({
      businessId: access.businessId,
      locationId: filters.locationId,
      includeSensitive: false,
    });
    const csv = payrollDashboardToCsv(dashboard);

    await logPayrollAudit({
      access,
      action: "payroll.export_generated",
      metadata: {
        employeeCount: dashboard.employees.length,
        periodCount: dashboard.periods.length,
      },
    });

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="payroll-preview-report.csv"',
      },
    });
  } catch (error) {
    return payrollErrorResponse(error, "Could not export payroll.");
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
