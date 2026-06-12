import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { requireFeatureAccess } from "@/lib/billing/subscriptions";
import { requireBusinessAccess } from "@/lib/operations/access";
import { exportBusinessBackup } from "@/lib/operations/service";
import { logApiFailure } from "@/lib/operations/monitoring";

export const runtime = "nodejs";

export async function GET(request: Request) {
  let userId: string | undefined;

  try {
    const user = await requireUser();
    userId = user.id;
    const limited = await enforceRateLimit(request, "operations.backup.export", 20, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const businessId = new URL(request.url).searchParams.get("businessId") ?? undefined;
    const access = await requireBusinessAccess(user.id, "backup:read", businessId);
    const gated = await requireFeatureAccess(user.id, access.businessId, "basic_exports");

    if (gated) {
      return gated;
    }

    const backup = await exportBusinessBackup(user.id, access.businessId);

    return Response.json(backup, {
      headers: {
        "Content-Disposition": `attachment; filename="sme-moneybook-backup-${backup.exportedAt.slice(0, 10)}.json"`,
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    await logApiFailure({ request, error, actorId: userId });
    return jsonErrorFromUnknown(error, "Could not export backup.");
  }
}
