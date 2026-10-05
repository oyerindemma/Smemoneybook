import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { requireUser } from "@/lib/auth/session";
import {
  logTaxAssistantEvent,
  parseTaxAssistantRequest,
  taxAssistantErrorResponse,
  taxAssistantMethodNotAllowed,
} from "@/lib/tax-assistant/api";
import { requireTaxAssistantAccess } from "@/lib/tax-assistant/authorization";
import { exportTaxWorkingPaper } from "@/lib/tax-assistant/export";
import { calculateTaxAssistantForBusiness } from "@/lib/tax-assistant/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "tax_assistant.export", 20, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const filters = parseTaxAssistantRequest(request.url);
    const access = await requireTaxAssistantAccess({
      userId: user.id,
      businessId: filters.businessId,
      locationId: filters.locationId,
      permission: "tax_assistant:export",
    });
    const summary = await calculateTaxAssistantForBusiness({
      businessId: access.businessId,
      locationId: access.locationId,
      periodStart: filters.periodStart,
      periodEnd: filters.periodEnd,
    });
    const exportResult = exportTaxWorkingPaper(summary);

    await logTaxAssistantEvent({
      access,
      action: "tax_assistant.report_exported",
      message: "Tax Assistant working paper exported.",
      periodStart: filters.periodStart,
      periodEnd: filters.periodEnd,
      metadata: {
        rowCount: exportResult.rowCount,
        ruleSetVersion: summary.ruleSetVersion,
      },
    });

    return new Response(exportResult.csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportResult.filename}"`,
      },
    });
  } catch (error) {
    return taxAssistantErrorResponse(error, "Could not export Tax Assistant working paper.");
  }
}

export function POST() {
  return taxAssistantMethodNotAllowed();
}

export function PUT() {
  return taxAssistantMethodNotAllowed();
}

export function PATCH() {
  return taxAssistantMethodNotAllowed();
}

export function DELETE() {
  return taxAssistantMethodNotAllowed();
}
