import { z } from "zod";
import { assertSameOriginRequest } from "@/lib/api/http";
import { parseJsonBody } from "@/lib/api/validation";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { requireUser } from "@/lib/auth/session";
import {
  aiEvaluationErrorResponse,
  aiEvaluationMethodNotAllowed,
  capabilityPayload,
  logAiEvaluationAudit,
} from "@/lib/ai-evaluation/api";
import { requireAiEvaluationAccess } from "@/lib/ai-evaluation/authorization";
import { acceptAiEvaluationBaseline } from "@/lib/ai-evaluation/runner";

export const runtime = "nodejs";

const baselineSchema = z.object({
  businessId: z.preprocess((value) => value ?? "", z.string().trim().min(1, "Choose a business.")),
  notes: z.preprocess((value) => value ?? "", z.string().trim().max(500)).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "ai_evaluation.baseline.accept", 10, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const body = await parseJsonBody(request, baselineSchema);
    const access = await requireAiEvaluationAccess({
      user,
      businessId: body.businessId,
      permission: "ai_evaluation:compare_models",
    });
    const { id } = await params;
    const baseline = await acceptAiEvaluationBaseline({
      businessId: access.businessId,
      runId: id,
      acceptedByUserId: user.id,
      notes: body.notes,
    });

    await logAiEvaluationAudit({
      access,
      action: "ai_evaluation.baseline_accepted",
      metadata: {
        runId: id,
        baselineId: baseline.id,
        targetFeature: baseline.targetFeature,
      },
    });

    return Response.json({ baseline, capabilities: capabilityPayload(access) }, { status: 201 });
  } catch (error) {
    return aiEvaluationErrorResponse(error, "Could not accept AI evaluation baseline.");
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
