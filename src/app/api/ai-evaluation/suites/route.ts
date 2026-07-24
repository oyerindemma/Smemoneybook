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
  parseAiEvaluationListRequest,
} from "@/lib/ai-evaluation/api";
import { requireAiEvaluationAccess } from "@/lib/ai-evaluation/authorization";
import { aiEvaluationTargetFeatures } from "@/lib/ai-evaluation/definitions";
import {
  createDefaultAiEvaluationSuite,
  getAiEvaluationProviderSetupStatus,
  listAiEvaluationSuites,
} from "@/lib/ai-evaluation/runner";

export const runtime = "nodejs";

const suiteCreateSchema = z.object({
  businessId: z.preprocess((value) => value ?? "", z.string().trim().min(1, "Choose a business.")),
  targetFeature: z.enum(aiEvaluationTargetFeatures).default("all_ai_surfaces"),
  name: z.preprocess((value) => value ?? "", z.string().trim().max(120)).optional(),
  description: z.preprocess((value) => value ?? "", z.string().trim().max(500)).optional(),
});

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "ai_evaluation.suites.read", 80, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const filters = parseAiEvaluationListRequest(request.url);
    const access = await requireAiEvaluationAccess({
      user,
      businessId: filters.businessId,
      permission: "ai_evaluation:read",
    });
    const suites = await listAiEvaluationSuites({
      businessId: access.businessId,
      targetFeature: filters.targetFeature,
      status: filters.status,
      limit: filters.limit,
    });

    return Response.json({
      suites,
      capabilities: capabilityPayload(access),
      providerSetup: getAiEvaluationProviderSetupStatus(),
    });
  } catch (error) {
    return aiEvaluationErrorResponse(error, "Could not load AI evaluation suites.");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "ai_evaluation.suites.write", 20, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const body = await parseJsonBody(request, suiteCreateSchema);
    const access = await requireAiEvaluationAccess({
      user,
      businessId: body.businessId,
      permission: "ai_evaluation:manage_cases",
    });
    const suite = await createDefaultAiEvaluationSuite({
      businessId: access.businessId,
      createdByUserId: user.id,
      targetFeature: body.targetFeature,
      name: body.name,
      description: body.description,
    });

    await logAiEvaluationAudit({
      access,
      action: "ai_evaluation.suite_created",
      metadata: {
        suiteId: suite.id,
        targetFeature: suite.targetFeature,
        datasetVersion: suite.datasetVersion,
      },
    });

    return Response.json({ suite, capabilities: capabilityPayload(access) }, { status: 201 });
  } catch (error) {
    return aiEvaluationErrorResponse(error, "Could not create AI evaluation suite.");
  }
}

export function PUT() {
  return aiEvaluationMethodNotAllowed("GET, POST");
}

export function PATCH() {
  return aiEvaluationMethodNotAllowed("GET, POST");
}

export function DELETE() {
  return aiEvaluationMethodNotAllowed("GET, POST");
}
