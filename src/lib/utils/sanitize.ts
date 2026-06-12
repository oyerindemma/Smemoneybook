import { structuredLog } from "@/lib/monitoring/structured-log";

export function sanitizeString(value: unknown): string {
  return value == null ? "" : typeof value === "string" ? value : String(value);
}

export function sanitizePayload<T>(value: T): T {
  if (value == null) {
    return "" as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizePayload(item)) as T;
  }

  if (
    value instanceof Date ||
    (typeof File !== "undefined" && value instanceof File) ||
    (typeof Blob !== "undefined" && value instanceof Blob)
  ) {
    return value;
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, sanitizePayload(entry)]),
    ) as T;
  }

  return value;
}

export function hasNullishValue(value: unknown): boolean {
  if (value == null) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.some((item) => hasNullishValue(item));
  }

  if (typeof value === "object") {
    return Object.values(value).some((entry) => hasNullishValue(entry));
  }

  return false;
}

export function logMalformedPayload(input: {
  request: Request;
  reason: string;
  body?: unknown;
}) {
  structuredLog("warn", "api.malformed_payload", {
    route: new URL(input.request.url).pathname,
    method: input.request.method,
    reason: input.reason,
    hasNullishValue: hasNullishValue(input.body),
  });
}
