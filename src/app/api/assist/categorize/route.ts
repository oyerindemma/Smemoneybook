import { requireUser } from "@/lib/auth/session";
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { categorizationRequestSchema, parseJsonBody } from "@/lib/api/validation";
import { suggestCategory } from "@/lib/assist/categorization";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await requireUser();
    const body = await parseJsonBody(request, categorizationRequestSchema);
    return Response.json({ suggestion: suggestCategory(body) });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not suggest a category.");
  }
}
