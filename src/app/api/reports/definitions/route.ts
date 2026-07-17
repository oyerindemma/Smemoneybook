import { requireUser } from "@/lib/auth/session";
import { jsonError } from "@/lib/api/http";
import { reportDefinitions } from "@/lib/reports/definitions";
import { requirePhase2Feature } from "@/lib/phase2/feature-flags";

export const runtime = "nodejs";

export async function GET() {
  try {
    const gated = requirePhase2Feature("reportingCentre", "Reporting centre");

    if (gated) {
      return gated;
    }

    await requireUser();
    return Response.json({ reports: reportDefinitions });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonError("Could not load report definitions.", 500);
  }
}
