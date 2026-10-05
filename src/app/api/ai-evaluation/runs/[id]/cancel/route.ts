import { assertSameOriginRequest } from "@/lib/api/http";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { requireUser } from "@/lib/auth/session";
import {
  aiEvaluationErrorResponse,
  aiEvaluationMethodNotAllowed,
  capabilityPayload,
  logAiEvaluationAudit,
  parseAiEvaluationBusinessRequest,
} from "@/lib/ai-evaluation/api";
import { requireAiEvaluationAccess } from "@/lib/ai-evaluation/authorization";
import { cancelAiEvaluationRun } from "@/lib/ai-evaluation/runner";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "ai_evaluation.run.cancel", 20, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const filters = parseAiEvaluationBusinessRequest(request.url);
    const access = await requireAiEvaluationAccess({
      user,
      businessId: filters.businessId,
      permission: "ai_evaluation:run",
    });
    const { id } = await params;
    const run = await cancelAiEvaluationRun({
      businessId: access.businessId,
      runId: id,
    });

    await logAiEvaluationAudit({
      access,
      action: "ai_evaluation.run_cancelled",
      metadata: { runId: id },
    });

    return Response.json({ run, capabilities: capabilityPayload(access) });
  } catch (error) {
    return aiEvaluationErrorResponse(error, "Could not cancel AI evaluation run.");
  }
}

export function GET() {
  return aiEvaluationMethodNotAllowed("POST");
}

export function PUT() {
  return aiEvaluationMethodNotAllowed("POST");
}

export function PATCH() {
  return aiEvaluationMethodNotAllowed("POST");
}

export function DELETE() {
  return aiEvaluationMethodNotAllowed("POST");
}
