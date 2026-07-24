import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { requireUser } from "@/lib/auth/session";
import {
  aiEvaluationErrorResponse,
  aiEvaluationMethodNotAllowed,
  capabilityPayload,
  parseAiEvaluationListRequest,
} from "@/lib/ai-evaluation/api";
import { requireAiEvaluationAccess } from "@/lib/ai-evaluation/authorization";
import { listAiEvaluationRuns } from "@/lib/ai-evaluation/runner";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "ai_evaluation.runs.read", 80, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const filters = parseAiEvaluationListRequest(request.url);
    const access = await requireAiEvaluationAccess({
      user,
      businessId: filters.businessId,
      permission: "ai_evaluation:read",
    });
    const runs = await listAiEvaluationRuns({
      businessId: access.businessId,
      limit: filters.limit,
    });

    return Response.json({ runs, capabilities: capabilityPayload(access) });
  } catch (error) {
    return aiEvaluationErrorResponse(error, "Could not load AI evaluation runs.");
  }
}

export function POST() {
  return aiEvaluationMethodNotAllowed();
}

export function PUT() {
  return aiEvaluationMethodNotAllowed();
}

export function PATCH() {
  return aiEvaluationMethodNotAllowed();
}

export function DELETE() {
  return aiEvaluationMethodNotAllowed();
}
