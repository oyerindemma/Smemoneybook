import { describe, expect, it, vi } from "vitest";
import { exponentialBackoffMs, runWithRetry } from "@/lib/queue";

describe("queue retry logic", () => {
  it("calculates exponential backoff with a cap", () => {
    expect(exponentialBackoffMs(1, 100, 1000)).toBe(100);
    expect(exponentialBackoffMs(4, 100, 1000)).toBe(800);
    expect(exponentialBackoffMs(8, 100, 1000)).toBe(1000);
  });

  it("retries failed jobs", async () => {
    vi.useFakeTimers();
    const worker = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce(undefined);

    const promise = runWithRetry(
      { id: "job_1", type: "test", payload: { ok: true }, maxAttempts: 2 },
      worker,
    );

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.ok).toBe(true);
    expect(worker).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
