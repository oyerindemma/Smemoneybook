import { execFileSync } from "node:child_process";
import {
  Prisma,
  PrismaClient,
  Role,
  SubscriptionPlan,
  SubscriptionStatus,
  type Subscription,
} from "@prisma/client";
import { assertPreviewStagingSeedAllowed } from "../src/lib/preview-staging-seed-guard";
import { billingPlans } from "../src/lib/billing/plans";
import { permissionRegistry } from "../src/lib/permissions/registry";

const previewProvider = "manual-phase2-preview-staging";

type ScriptArgs = {
  businessId?: string;
  email?: string;
  dryRun: boolean;
  latestSession: boolean;
};

type TargetBusiness = {
  businessId: string;
  businessName: string;
  ownerId: string;
  ownerEmail: string;
};

const prisma = new PrismaClient();

function parseArgs(argv: string[]): ScriptArgs {
  const args: ScriptArgs = {
    dryRun: false,
    latestSession: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const [key, inlineValue] = arg.split("=", 2);
    const nextValue = () => {
      const value = inlineValue ?? argv[index + 1];

      if (!value || value.startsWith("--")) {
        throw new Error(`${key} needs a value.`);
      }

      if (!inlineValue) {
        index += 1;
      }

      return value.trim();
    };

    if (key === "--business-id") {
      args.businessId = nextValue();
    } else if (key === "--email") {
      args.email = nextValue().toLowerCase();
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--latest-session") {
      args.latestSession = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function assertStagingOnly() {
  const branch = process.env.VERCEL_GIT_COMMIT_REF?.trim() || getCurrentGitBranch();
  assertPreviewStagingSeedAllowed({ branch });
}

function getCurrentGitBranch() {
  try {
    return execFileSync("git", ["branch", "--show-current"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

async function resolveTargetBusiness(args: ScriptArgs): Promise<TargetBusiness> {
  if (args.latestSession) {
    return resolveLatestSessionBusiness(args.businessId);
  }

  if (args.businessId) {
    return resolveBusinessById(args.businessId, args.email);
  }

  if (args.email) {
    return resolveBusinessByEmail(args.email);
  }

  throw new Error("Pass --email <owner-email>, --business-id <business-id>, or --latest-session.");
}

async function resolveLatestSessionBusiness(businessId?: string): Promise<TargetBusiness> {
  const session = await prisma.session.findFirst({
    where: { expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          members: {
            include: {
              business: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });

  if (!session) {
    throw new Error("No active staging session was found. Pass --email or --business-id instead.");
  }

  const membership = businessId
    ? session.user.members.find((item) => item.businessId === businessId)
    : onlyMembership(session.user.members, session.user.email);

  if (!membership) {
    throw new Error(`The latest session user is not a member of business ${businessId}.`);
  }

  const owner = await findOwnerForBusiness(membership.businessId);

  return {
    businessId: membership.businessId,
    businessName: membership.business.name,
    ownerId: owner.userId,
    ownerEmail: owner.user.email,
  };
}

async function resolveBusinessById(businessId: string, email?: string): Promise<TargetBusiness> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      name: true,
      members: {
        where: email ? { user: { email } } : undefined,
        include: { user: { select: { id: true, email: true } } },
      },
    },
  });

  if (!business) {
    throw new Error(`Business ${businessId} was not found in staging.`);
  }

  if (email && business.members.length === 0) {
    throw new Error(`${email} is not a member of ${business.name}.`);
  }

  const owner = await findOwnerForBusiness(business.id);

  return {
    businessId: business.id,
    businessName: business.name,
    ownerId: owner.userId,
    ownerEmail: owner.user.email,
  };
}

async function resolveBusinessByEmail(email: string): Promise<TargetBusiness> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      email: true,
      members: {
        include: {
          business: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!user) {
    throw new Error(`${email} was not found in staging.`);
  }

  const membership = onlyMembership(user.members, email);
  const owner = await findOwnerForBusiness(membership.businessId);

  return {
    businessId: membership.businessId,
    businessName: membership.business.name,
    ownerId: owner.userId,
    ownerEmail: owner.user.email,
  };
}

function onlyMembership<T extends { businessId: string }>(memberships: T[], email: string): T {
  if (memberships.length === 0) {
    throw new Error(`${email} does not belong to a staging business.`);
  }

  if (memberships.length > 1) {
    throw new Error(`${email} belongs to multiple businesses. Pass --business-id as well.`);
  }

  return memberships[0];
}

async function findOwnerForBusiness(businessId: string) {
  const owner = await prisma.businessMember.findFirst({
    where: { businessId, role: Role.OWNER },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { id: true, email: true } } },
  });

  if (!owner) {
    throw new Error(`Business ${businessId} has no owner member.`);
  }

  return owner;
}

async function getCurrentActiveSubscription(businessId: string) {
  return prisma.subscription.findFirst({
    where: {
      businessId,
      status: SubscriptionStatus.ACTIVE,
      OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: new Date() } }],
    },
    orderBy: { updatedAt: "desc" },
  });
}

async function seedPreviewEntitlement(target: TargetBusiness) {
  const plan = billingPlans.find((item) => item.dbPlan === SubscriptionPlan.PRO);

  if (!plan) {
    throw new Error("PRO billing plan mapping is missing.");
  }

  const reference = `phase2_preview_staging_${target.businessId}`;
  const existing = await prisma.subscription.findUnique({ where: { reference } });
  const ownerPermissions: string[] = [...permissionRegistry];

  const result = await prisma.$transaction(async (tx) => {
    const subscriptionCurrent = Boolean(
      existing &&
      existing.businessId === target.businessId &&
      existing.userId === target.ownerId &&
      existing.plan === SubscriptionPlan.PRO &&
      existing.status === SubscriptionStatus.ACTIVE &&
      existing.provider === previewProvider &&
      existing.currentPeriodEnd === null &&
      existing.amountMonthlyKobo === 0 &&
      existing.amount === 0,
    );
    const subscription = existing && subscriptionCurrent
      ? existing
      : await upsertPreviewSubscription(tx, {
          existing,
          target,
          reference,
        });

    const policy = await tx.permissionPolicy.findUnique({
      where: { businessId_role: { businessId: target.businessId, role: Role.OWNER } },
    });
    const ownerPolicyCurrent =
      policy &&
      ownerPermissions.every((permission) => policy.permissions.includes(permission)) &&
      policy.permissions.every((permission) => ownerPermissions.includes(permission));

    if (!ownerPolicyCurrent) {
      await tx.permissionPolicy.upsert({
        where: { businessId_role: { businessId: target.businessId, role: Role.OWNER } },
        create: {
          businessId: target.businessId,
          role: Role.OWNER,
          permissions: ownerPermissions,
        },
        update: {
          permissions: ownerPermissions,
        },
      });
    }

    if (!subscriptionCurrent || !ownerPolicyCurrent) {
      await tx.auditLog.create({
        data: {
          businessId: target.businessId,
          actorId: target.ownerId,
          action: "phase2.preview_entitlement_seeded",
          message: "Professional Preview entitlement was assigned for staging.",
          metadata: {
            plan: SubscriptionPlan.PRO,
            provider: previewProvider,
            reference,
            permissions: ownerPermissions,
          },
        },
      });
    }

    return subscription;
  });

  return {
    subscription: result,
    features: plan.features,
  };
}

async function upsertPreviewSubscription(
  tx: Prisma.TransactionClient,
  {
    existing,
    target,
    reference,
  }: {
    existing: Subscription | null;
    target: TargetBusiness;
    reference: string;
  },
) {
  const data = {
    businessId: target.businessId,
    userId: target.ownerId,
    plan: SubscriptionPlan.PRO,
    status: SubscriptionStatus.ACTIVE,
    amount: 0,
    amountMonthlyKobo: 0,
    provider: previewProvider,
    reference,
    paidAt: new Date(),
    currentPeriodEnd: null,
  };

  if (existing) {
    return tx.subscription.update({
      where: { id: existing.id },
      data,
    });
  }

  return tx.subscription.create({ data });
}

function printSubscription(label: string, subscription: Subscription | null) {
  console.log(`${label}:`);

  if (!subscription) {
    console.log("- activePlan: FREE");
    console.log("- entitlements: []");
    return;
  }

  const plan = billingPlans.find((item) => item.dbPlan === subscription.plan);

  console.log(`- activePlan: ${subscription.plan}`);
  console.log(`- status: ${subscription.status}`);
  console.log(`- provider: ${subscription.provider}`);
  console.log(`- reference: ${subscription.reference ?? "(none)"}`);
  console.log(`- currentPeriodEnd: ${subscription.currentPeriodEnd?.toISOString() ?? "none"}`);
  console.log(`- entitlements: ${(plan?.features ?? []).join(", ")}`);
}

function printExpectedNavigation() {
  console.log("Expected visible navigation after seeding:");
  console.log("- /more: Business Settings, Reports, Staff, Billing, Warehouses");
  console.log("- /more/business-settings: Locations, Warehouses, Tax");
  console.log("- /stock: Warehouses, Transfers");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  assertStagingOnly();

  const target = await resolveTargetBusiness(args);
  const before = await getCurrentActiveSubscription(target.businessId);

  console.log(`Target business: ${target.businessName} (${target.businessId})`);
  console.log(`Owner: ${target.ownerEmail}`);
  printSubscription("Before", before);

  if (args.dryRun) {
    console.log("Dry run only. No staging data was changed.");
    printExpectedNavigation();
    return;
  }

  const seeded = await seedPreviewEntitlement(target);
  const after = await getCurrentActiveSubscription(target.businessId);

  printSubscription("After", after);
  console.log(`Preview subscription id: ${seeded.subscription.id}`);
  console.log(`Preview entitlements: ${seeded.features.join(", ")}`);
  printExpectedNavigation();
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
