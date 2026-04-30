import { getPrisma } from "@/lib/prisma";

export function errorCode(error: unknown) {
  return typeof error === "object" && error && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

export async function logApiFailure({
  request,
  error,
  actorId,
  businessId,
}: {
  request: Request;
  error: unknown;
  actorId?: string;
  businessId?: string;
}) {
  const message = error instanceof Error ? error.message : "Unknown API failure";

  try {
    await getPrisma().apiErrorLog.create({
      data: {
        route: new URL(request.url).pathname,
        method: request.method,
        message: message.slice(0, 500),
        code: errorCode(error),
        actorId,
        businessId,
      },
    });
  } catch (loggingError) {
    console.error("Could not write API error log", loggingError);
  }
}
