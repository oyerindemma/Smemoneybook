import { getCurrentUser } from "@/lib/auth/session";
import { jsonError } from "@/lib/api/http";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return jsonError("Sign in to continue.", 401);
    }

    return Response.json({ user });
  } catch (error) {
    console.error(error);
    return jsonError("Could not load your profile.", 500);
  }
}
