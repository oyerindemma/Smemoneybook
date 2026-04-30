import { requireUser } from "@/lib/auth/session";
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { acceptInvitation } from "@/lib/operations/service";
import { logApiFailure } from "@/lib/operations/monitoring";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  let userId: string | undefined;

  try {
    const user = await requireUser();
    userId = user.id;
    const { token } = await params;
    const result = await acceptInvitation({ token, userId: user.id });

    return Response.json(result);
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    await logApiFailure({ request, error, actorId: userId });
    return jsonErrorFromUnknown(error, "Could not accept this invitation.");
  }
}
