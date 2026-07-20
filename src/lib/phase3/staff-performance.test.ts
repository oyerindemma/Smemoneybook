import { describe, expect, it } from "vitest";
import { calculateStaffPerformance } from "@/lib/phase3/staff-performance";

const periodStart = new Date("2026-07-01T00:00:00.000Z");
const periodEnd = new Date("2026-08-01T00:00:00.000Z");

describe("Phase 3K staff performance", () => {
  it("calculates transparent business activity metrics by staff user", () => {
    const summary = calculateStaffPerformance({
      periodStart,
      periodEnd,
      members: [
        { userId: "user_1", name: "Ada", role: "OWNER" },
        { userId: "user_2", name: "Tunde", role: "STAFF" },
      ],
      goals: [
        {
          id: "goal_1",
          staffUserId: "user_2",
          label: "Record 10 sales",
          metric: "salesRecorded",
          targetValue: 10,
          periodStart,
          periodEnd,
        },
      ],
      events: [
        { actorId: "user_2", action: "pos.sale", amount: 12_000, createdAt: "2026-07-05T10:00:00.000Z" },
        { actorId: "user_2", action: "transaction.sale", createdAt: "2026-07-06T10:00:00.000Z" },
        { actorId: "user_2", action: "customer.return", createdAt: "2026-07-07T10:00:00.000Z" },
        { actorId: "user_1", action: "debt.collected", createdAt: "2026-07-08T10:00:00.000Z" },
      ],
    });

    const staff = summary.rows.find((row) => row.userId === "user_2");

    expect(summary.formulaVersion).toBe("staff-performance-v1");
    expect(staff?.salesRecorded).toBe(2);
    expect(staff?.revenueHandled).toBe(12_000);
    expect(staff?.transactionsProcessed).toBe(2);
    expect(staff?.returnsProcessed).toBe(1);
    expect(staff?.goalProgress[0]?.progressPercent).toBe(20);
  });

  it("does not invent revenue when source events have no explicit amount", () => {
    const summary = calculateStaffPerformance({
      periodStart,
      periodEnd,
      members: [{ userId: "user_1", name: "Ada", role: "STAFF" }],
      events: [{ actorId: "user_1", action: "transaction.sale", createdAt: "2026-07-05T10:00:00.000Z" }],
    });

    expect(summary.rows[0]?.revenueHandled).toBeNull();
    expect(summary.warnings.join(" ")).toContain("do not include amounts");
  });

  it("includes no attendance or surveillance metric by default", () => {
    const summary = calculateStaffPerformance({
      periodStart,
      periodEnd,
      members: [{ userId: "user_1", name: "Ada", role: "STAFF" }],
      events: [{ actorId: "user_1", action: "staff.accepted", createdAt: "2026-07-05T10:00:00.000Z" }],
    });

    expect(Object.keys(summary.metricDefinitions)).not.toContain("attendance");
    expect(summary.warnings[0]).toContain("hidden surveillance");
  });
});
