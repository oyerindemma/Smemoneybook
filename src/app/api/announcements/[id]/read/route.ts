import { requireUser } from "@/lib/auth/session";
import { assertSameOriginRequest, jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { announcementReadRequestSchema, parseJsonBody } from "@/lib/api/validation";
import { markAnnouncementForUser } from "@/lib/announcements/service";
import { requirePhase2Feature } from "@/lib/phase2/feature-flags";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOriginRequest(request);
    const gated = requirePhase2Feature("announcements", "Announcements");

    if (gated) {
      return gated;
    }

    const user = await requireUser();
    const { id } = await params;
    const body = await parseJsonBody(request, announcementReadRequestSchema);
    await markAnnouncementForUser({
      userId: user.id,
      announcementId: id,
      dismissed: body.dismissed,
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not update announcement.");
  }
}
