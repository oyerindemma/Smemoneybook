import { getPrisma } from "@/lib/prisma";

export type QueueJob<TPayload> = {
  id: string;
  type: string;
  payload: TPayload;
  attempts?: number;
  maxAttempts?: number;
  dedupeKey?: string;
};

const dedupe = new Map<string, number>();

export function exponentialBackoffMs(attempt: number, baseMs = 500, maxMs = 30_000) {
  return Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1));
}

export async function runWithRetry<TPayload>(
  job: QueueJob<TPayload>,
  worker: (payload: TPayload) => Promise<void>,
) {
  if (isDuplicateJob(job.dedupeKey)) {
    return { ok: true, deduped: true };
  }

  const maxAttempts = job.maxAttempts ?? 3;
  let attempt = job.attempts ?? 1;
  let lastError: unknown;

  while (attempt <= maxAttempts) {
    try {
      await worker(job.payload);
      rememberDedupe(job.dedupeKey);
      return { ok: true, attempts: attempt };
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts) {
        break;
      }
      await sleep(exponentialBackoffMs(attempt));
      attempt += 1;
    }
  }

  return {
    ok: false,
    attempts: attempt,
    error: lastError instanceof Error ? lastError.message : "Queue job failed.",
  };
}

export async function enforceRateLimit({
  key,
  limit,
  windowMs,
}: {
  key: string;
  limit: number;
  windowMs: number;
}) {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);

  const result = await getPrisma().$transaction(async (tx) => {
    const bucket = await tx.rateLimitBucket.findUnique({ where: { key } });

    if (!bucket || bucket.resetAt <= now) {
      return tx.rateLimitBucket.upsert({
        where: { key },
        create: { key, count: 1, resetAt },
        update: { count: 1, resetAt },
      });
    }

    return tx.rateLimitBucket.update({
      where: { key },
      data: { count: { increment: 1 } },
    });
  });

  return {
    allowed: result.count <= limit,
    remaining: Math.max(0, limit - result.count),
    resetAt: result.resetAt,
  };
}

function isDuplicateJob(dedupeKey?: string) {
  if (!dedupeKey) {
    return false;
  }

  const expiresAt = dedupe.get(dedupeKey);
  return Boolean(expiresAt && expiresAt > Date.now());
}

function rememberDedupe(dedupeKey?: string) {
  if (dedupeKey) {
    dedupe.set(dedupeKey, Date.now() + 5 * 60 * 1000);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
