import { describe, expect, it } from "vitest";

describe("/api/reports/definitions", () => {
  it("stays hidden while the Phase 2 reporting centre rollout is disabled", async () => {
    const { GET } = await import("@/app/api/reports/definitions/route");
    const response = await GET();
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(404);
    expect(payload.error).toBe("Reporting centre is not available right now.");
  });
});
