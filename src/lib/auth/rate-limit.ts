import { createHash } from "node:crypto";
import { getPrisma } from "@/lib/prisma";

function clientKey(request: Request, scope: string) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local";
  const userAgent = request.headers.get("user-agent")?.slice(0, 120) || "unknown";
  return createHash("sha256").update(`${scope}:${ip}:${userAgent}`).digest("hex");
}

export async function enforceRateLimit(
  request: Request,
  scope: string,
  limit = 8,
  windowMs = 15 * 60 * 1000,
) {
  const key = clientKey(request, scope);
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);
  const bucket = await getPrisma().rateLimitBucket.findUnique({ where: { key } });

  if (!bucket || bucket.resetAt <= now) {
    await getPrisma().rateLimitBucket.upsert({
      where: { key },
      create: { key, count: 1, resetAt },
      update: { count: 1, resetAt },
    });
    return null;
  }

  const updated = await getPrisma().rateLimitBucket.update({
    where: { key },
    data: { count: { increment: 1 } },
  });

  if (updated.count > limit) {
    return Response.json(
      { error: "Too many attempts. Wait a few minutes and try again." },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.max(1, Math.ceil((bucket.resetAt.getTime() - now.getTime()) / 1000)),
          ),
        },
      },
    );
  }

  void getPrisma().rateLimitBucket.deleteMany({
    where: { resetAt: { lt: new Date(now.getTime() - windowMs) } },
  }).catch(() => undefined);

  return null;
}
