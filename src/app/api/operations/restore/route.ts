import { requireUser } from "@/lib/auth/session";
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { validateRestoreBackup } from "@/lib/operations/service";
import { logApiFailure } from "@/lib/operations/monitoring";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let userId: string | undefined;

  try {
    const user = await requireUser();
    userId = user.id;
    const body = await request.json().catch(() => undefined);
    const result = await validateRestoreBackup(user.id, body);

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
