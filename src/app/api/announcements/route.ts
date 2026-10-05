import { requireUser } from "@/lib/auth/session";
import { assertSameOriginRequest, jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { announcementRequestSchema, parseJsonBody } from "@/lib/api/validation";
import {
  createAnnouncementForAdmin,
  listAnnouncementsForUser,
} from "@/lib/announcements/service";
import { requirePhase2Feature } from "@/lib/phase2/feature-flags";

export const runtime = "nodejs";

export async function GET() {
  try {
    const gated = requirePhase2Feature("announcements", "Announcements");

    if (gated) {
      return gated;
    }

    const user = await requireUser();
    const announcements = await listAnnouncementsForUser(user.id);
    return Response.json({ announcements });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not load announcements.");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const gated = requirePhase2Feature("announcements", "Announcements");

    if (gated) {
      return gated;
    }

    const user = await requireUser();
    const adminEmails = (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);

    if (!adminEmails.includes(user.email.toLowerCase())) {
      return jsonError("Only admins can publish announcements.", 403);
    }

    const body = await parseJsonBody(request, announcementRequestSchema);
    const announcement = await createAnnouncementForAdmin(user.id, body);
    return Response.json({ announcement }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not create announcement.");
  }
}
