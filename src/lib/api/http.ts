import { RequestValidationError } from "@/lib/api/validation";

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Response) {
    return error.statusText || "Request failed";
  }

  if (error instanceof RequestValidationError) {
    return error.message;
  }

  return error instanceof Error ? error.message : "Something went wrong.";
}

export function jsonErrorFromUnknown(error: unknown, fallback: string, status = 500) {
  if (error instanceof RequestValidationError) {
    return jsonError(error.message);
  }

  return jsonError(error instanceof Error ? error.message : fallback, status);
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function databaseErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";

  if (
    !process.env.DATABASE_URL ||
    message.includes("Environment variable not found: DATABASE_URL") ||
    message.includes("must provide a nonempty URL")
  ) {
    return "Database is not connected. Add your Neon DATABASE_URL in .env, then run the database migration.";
  }

  if (code === "P2021" || message.includes("does not exist in the current database")) {
    return "Database tables are missing. Run `npm run db:migrate -- --name init` and try again.";
  }

  if (code === "P1001") {
    return "Could not reach the database. Check your Neon connection string and internet connection.";
  }

  if (code === "P2002") {
    return "This record already exists.";
  }

  return null;
}
