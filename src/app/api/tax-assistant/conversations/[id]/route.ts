import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { requireUser } from "@/lib/auth/session";
import {
  parseTaxAssistantRequest,
  taxAssistantErrorResponse,
  taxAssistantMethodNotAllowed,
} from "@/lib/tax-assistant/api";
import { requireTaxAssistantAccess } from "@/lib/tax-assistant/authorization";
import { getTaxAssistantConversation } from "@/lib/tax-assistant/service";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "tax_assistant.conversation", 80, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const filters = parseTaxAssistantRequest(request.url);
    const access = await requireTaxAssistantAccess({
      userId: user.id,
      businessId: filters.businessId,
      locationId: filters.locationId,
      permission: "tax_assistant:ask",
    });
    const { id } = await params;
    const conversation = await getTaxAssistantConversation({
      businessId: access.businessId,
      userId: user.id,
      conversationId: id,
    });

    if (!conversation) {
      return Response.json({ error: "Tax Assistant conversation was not found." }, { status: 404 });
    }

    return Response.json({ conversation });
  } catch (error) {
    return taxAssistantErrorResponse(error, "Could not load Tax Assistant conversation.");
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
