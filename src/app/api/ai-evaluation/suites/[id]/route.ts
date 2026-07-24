import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { requireUser } from "@/lib/auth/session";
import {
  aiEvaluationErrorResponse,
  aiEvaluationMethodNotAllowed,
  capabilityPayload,
  parseAiEvaluationBusinessRequest,
} from "@/lib/ai-evaluation/api";
import { requireAiEvaluationAccess } from "@/lib/ai-evaluation/authorization";
import { getAiEvaluationSuiteDetail } from "@/lib/ai-evaluation/runner";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "ai_evaluation.suite.detail", 80, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const filters = parseAiEvaluationBusinessRequest(request.url);
    const access = await requireAiEvaluationAccess({
      user,
      businessId: filters.businessId,
      permission: "ai_evaluation:read",
    });
    const { id } = await params;
    const suite = await getAiEvaluationSuiteDetail({
      businessId: access.businessId,
      suiteId: id,
    });

    return Response.json({ suite, capabilities: capabilityPayload(access) });
  } catch (error) {
    return aiEvaluationErrorResponse(error, "Could not load AI evaluation suite.");
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
