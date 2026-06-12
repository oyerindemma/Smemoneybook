import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { assertSameOriginRequest, jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { parseJsonBody, restoreBackupRequestSchema } from "@/lib/api/validation";
import { validateRestoreBackup } from "@/lib/operations/service";
import { logApiFailure } from "@/lib/operations/monitoring";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let userId: string | undefined;

  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    userId = user.id;
    const body = await parseJsonBody(request, restoreBackupRequestSchema);
    const limited = await enforceRateLimit(request, "operations.restore.validate", 10, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const result = await validateRestoreBackup(user.id, body, body.businessId);

    return Response.json(result);
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    await logApiFailure({ request, error, actorId: userId });
    return jsonErrorFromUnknown(error, "Could not validate restore backup.");
  }
}
