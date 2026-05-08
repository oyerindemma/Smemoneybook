import { beforeEach, describe, expect, it, vi } from "vitest";

const runAutomation = vi.fn();

vi.mock("@/lib/automation/automation-runner", () => ({
  runAutomation,
}));

describe("/api/cron/automation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "cron_secret_123456";
    runAutomation.mockResolvedValue({ ok: true, businessCount: 1, results: [] });
  });

  it("rejects missing cron secret", async () => {
    const { GET } = await import("@/app/api/cron/automation/route");
    const response = await GET(new Request("http://localhost/api/cron/automation"));

    expect(response.status).toBe(401);
    expect(runAutomation).not.toHaveBeenCalled();
  });

  it("runs automation with bearer secret", async () => {
    const { GET } = await import("@/app/api/cron/automation/route");
    const response = await GET(
      new Request("http://localhost/api/cron/automation", {
        headers: { authorization: "Bearer cron_secret_123456" },
      }),
    );

    expect(response.status).toBe(200);
    expect(runAutomation).toHaveBeenCalled();
  });
});
