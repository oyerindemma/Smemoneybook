import { destroySession } from "@/lib/auth/session";
import { assertSameOriginRequest, jsonError } from "@/lib/api/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    await destroySession();
    return Response.json({ ok: true });
  } catch (error) {
    console.error(error);
    return jsonError("Could not sign out right now.", 500);
  }
}
