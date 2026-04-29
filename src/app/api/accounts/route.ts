import { requireUser } from "@/lib/auth/session";
import { jsonError } from "@/lib/api/http";
import { getDashboardStateForUser } from "@/lib/bookkeeping/persistence";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const state = await getDashboardStateForUser(user.id);

    if (!state) {
      return jsonError("Create a business to see where your money is.", 404);
    }

    return Response.json({ accounts: state.accounts });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonError("Could not load your accounts.", 500);
  }
}
