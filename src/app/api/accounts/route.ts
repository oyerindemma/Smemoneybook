import { requireUser } from "@/lib/auth/session";
import { assertSameOriginRequest, jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import {
  accountRequestSchema,
  parseJsonBody,
  RequestValidationError,
} from "@/lib/api/validation";
import {
  createAccountForUser,
  getDashboardStateForUser,
} from "@/lib/bookkeeping/persistence";

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

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const body = await parseJsonBody(request, accountRequestSchema);
    const state = await createAccountForUser({ userId: user.id, ...body });

    return Response.json({ state }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    if (!(error instanceof RequestValidationError)) {
      console.error(error);
    }

    return jsonErrorFromUnknown(error, "Could not create this account.");
  }
}
