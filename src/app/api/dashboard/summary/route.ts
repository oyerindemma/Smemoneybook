import { requireUser } from "@/lib/auth/session";
import { databaseErrorMessage, jsonError } from "@/lib/api/http";
import { getDashboardStateForUser } from "@/lib/bookkeeping/persistence";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const businessId = new URL(request.url).searchParams.get("businessId") ?? undefined;
    const state = await getDashboardStateForUser(user.id, businessId);

    if (!state) {
      return jsonError("Create a business to start tracking money.", 404);
    }

    return Response.json({ state });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    const setupMessage = databaseErrorMessage(error);
    return jsonError(
      setupMessage ?? "Could not load your money summary.",
      setupMessage ? 503 : 500,
    );
  }
}
