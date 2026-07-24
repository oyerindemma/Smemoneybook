import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { requireUser } from "@/lib/auth/session";
import {
  aiEvaluationErrorResponse,
  aiEvaluationMethodNotAllowed,
  logAiEvaluationAudit,
  parseAiEvaluationBusinessRequest,
} from "@/lib/ai-evaluation/api";
import { AiEvaluationDomainError } from "@/lib/ai-evaluation/api";
import { requireAiEvaluationAccess } from "@/lib/ai-evaluation/authorization";
import { buildAiEvaluationCsv } from "@/lib/ai-evaluation/report";
import { getAiEvaluationRunDetail } from "@/lib/ai-evaluation/runner";
import type { AiEvaluationCaseResult } from "@/lib/ai-evaluation/definitions";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "ai_evaluation.export", 30, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const filters = parseAiEvaluationBusinessRequest(request.url);
    const runId = new URL(request.url).searchParams.get("runId")?.trim();

    if (!runId) {
      throw new AiEvaluationDomainError("Choose an AI evaluation run to export.", 400, "run_required");
    }

    const access = await requireAiEvaluationAccess({
      user,
      businessId: filters.businessId,
      permission: "ai_evaluation:export",
    });
    const run = await getAiEvaluationRunDetail({
      businessId: access.businessId,
      runId,
    });

    if (!run.summary) {
      throw new AiEvaluationDomainError("This AI evaluation run has no summary yet.", 409, "summary_required");
    }

    await logAiEvaluationAudit({
      access,
      action: "ai_evaluation.report_exported",
      metadata: { runId },
    });

    const csv = buildAiEvaluationCsv({
      id: run.id,
      suiteName: run.suite?.name ?? "AI evaluation suite",
      targetFeature: run.suite?.targetFeature ?? "all_ai_surfaces",
      model: run.model,
      promptVersion: run.promptVersion,
      toolVersion: run.toolVersion,
      datasetVersion: run.datasetVersion,
      status: run.status,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      summary: run.summary,
      results: run.results.map((result) => ({
        ...result,
        status: normalizeResultStatus(result.status),
        evaluatorResults: result.evaluatorResults as AiEvaluationCaseResult["evaluatorResults"],
        toolCalls: result.toolCalls as AiEvaluationCaseResult["toolCalls"],
        citations: result.citations as AiEvaluationCaseResult["citations"],
        tokenUsage: {
          promptTokens: readNumber(result.tokenUsage, "promptTokens"),
          completionTokens: readNumber(result.tokenUsage, "completionTokens"),
          totalTokens: readNumber(result.tokenUsage, "totalTokens"),
        },
      })),
    });

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="ai-evaluation-${run.id}.csv"`,
      },
    });
  } catch (error) {
    return aiEvaluationErrorResponse(error, "Could not export AI evaluation report.");
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

function normalizeResultStatus(status: string): AiEvaluationCaseResult["status"] {
  if (
    status === "passed" ||
    status === "failed" ||
    status === "needs_review" ||
    status === "critical_failure"
  ) {
    return status;
  }

  return "failed";
}

function readNumber(value: unknown, key: string) {
  if (value && typeof value === "object" && key in value) {
    const parsed = Number((value as Record<string, unknown>)[key]);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}
