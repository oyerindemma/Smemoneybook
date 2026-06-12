import { beforeEach, describe, expect, it, vi } from "vitest";

const findBusinesses = vi.fn();
const createAttribution = vi.fn();
const findAttribution = vi.fn();
const updateAttribution = vi.fn();
const createReward = vi.fn();
const transaction = vi.fn((callback) =>
  callback({
    referralAttribution: {
      findUnique: findAttribution,
      update: updateAttribution,
    },
    referralReward: {
      create: createReward,
    },
  }),
);

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    $transaction: transaction,
    business: {
      findMany: findBusinesses,
    },
    referralAttribution: {
      create: createAttribution,
    },
  }),
}));

describe("referral service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findBusinesses.mockResolvedValue([]);
    createAttribution.mockResolvedValue({ id: "ref_1", rewards: [] });
    findAttribution.mockResolvedValue(null);
    updateAttribution.mockResolvedValue({});
    createReward.mockImplementation(({ data }) => Promise.resolve({ id: `reward_${data.type}`, ...data }));
  });

  it("normalizes referral codes for storage", async () => {
    const { normalizeReferralCode } = await import("@/lib/viral/referral-service");

    expect(normalizeReferralCode(" ada-store_abcd!! ")).toBe("ADASTOREABCD");
  });

  it("records referred signup attribution without granting rewards yet", async () => {
    findBusinesses.mockResolvedValue([{ id: "biz_1234abcd", name: "Ada Store" }]);
    const { recordReferralSignup } = await import("@/lib/viral/referral-service");

    await recordReferralSignup({
      referralCode: "ADASTOREABCD",
      referredUserId: "user_2",
      referredBusinessId: "biz_new",
    });

    expect(createAttribution).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          referralCode: "ADASTOREABCD",
          referrerBusinessId: "biz_1234abcd",
          referredUserId: "user_2",
          referredBusinessId: "biz_new",
        }),
      }),
    );
    expect(createReward).not.toHaveBeenCalled();
  });

  it("does not record empty referral codes", async () => {
    const { recordReferralSignup } = await import("@/lib/viral/referral-service");

    await expect(
      recordReferralSignup({ referralCode: "", referredUserId: "user_2" }),
    ).resolves.toBeNull();
    expect(createAttribution).not.toHaveBeenCalled();
  });

  it("creates referral rewards only after activation", async () => {
    findAttribution.mockResolvedValue({
      id: "attr_1",
      referralCode: "ADASTOREABCD",
      referrerBusinessId: "biz_1234abcd",
      referredUserId: "user_2",
      referredBusinessId: "biz_new",
      status: "SIGNED_UP",
      rewards: [],
    });
    const { activateReferralRewards } = await import("@/lib/viral/referral-service");

    const result = await activateReferralRewards({ referredUserId: "user_2" });

    expect(result?.status).toBe("ACTIVATED");
    expect(updateAttribution).toHaveBeenCalledWith({
      where: { id: "attr_1" },
      data: { status: "ACTIVATED" },
    });
    expect(createReward).toHaveBeenCalledTimes(2);
    expect(createReward).toHaveBeenCalledWith({
      data: expect.objectContaining({
        attributionId: "attr_1",
        beneficiaryUserId: "user_2",
        type: "NEW_USER_ACTIVATION_TRIAL",
        value: 7,
      }),
    });
    expect(createReward).toHaveBeenCalledWith({
      data: expect.objectContaining({
        attributionId: "attr_1",
        beneficiaryBusinessId: "biz_1234abcd",
        type: "REFERRER_ACTIVATION_PREMIUM_DAYS",
        value: 7,
      }),
    });
  });

  it("does not duplicate referral rewards", async () => {
    findAttribution.mockResolvedValue({
      id: "attr_1",
      referralCode: "ADASTOREABCD",
      referredUserId: "user_2",
      rewards: [{ id: "reward_1" }],
    });
    const { activateReferralRewards } = await import("@/lib/viral/referral-service");

    await activateReferralRewards({ referredUserId: "user_2" });

    expect(updateAttribution).not.toHaveBeenCalled();
    expect(createReward).not.toHaveBeenCalled();
  });
});
