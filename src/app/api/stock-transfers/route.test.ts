import { describe, expect, it } from "vitest";

describe("/api/stock-transfers", () => {
  it("stays hidden while Phase 2 transfer rollout is disabled", async () => {
    const { GET } = await import("@/app/api/stock-transfers/route");
    const response = await GET(
      new Request("http://localhost/api/stock-transfers?businessId=biz_1"),
    );
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(404);
    expect(payload.error).toBe("Stock transfers is not available right now.");
  });
});
