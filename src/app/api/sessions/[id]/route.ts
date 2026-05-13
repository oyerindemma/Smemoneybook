import { destroySessionById, requireUser } from "@/lib/auth/session";
import { assertSameOriginRequest, jsonError } from "@/lib/api/http";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const { id } = await params;
    await destroySessionById(user.id, id);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonError("Could not remove this session.", 500);
  }
}
