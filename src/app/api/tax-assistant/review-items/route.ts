import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { requireUser } from "@/lib/auth/session";
import {
  parseTaxAssistantListRequest,
  taxAssistantErrorResponse,
  taxAssistantMethodNotAllowed,
} from "@/lib/tax-assistant/api";
import { requireTaxAssistantAccess } from "@/lib/tax-assistant/authorization";
import { listTaxAssistantReviewItems } from "@/lib/tax-assistant/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "tax_assistant.review_items", 80, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const filters = parseTaxAssistantListRequest(request.url);
    const access = await requireTaxAssistantAccess({
      userId: user.id,
      businessId: filters.businessId,
      locationId: filters.locationId,
      permission: "tax_assistant:review",
    });
    const result = await listTaxAssistantReviewItems({
      businessId: access.businessId,
      locationId: access.locationId,
      periodStart: filters.periodStart,
      periodEnd: filters.periodEnd,
      severity: filters.severity,
      issueType: filters.issueType,
      limit: filters.limit,
    });

    return Response.json(result);
  } catch (error) {
    return taxAssistantErrorResponse(error, "Could not load Tax Assistant review items.");
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
