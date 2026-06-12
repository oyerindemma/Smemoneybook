import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
const enforceRateLimit = vi.fn();
const requireBusinessAccess = vi.fn();
const requireFeatureAccess = vi.fn();
const exportBusinessBackup = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  requireUser,
}));

vi.mock("@/lib/auth/rate-limit", () => ({
  enforceRateLimit,
}));

vi.mock("@/lib/operations/access", () => ({
  requireBusinessAccess,
}));

vi.mock("@/lib/billing/subscriptions", () => ({
  requireFeatureAccess,
}));

vi.mock("@/lib/operations/service", () => ({
  exportBusinessBackup,
}));

describe("/api/accountant/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "user_1", name: "Owner", email: "owner@test.ng" });
    enforceRateLimit.mockResolvedValue(null);
    requireBusinessAccess.mockResolvedValue({ businessId: "biz_1" });
    requireFeatureAccess.mockResolvedValue(null);
    exportBusinessBackup.mockResolvedValue({
      exportedAt: "2026-06-12T00:00:00.000Z",
      business: {
        name: "Demo Store",
        accounts: [],
        transactions: [],
        customers: [],
        suppliers: [],
        debts: [],
        items: [],
      },
    });
  });

  it("requires a selected business before exporting", async () => {
    const { GET } = await import("@/app/api/accountant/export/route");
    const response = await GET(new Request("http://localhost/api/accountant/export"));

    expect(response.status).toBe(400);
    expect(requireBusinessAccess).not.toHaveBeenCalled();
    expect(requireFeatureAccess).not.toHaveBeenCalled();
    expect(exportBusinessBackup).not.toHaveBeenCalled();
  });

  it("enforces the paid export feature gate", async () => {
    requireFeatureAccess.mockResolvedValueOnce(
      Response.json({ error: "Upgrade your plan to use this feature." }, { status: 402 }),
    );
    const { GET } = await import("@/app/api/accountant/export/route");
    const response = await GET(
      new Request("http://localhost/api/accountant/export?businessId=biz_1"),
    );

    expect(response.status).toBe(402);
    expect(requireBusinessAccess).toHaveBeenCalledWith("user_1", "backup:read", "biz_1");
    expect(requireFeatureAccess).toHaveBeenCalledWith("user_1", "biz_1", "basic_exports");
    expect(exportBusinessBackup).not.toHaveBeenCalled();
  });

  it("exports accountant CSV for paid businesses", async () => {
    const { GET } = await import("@/app/api/accountant/export/route");
    const response = await GET(
      new Request("http://localhost/api/accountant/export?businessId=biz_1"),
    );
    const csv = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/csv");
    expect(exportBusinessBackup).toHaveBeenCalledWith("user_1", "biz_1");
    expect(csv).toContain('"businessName","Demo Store"');
  });
});
