import { jsonError } from "@/lib/api/http";

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

function clientKey(request: Request, scope: string) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local";
  return `${scope}:${ip}`;
}

export function enforceRateLimit(
  request: Request,
  scope: string,
  limit = 8,
  windowMs = 15 * 60 * 1000,
) {
  const key = clientKey(request, scope);
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  bucket.count += 1;

  if (bucket.count > limit) {
    return jsonError("Too many attempts. Wait a few minutes and try again.", 429);
  }

  return null;
}
