import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { assertSameOriginRequest, jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { parseJsonBody, reportExportJobRequestSchema } from "@/lib/api/validation";
import { requireFeatureAccess } from "@/lib/billing/subscriptions";
import { requireBusinessAccess } from "@/lib/operations/access";
import { requirePhase2Feature } from "@/lib/phase2/feature-flags";
import {
  createReportExportJobForUser,
  listReportExportJobsForUser,
} from "@/lib/reports/export-jobs";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const gated = requirePhase2Feature("reportingCentre", "Reporting centre");

    if (gated) {
      return gated;
    }

    const user = await requireUser();
    const businessId = new URL(request.url).searchParams.get("businessId");

    if (!businessId) {
      return jsonError("Choose a business.", 400);
    }

    const access = await requireBusinessAccess(user.id, "reports:write", businessId);
    const featureGate = await requireFeatureAccess(user.id, access.businessId, "professional_pdf_exports");

    if (featureGate) {
      return featureGate;
    }

    const jobs = await listReportExportJobsForUser(user.id, access.businessId);
    return Response.json({ jobs });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not load exports.");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const gated = requirePhase2Feature("reportingCentre", "Reporting centre");

    if (gated) {
      return gated;
    }

    const user = await requireUser();
    const body = await parseJsonBody(request, reportExportJobRequestSchema);
    const access = await requireBusinessAccess(user.id, "reports:write", body.businessId);
    const limited = await enforceRateLimit(request, "reports.exports.write", 20, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const featureGate = await requireFeatureAccess(user.id, access.businessId, "professional_pdf_exports");

    if (featureGate) {
      return featureGate;
    }

    const job = await createReportExportJobForUser(user.id, body);
    return Response.json({ job }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not create export.");
  }
}
