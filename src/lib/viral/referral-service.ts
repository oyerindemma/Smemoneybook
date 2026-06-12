import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { getReferralCode } from "@/lib/viral/referral-engine";

export function normalizeReferralCode(value?: string | null) {
  return (value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 32);
}

export async function recordReferralSignup({
  referralCode,
  referredUserId,
  referredBusinessId,
}: {
  referralCode?: string | null;
  referredUserId: string;
  referredBusinessId?: string | null;
}) {
  const code = normalizeReferralCode(referralCode);

  if (!code) {
    return null;
  }

  const referrerBusiness = await resolveReferralBusiness(code);

  if (referrerBusiness?.id && referrerBusiness.id === referredBusinessId) {
    return null;
  }

  try {
    const attribution = await getPrisma().referralAttribution.create({
      data: {
        referralCode: code,
        referrerBusinessId: referrerBusiness?.id,
        referredUserId,
        referredBusinessId: referredBusinessId || undefined,
      },
      include: { rewards: true },
    });

    return attribution;
  } catch (error) {
    if (isUniqueConstraint(error)) {
      return null;
    }

    throw error;
  }
}

export async function activateReferralRewards({
  referredUserId,
  activation = "ACTIVATED",
}: {
  referredUserId: string;
  activation?: "ACTIVATED" | "PAID";
}) {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const attribution = await tx.referralAttribution.findUnique({
      where: { referredUserId },
      include: { rewards: true },
    });

    if (!attribution) {
      return null;
    }

    if (attribution.rewards.length > 0) {
      return attribution;
    }

    await tx.referralAttribution.update({
      where: { id: attribution.id },
      data: { status: activation },
    });

    const rewards = await Promise.all(
      buildReferralRewardRows({
        attributionId: attribution.id,
        referrerBusinessId: attribution.referrerBusinessId,
        referredUserId: attribution.referredUserId,
        referredBusinessId: attribution.referredBusinessId,
      }).map((data) => tx.referralReward.create({ data })),
    );

    return {
      ...attribution,
      status: activation,
      rewards,
    };
  });
}

async function resolveReferralBusiness(code: string) {
  const suffix = code.slice(-4);
  const candidates = await getPrisma().business.findMany({
    where: {
      id: { endsWith: suffix.toLowerCase() },
    },
    select: { id: true, name: true },
    take: 20,
  });

  return (
    candidates.find(
      (business) =>
        getReferralCode({ businessId: business.id, businessName: business.name }) === code,
    ) ?? null
  );
}

function buildReferralRewardRows({
  attributionId,
  referrerBusinessId,
  referredUserId,
  referredBusinessId,
}: {
  attributionId: string;
  referrerBusinessId?: string | null;
  referredUserId: string;
  referredBusinessId?: string | null;
}): Prisma.ReferralRewardUncheckedCreateInput[] {
  const rewards: Prisma.ReferralRewardUncheckedCreateInput[] = [
    {
      attributionId,
      beneficiaryUserId: referredUserId,
      beneficiaryBusinessId: referredBusinessId || undefined,
      type: "NEW_USER_ACTIVATION_TRIAL",
      description: "Premium trial earned after the referred business becomes active.",
      value: 7,
    },
  ];

  if (referrerBusinessId) {
    rewards.push({
      attributionId,
      beneficiaryBusinessId: referrerBusinessId,
      type: "REFERRER_ACTIVATION_PREMIUM_DAYS",
      description: "Free premium days earned after a referred business becomes active.",
      value: 7,
    });
  }

  return rewards;
}

function isUniqueConstraint(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}
