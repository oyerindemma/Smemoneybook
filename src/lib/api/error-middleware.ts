import { databaseErrorMessage, jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { logApiFailure } from "@/lib/operations/monitoring";
import { structuredLog } from "@/lib/monitoring/structured-log";

type ApiHandler = (request: Request) => Promise<Response>;

export function withApiErrorHandling(
  handler: ApiHandler,
  fallback = "Something went wrong. Try again.",
) {
  return async function handledApiRoute(request: Request) {
    try {
      return await handler(request);
    } catch (error) {
      return handleApiError(request, error, fallback);
    }
  };
}

export async function handleApiError(
  request: Request,
  error: unknown,
  fallback = "Something went wrong. Try again.",
) {
  if (error instanceof Response) {
    return jsonError(error.status === 401 ? "Sign in to continue." : "Request failed.", error.status);
  }

  structuredLog("error", "api.route_failed", {
    route: new URL(request.url).pathname,
    method: request.method,
    message: error instanceof Error ? error.message : "Unknown error",
  });
  await logApiFailure({ request, error });

  const setupMessage = databaseErrorMessage(error);
  return setupMessage ? jsonError(setupMessage, 503) : jsonErrorFromUnknown(error, fallback);
}
