import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { requireUser } from "@/lib/auth/session";
import {
  parseTaxAssistantRequest,
  taxAssistantErrorResponse,
  taxAssistantMethodNotAllowed,
} from "@/lib/tax-assistant/api";
import { requireTaxAssistantAccess } from "@/lib/tax-assistant/authorization";
import { getTaxAssistantRulesForBusiness } from "@/lib/tax-assistant/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "tax_assistant.rules", 80, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const filters = parseTaxAssistantRequest(request.url);
    const access = await requireTaxAssistantAccess({
      userId: user.id,
      businessId: filters.businessId,
      locationId: filters.locationId,
      permission: "tax_assistant:read",
    });
    const rules = await getTaxAssistantRulesForBusiness({ businessId: access.businessId });

    return Response.json(rules);
  } catch (error) {
    return taxAssistantErrorResponse(error, "Could not load Tax Assistant rule source.");
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
