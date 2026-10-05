import { describe, expect, it } from "vitest";

describe("/api/announcements", () => {
  it("stays hidden while the Phase 2 announcements rollout is disabled", async () => {
    const { GET } = await import("@/app/api/announcements/route");
    const response = await GET();
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(404);
    expect(payload.error).toBe("Announcements is not available right now.");
  });
});
