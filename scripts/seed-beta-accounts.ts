import {
  AccountType,
  DebtStatus,
  DebtType,
  PaymentStatus,
  PrismaClient,
  Role,
  SubscriptionPlan,
  SubscriptionStatus,
  TransactionType,
} from "@prisma/client";
import { randomBytes } from "node:crypto";
import { hashPassword } from "../src/lib/auth/password";
import { billingPlans } from "../src/lib/billing/plans";

const prisma = new PrismaClient();

const betaAccounts = [
  {
    email: "beta+free@smemoneybook.com",
    name: "Beta Free Tester",
    businessName: "Beta Free Mini Mart",
    plan: null,
    transactionCount: 28,
    peopleCount: 9,
    inventoryCount: 9,
  },
  {
    email: "beta+starter@smemoneybook.com",
    name: "Beta Starter Tester",
    businessName: "Beta Starter Stores",
    plan: SubscriptionPlan.STARTER,
    transactionCount: 12,
    peopleCount: 4,
    inventoryCount: 4,
  },
  {
    email: "beta+growth@smemoneybook.com",
    name: "Beta Growth Tester",
    businessName: "Beta Growth Foods",
    plan: SubscriptionPlan.GROWTH,
    transactionCount: 16,
    peopleCount: 5,
    inventoryCount: 5,
  },
  {
    email: "beta+pro@smemoneybook.com",
    name: "Beta Pro Tester",
    businessName: "Beta Pro Distribution",
    plan: SubscriptionPlan.PRO,
    transactionCount: 20,
    peopleCount: 6,
    inventoryCount: 6,
  },
] as const;

function getPassword() {
  return process.env.BETA_TEST_PASSWORD || `Beta-${randomBytes(9).toString("base64url")}-2026`;
}

function planDetails(plan: SubscriptionPlan) {
  const billingPlan = billingPlans.find((item) => item.dbPlan === plan);

  if (!billingPlan) {
    throw new Error(`Missing billing plan mapping for ${plan}.`);
  }

  return billingPlan;
}

async function clearExistingBetaAccounts() {
  const emails = betaAccounts.map((account) => account.email);
  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: {
      id: true,
      members: { select: { businessId: true } },
    },
  });
  const businessIds = [...new Set(users.flatMap((user) => user.members.map((member) => member.businessId)))];

  if (businessIds.length > 0) {
    await prisma.business.deleteMany({ where: { id: { in: businessIds } } });
  }

  await prisma.user.deleteMany({ where: { email: { in: emails } } });
}

async function createBetaAccount(input: (typeof betaAccounts)[number], passwordHash: string) {
  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      password: passwordHash,
      members: {
        create: {
          role: Role.OWNER,
          business: {
            create: {
              name: input.businessName,
              businessType: "Retail",
              onboardingCompleted: true,
              accounts: {
                create: [
                  {
                    name: "Cash",
                    type: AccountType.CASH,
                    openingBalance: 75_000,
                    balance: 75_000,
                  },
                  {
                    name: "Bank",
                    type: AccountType.BANK,
                    openingBalance: 250_000,
                    balance: 250_000,
                  },
                  {
                    name: "POS",
                    type: AccountType.POS,
                    openingBalance: 45_000,
                    balance: 45_000,
                  },
                ],
              },
              auditLogs: {
                create: {
                  action: "beta.seeded",
                  message: "Beta testing business seeded.",
                },
              },
            },
          },
        },
      },
    },
    include: {
      members: {
        include: {
          business: {
            include: { accounts: true },
          },
        },
      },
    },
  });

  const business = user.members[0]?.business;

  if (!business) {
    throw new Error(`Business was not created for ${input.email}.`);
  }

  await seedBusinessData({
    businessId: business.id,
    ownerId: user.id,
    accountId: business.accounts.find((account) => account.type === AccountType.CASH)?.id,
    transactionCount: input.transactionCount,
    peopleCount: input.peopleCount,
    inventoryCount: input.inventoryCount,
  });

  if (input.plan) {
    const plan = planDetails(input.plan);
    await prisma.subscription.create({
      data: {
        userId: user.id,
        businessId: business.id,
        plan: input.plan,
        status: SubscriptionStatus.ACTIVE,
        amount: plan.amount,
        amountMonthlyKobo: plan.amountKobo,
        provider: "manual-beta",
        reference: `beta_${plan.id}_${business.id}`,
        paidAt: new Date(),
        currentPeriodEnd: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      },
    });
  }

  return { user, business };
}

async function seedBusinessData({
  businessId,
  ownerId,
  accountId,
  transactionCount,
  peopleCount,
  inventoryCount,
}: {
  businessId: string;
  ownerId: string;
  accountId?: string;
  transactionCount: number;
  peopleCount: number;
  inventoryCount: number;
}) {
  if (!accountId) {
    throw new Error("Cash account was not created.");
  }

  const customers = await Promise.all(
    Array.from({ length: peopleCount }, (_, index) =>
      prisma.customer.create({
        data: {
          businessId,
          name: `Beta Customer ${index + 1}`,
          phone: `+23470000010${String(index).padStart(2, "0")}`,
        },
      }),
    ),
  );
  const supplier = await prisma.supplier.create({
    data: {
      businessId,
      name: "Beta Wholesale Supplier",
      phone: "+234700000199",
    },
  });
  const items = await Promise.all(
    Array.from({ length: inventoryCount }, (_, index) =>
      prisma.inventoryItem.create({
        data: {
          businessId,
          name: `Beta Product ${index + 1}`,
          sku: `BETA-${index + 1}`,
          sellingPrice: 2500 + index * 500,
          costPrice: 1400 + index * 300,
          quantityOnHand: 12 + index,
          lowStockLevel: 5,
        },
      }),
    ),
  );

  for (let index = 0; index < transactionCount; index += 1) {
    const customer = customers[index % customers.length];
    const item = items[index % items.length];
    const amount = 3000 + (index % 8) * 750;
    const isCredit = index % 6 === 0;
    const transaction = await prisma.transaction.create({
      data: {
        businessId,
        accountId,
        customerId: customer.id,
        inventoryItemId: item.id,
        inventoryQuantity: 1,
        idempotencyKey: `beta-sale-${index + 1}`,
        type: TransactionType.SALE,
        paymentStatus: isCredit ? PaymentStatus.CREDIT : PaymentStatus.PAID,
        amount,
        costOfGoods: Number(item.costPrice),
        profit: amount - Number(item.costPrice),
        description: `Beta sale ${index + 1}`,
        occurredAt: new Date(Date.now() - index * 24 * 60 * 60 * 1000),
      },
    });

    if (isCredit) {
      await prisma.debt.create({
        data: {
          businessId,
          customerId: customer.id,
          sourceTransactionId: transaction.id,
          type: DebtType.CUSTOMER_OWES_BUSINESS,
          amount,
          status: DebtStatus.OPEN,
          dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          events: {
            create: {
              type: "NOTE",
              note: "Seeded beta credit sale.",
              actorId: ownerId,
            },
          },
        },
      });
    }
  }

  const supplierBill = await prisma.transaction.create({
    data: {
      businessId,
      accountId,
      supplierId: supplier.id,
      idempotencyKey: "beta-supplier-bill",
      type: TransactionType.EXPENSE,
      paymentStatus: PaymentStatus.UNPAID,
      amount: 42_000,
      costOfGoods: 0,
      profit: 0,
      description: "Seeded beta supplier bill",
    },
  });

  await prisma.debt.create({
    data: {
      businessId,
      supplierId: supplier.id,
      sourceTransactionId: supplierBill.id,
      type: DebtType.BUSINESS_OWES_SUPPLIER,
      amount: 42_000,
      status: DebtStatus.OPEN,
      dueAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    },
  });
}

async function main() {
  const password = getPassword();
  const passwordHash = await hashPassword(password);

  await clearExistingBetaAccounts();

  const created = [];

  for (const account of betaAccounts) {
    created.push(await createBetaAccount(account, passwordHash));
  }

  console.log("Seeded beta accounts for https://smemoneybook.com");
  console.log(`Shared password: ${password}`);
  for (const account of betaAccounts) {
    console.log(`- ${account.email} (${account.plan ?? "FREE"})`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
