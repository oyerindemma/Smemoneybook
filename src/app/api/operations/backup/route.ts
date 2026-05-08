import { requireUser } from "@/lib/auth/session";
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { exportBusinessBackup } from "@/lib/operations/service";
import { logApiFailure } from "@/lib/operations/monitoring";

export const runtime = "nodejs";

export async function GET(request: Request) {
  let userId: string | undefined;

  try {
    const user = await requireUser();
    userId = user.id;
    const businessId = new URL(request.url).searchParams.get("businessId") ?? undefined;
    const backup = await exportBusinessBackup(user.id, businessId);

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
