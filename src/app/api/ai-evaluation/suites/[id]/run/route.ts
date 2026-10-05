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
import { runAiEvaluationSuite } from "@/lib/ai-evaluation/runner";

export const runtime = "nodejs";

const runSchema = z.object({
  businessId: z.preprocess((value) => value ?? "", z.string().trim().min(1, "Choose a business.")),
  model: z.preprocess((value) => value ?? "", z.string().trim().max(120)).optional(),
  promptVersion: z.preprocess((value) => value ?? "", z.string().trim().max(120)).optional(),
  defer: z.boolean().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "ai_evaluation.run", 10, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const body = await parseJsonBody(request, runSchema);
    const access = await requireAiEvaluationAccess({
      user,
      businessId: body.businessId,
      permission: "ai_evaluation:run",
    });
    const { id } = await params;

    await logAiEvaluationAudit({
      access,
      action: "ai_evaluation.run_started",
      metadata: { suiteId: id, model: body.model ?? "deterministic-grounded-preview" },
    });

    const run = await runAiEvaluationSuite({
      businessId: access.businessId,
      suiteId: id,
      initiatedByUserId: user.id,
      model: body.model,
      promptVersion: body.promptVersion,
      defer: Boolean(body.defer),
    });

    if (!body.defer) {
      await logAiEvaluationAudit({
        access,
        action: "ai_evaluation.run_completed",
        metadata: {
          suiteId: id,
          runId: run.id,
          criticalFailures: run.summary?.criticalFailures ?? null,
          acceptableAsBaseline: run.summary?.acceptableAsBaseline ?? null,
        },
      });
    }

    return Response.json({ run, capabilities: capabilityPayload(access) }, { status: 201 });
  } catch (error) {
    return aiEvaluationErrorResponse(error, "Could not run AI evaluation suite.");
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
