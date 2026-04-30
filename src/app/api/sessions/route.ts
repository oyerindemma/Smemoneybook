import { listSessionsForUser, requireUser } from "@/lib/auth/session";
import { jsonError } from "@/lib/api/http";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const sessions = await listSessionsForUser(user.id);
    return Response.json({ sessions });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonError("Could not load sessions.", 500);
  }
}
