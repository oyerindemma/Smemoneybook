import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { assertSameOriginRequest, jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { parseJsonBody } from "@/lib/api/validation";
import { requireMinimumPlan } from "@/lib/billing/subscriptions";
import { requireBusinessAccess } from "@/lib/operations/access";
import { getPrisma } from "@/lib/prisma";
import { requirePhase3Feature } from "@/lib/phase3/feature-flags";
import {
  createAiEvaluationDataset,
  getAiEvaluationOverview,
  recordAiEvaluationEvent,
  recordAiEvaluationRun,
} from "@/lib/phase3/ai-evaluation-service";

export const runtime = "nodejs";

const businessId = z.preprocess((val) => val ?? "", z.string().trim().min(1, "Choose a business."));
const optionalText = z.preprocess(
  (val) => (typeof val === "string" && val.trim() ? val.trim() : undefined),
  z.string().optional(),
).optional();
const optionalInteger = z.preprocess(
  (val) => val ?? undefined,
  z.coerce.number().int().nonnegative().optional(),
).optional();

const aiEvaluationActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("event"),
    businessId,
    feature: z.string().trim().min(2),
    artifactType: z.string().trim().min(2),
    artifactId: optionalText,
    eventType: z.enum(["request", "feedback", "recommendation", "categorization", "tool_call", "tool_failure", "safety"]),
    rating: z.enum(["helpful", "not_helpful", "correct", "incorrect", "accepted", "rejected", "failed"]).optional(),
    accepted: z.boolean().optional(),
    correct: z.boolean().optional(),
    correction: optionalText,
    modelVersion: optionalText,
    promptVersion: optionalText,
    toolName: optionalText,
    latencyMs: optionalInteger,
    costKobo: optionalInteger,
    safetyLabel: optionalText,
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    action: z.literal("dataset"),
    businessId,
    name: z.string().trim().min(2).max(120),
    description: optionalText,
    purpose: z.string().trim().min(2).max(120),
    source: z.string().trim().min(2).max(120),
    retentionPolicy: z.string().trim().min(2).max(160),
    piiRedacted: z.boolean(),
    consentRequired: z.boolean(),
    sampleCount: z.coerce.number().int().nonnegative(),
  }),
  z.object({
    action: z.literal("run"),
    businessId,
    datasetId: optionalText,
    modelVersion: z.string().trim().min(1),
    promptVersion: z.string().trim().min(1),
    evaluatorVersion: z.string().trim().min(1),
    status: z.enum(["queued", "running", "completed", "failed"]),
    metrics: z.record(z.string(), z.unknown()),
    safetyFindings: z.record(z.string(), z.unknown()).optional(),
  }),
]);

export async function GET(request: Request) {
  try {
    const featureGate = requirePhase3Feature("aiEvaluation", "AI evaluation");

    if (featureGate) {
      return featureGate;
    }

    const user = await requireUser();
    const limited = await enforceRateLimit(request, "ai_evaluation.read", 80, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const { searchParams } = new URL(request.url);
    const requestedBusinessId = searchParams.get("businessId") ?? undefined;
    const access = await requireBusinessAccess(user.id, "reports:write", requestedBusinessId);
    const planGate = await requireMinimumPlan(
      user.id,
      access.businessId,
      "pro",
      "Upgrade to Pro to use AI Evaluation.",
    );

    if (planGate) {
      return planGate;
    }

    const overview = await getAiEvaluationOverview({
      businessId: access.businessId,
      since: readSince(searchParams.get("days")),
    });

    return Response.json({ overview });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error("ai_evaluation.read_failed", error);
    return jsonErrorFromUnknown(error, "Could not load AI evaluation.");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const featureGate = requirePhase3Feature("aiEvaluation", "AI evaluation");

    if (featureGate) {
      return featureGate;
    }

    const user = await requireUser();
    const body = await parseJsonBody(request, aiEvaluationActionSchema);
    const limited = await enforceRateLimit(request, "ai_evaluation.write", 60, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const access = await requireBusinessAccess(user.id, "reports:write", body.businessId);
    const planGate = await requireMinimumPlan(
      user.id,
      access.businessId,
      "pro",
      "Upgrade to Pro to use AI Evaluation.",
    );

    if (planGate) {
      return planGate;
    }

    const result = await runAction({
      body,
      businessId: access.businessId,
      actorId: user.id,
    });

    await getPrisma().auditLog.create({
      data: {
        businessId: access.businessId,
        actorId: user.id,
        action: `ai_evaluation.${body.action}`,
        message: "AI evaluation record saved.",
        metadata: {
          feature: "phase3p_ai_evaluation",
          action: body.action,
          resultId: result.id,
        } as Prisma.InputJsonObject,
      },
    });

    return Response.json({ result, message: "AI evaluation record saved." });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error("ai_evaluation.write_failed", error);
    return jsonErrorFromUnknown(error, "Could not save AI evaluation.");
  }
}

async function runAction({
  body,
  businessId,
  actorId,
}: {
  body: z.infer<typeof aiEvaluationActionSchema>;
  businessId: string;
  actorId: string;
}) {
  if (body.action === "event") {
    return recordAiEvaluationEvent({
      businessId,
      actorId,
      feature: body.feature,
      artifactType: body.artifactType,
      artifactId: body.artifactId,
      eventType: body.eventType,
      rating: body.rating,
      accepted: body.accepted,
      correct: body.correct,
      correction: body.correction,
      modelVersion: body.modelVersion,
      promptVersion: body.promptVersion,
      toolName: body.toolName,
      latencyMs: body.latencyMs,
      costKobo: body.costKobo,
      safetyLabel: body.safetyLabel,
      metadata: body.metadata,
    });
  }

  if (body.action === "dataset") {
    return createAiEvaluationDataset({
      businessId,
      name: body.name,
      description: body.description,
      purpose: body.purpose,
      source: body.source,
      retentionPolicy: body.retentionPolicy,
      piiRedacted: body.piiRedacted,
      consentRequired: body.consentRequired,
      sampleCount: body.sampleCount,
    });
  }

  return recordAiEvaluationRun({
    businessId,
    datasetId: body.datasetId,
    modelVersion: body.modelVersion,
    promptVersion: body.promptVersion,
    evaluatorVersion: body.evaluatorVersion,
    status: body.status,
    metrics: body.metrics,
    safetyFindings: body.safetyFindings,
  });
}

function readSince(daysValue: string | null) {
  const days = daysValue ? Number.parseInt(daysValue, 10) : 30;
  const safeDays = Number.isFinite(days) ? Math.max(1, Math.min(90, days)) : 30;

  return new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);
}
