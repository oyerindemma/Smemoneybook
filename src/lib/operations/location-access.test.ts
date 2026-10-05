import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@prisma/client";

const prisma = {
  businessMember: {
    findFirst: vi.fn(),
  },
  businessLocation: {
    findFirst: vi.fn(),
  },
  businessLocationMember: {
    findFirst: vi.fn(),
  },
};

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => prisma,
}));

describe("requireLocationAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.businessMember.findFirst.mockResolvedValue({
      role: Role.OWNER,
      business: { id: "biz_1", name: "Ada Store" },
    });
    prisma.businessLocation.findFirst.mockResolvedValue({
      id: "loc_1",
      name: "Main shop",
      type: "MAIN_SHOP",
      isDefault: true,
    });
    prisma.businessLocationMember.findFirst.mockResolvedValue({ id: "member_1" });
  });

  it("allows owners to access a location in their business", async () => {
    const { requireLocationAccess } = await import("@/lib/operations/access");

    const access = await requireLocationAccess({
      userId: "user_1",
      businessId: "biz_1",
      locationId: "loc_1",
      permission: "locations:view",
    });

    expect(access.locationId).toBe("loc_1");
    expect(prisma.businessLocationMember.findFirst).not.toHaveBeenCalled();
  });

  it("requires non-owner users to have location membership", async () => {
    prisma.businessMember.findFirst.mockResolvedValue({
      role: Role.STAFF,
      business: { id: "biz_1", name: "Ada Store" },
    });
    prisma.businessLocationMember.findFirst.mockResolvedValue(null);
    const { requireLocationAccess } = await import("@/lib/operations/access");

    await expect(
      requireLocationAccess({
        userId: "staff_1",
        businessId: "biz_1",
        locationId: "loc_2",
        permission: "locations:view",
      }),
    ).rejects.toThrow("You do not have access to this location.");
  });
});
