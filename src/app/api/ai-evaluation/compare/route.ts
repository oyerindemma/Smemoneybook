import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { requireUser } from "@/lib/auth/session";
import {
  aiEvaluationErrorResponse,
  aiEvaluationMethodNotAllowed,
  capabilityPayload,
  parseAiEvaluationCompareRequest,
} from "@/lib/ai-evaluation/api";
import { requireAiEvaluationAccess } from "@/lib/ai-evaluation/authorization";
import { compareAiEvaluationRunRecords } from "@/lib/ai-evaluation/runner";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "ai_evaluation.compare", 60, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const filters = parseAiEvaluationCompareRequest(request.url);
    const access = await requireAiEvaluationAccess({
      user,
      businessId: filters.businessId,
      permission: "ai_evaluation:compare_models",
    });
    const comparison = await compareAiEvaluationRunRecords({
      businessId: access.businessId,
      leftRunId: filters.leftRunId,
      rightRunId: filters.rightRunId,
    });

    return Response.json({ comparison, capabilities: capabilityPayload(access) });
  } catch (error) {
    return aiEvaluationErrorResponse(error, "Could not compare AI evaluation runs.");
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
