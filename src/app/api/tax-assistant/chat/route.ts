import { z } from "zod";
import { assertSameOriginRequest } from "@/lib/api/http";
import { parseJsonBody } from "@/lib/api/validation";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { requireUser } from "@/lib/auth/session";
import { answerTaxAssistantQuestion } from "@/lib/tax-assistant/assistant";
import {
  taxAssistantErrorResponse,
  taxAssistantMethodNotAllowed,
} from "@/lib/tax-assistant/api";
import { requireTaxAssistantAccess } from "@/lib/tax-assistant/authorization";
import { resolveTaxPeriod } from "@/lib/tax-assistant/periods";

export const runtime = "nodejs";

const chatRequestSchema = z.object({
  businessId: z.preprocess((value) => value ?? "", z.string().trim().min(1, "Choose a business.")),
  locationId: z.preprocess((value) => value ?? "", z.string().trim()).optional(),
  question: z.preprocess((value) => value ?? "", z.string().trim().min(1, "Ask a tax question.").max(600)),
  conversationId: z.preprocess((value) => value ?? "", z.string().trim()).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2020).max(2100).optional(),
  quarter: z.coerce.number().int().min(1).max(4).optional(),
  frequency: z.preprocess((value) => value ?? "", z.string().trim()).optional(),
  from: z.preprocess((value) => value ?? "", z.string().trim()).optional(),
  to: z.preprocess((value) => value ?? "", z.string().trim()).optional(),
});

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "tax_assistant.chat", 20, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const body = await parseJsonBody(request, chatRequestSchema);
    const period = resolveTaxPeriod({
      month: body.month,
      year: body.year,
      quarter: body.quarter,
      frequency: body.frequency,
      from: body.from,
      to: body.to,
    });
    const access = await requireTaxAssistantAccess({
      userId: user.id,
      businessId: body.businessId,
      locationId: body.locationId || undefined,
      permission: "tax_assistant:ask",
    });
    const result = await answerTaxAssistantQuestion({
      access,
      question: body.question,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      locationId: access.locationId,
      conversationId: body.conversationId || undefined,
    });

    return Response.json({ result });
  } catch (error) {
    return taxAssistantErrorResponse(error, "Could not answer Tax Assistant question.");
  }
}

export function GET() {
  return taxAssistantMethodNotAllowed("POST");
}

export function PUT() {
  return taxAssistantMethodNotAllowed("POST");
}

export function PATCH() {
  return taxAssistantMethodNotAllowed("POST");
}

export function DELETE() {
  return taxAssistantMethodNotAllowed("POST");
}
