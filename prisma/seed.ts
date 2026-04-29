import { AccountType, DebtStatus, DebtType, PaymentStatus, PrismaClient, Role, TransactionType } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";

const prisma = new PrismaClient();

async function main() {
  const email = "demo@smemoneybook.local";

  await prisma.user.deleteMany({ where: { email } });

  const user = await prisma.user.create({
    data: {
      name: "Demo Owner",
      email,
      password: await hashPassword("demo-password"),
      members: {
        create: {
          role: Role.OWNER,
          business: {
            create: {
              name: "Demo Stores",
              accounts: {
                create: [
                  {
                    name: "Cash",
                    type: AccountType.CASH,
                    openingBalance: 50_000,
                    balance: 72_000,
                  },
                  {
                    name: "Bank",
                    type: AccountType.BANK,
                    openingBalance: 150_000,
                    balance: 165_000,
                  },
                  {
                    name: "POS",
                    type: AccountType.POS,
                    openingBalance: 25_000,
                    balance: 31_500,
                  },
                ],
              },
              items: {
                create: [
                  {
                    name: "Ankara Shirt",
                    sku: "ANK-SHIRT",
                    sellingPrice: 18_000,
                    costPrice: 11_000,
                    quantityOnHand: 8,
                    lowStockLevel: 3,
                  },
                  {
                    name: "Leather Sandals",
                    sku: "SANDALS",
                    sellingPrice: 15_000,
                    costPrice: 9_500,
                    quantityOnHand: 2,
                    lowStockLevel: 4,
                  },
                ],
              },
              auditLogs: {
                create: {
                  action: "seed.created",
                  message: "Demo business created for local testing.",
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
  const cash = business?.accounts.find((account) => account.type === AccountType.CASH);
  const bank = business?.accounts.find((account) => account.type === AccountType.BANK);

  if (!business || !cash || !bank) {
    throw new Error("Demo business accounts were not created.");
  }

  const customer = await prisma.customer.create({
    data: {
      businessId: business.id,
      name: "Amina Stores",
      phone: "+2348000000001",
    },
  });

  const supplier = await prisma.supplier.create({
    data: {
      businessId: business.id,
      name: "Main Market Supplier",
      phone: "+2348000000002",
    },
  });

  const creditSale = await prisma.transaction.create({
    data: {
      businessId: business.id,
      accountId: cash.id,
      customerId: customer.id,
      idempotencyKey: "seed-credit-sale",
      type: TransactionType.SALE,
      paymentStatus: PaymentStatus.CREDIT,
      amount: 18_000,
      costOfGoods: 11_000,
      profit: 7_000,
      description: "Credit sale to Amina Stores",
    },
  });

  const supplierBill = await prisma.transaction.create({
    data: {
      businessId: business.id,
      accountId: bank.id,
      supplierId: supplier.id,
      idempotencyKey: "seed-supplier-bill",
      type: TransactionType.EXPENSE,
      paymentStatus: PaymentStatus.UNPAID,
      amount: 22_000,
      costOfGoods: 0,
      profit: 0,
      description: "Restock supplier bill",
    },
  });

  await prisma.debt.createMany({
    data: [
      {
        businessId: business.id,
        customerId: customer.id,
        sourceTransactionId: creditSale.id,
        type: DebtType.CUSTOMER_OWES_BUSINESS,
        amount: 18_000,
        status: DebtStatus.OPEN,
      },
      {
        businessId: business.id,
        supplierId: supplier.id,
        sourceTransactionId: supplierBill.id,
        type: DebtType.BUSINESS_OWES_SUPPLIER,
        amount: 22_000,
        status: DebtStatus.OPEN,
      },
    ],
  });

  console.log("Seeded demo account:", email, "password: demo-password");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
