import { requireUser } from "@/lib/auth/session";
import { jsonError } from "@/lib/api/http";
import { getOpenDebtsForUser } from "@/lib/bookkeeping/persistence";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const debts = await getOpenDebtsForUser(user.id);

    if (!debts) {
      return jsonError("Create a business to track people owing you.", 404);
    }

    return Response.json({ debts });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonError("Could not load people owing you.", 500);
  }
}
