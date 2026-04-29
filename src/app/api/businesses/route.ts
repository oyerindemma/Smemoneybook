import { requireUser } from "@/lib/auth/session";
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { businessRequestSchema, parseJsonBody } from "@/lib/api/validation";
import {
  createBusinessForUser,
  getFirstBusinessForUser,
} from "@/lib/bookkeeping/persistence";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const business = await getFirstBusinessForUser(user.id);
    return Response.json({ business });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonError("Could not load your business.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const { name } = await parseJsonBody(request, businessRequestSchema);

    const business = await createBusinessForUser(user.id, name);
    return Response.json({ business }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not create your business.");
  }
}
