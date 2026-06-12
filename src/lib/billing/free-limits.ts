import { getPrisma } from "@/lib/prisma";
import { hasAnyMinimumPlan, hasMinimumPlan } from "@/lib/billing/subscriptions";

export const freeUsageLimits = {
  businesses: 1,
  transactions: 30,
  activeTransactionDays: 14,
  people: 10,
  inventoryItems: 10,
} as const;

function limitResponse(message: string, requiredPlan: "starter" | "growth" | "pro" = "starter") {
  return Response.json({ error: message, requiredPlan }, { status: 402 });
}

export function willCreateBillablePerson(input: {
  type: "sale" | "expense" | "transfer";
  paymentStatus: "paid" | "credit" | "unpaid";
  partyName?: string;
  description?: string;
}) {
  const hasParty = Boolean(input.partyName?.trim() || input.description?.trim());

  return (
    hasParty &&
    ((input.type === "sale" && input.paymentStatus === "credit") ||
      (input.type === "expense" && input.paymentStatus === "unpaid"))
  );
}

export async function requireBusinessWorkspaceAllowance(userId: string) {
  if (await hasAnyMinimumPlan(userId, "starter")) {
    return null;
  }

  const businessCount = await getPrisma().businessMember.count({
    where: { userId },
  });

  if (businessCount >= freeUsageLimits.businesses) {
    return limitResponse("Free includes 1 business workspace. Upgrade to Starter to add another business.");
  }

  return null;
}

export async function requireTransactionAllowance(userId: string, businessId: string) {
  if (await hasMinimumPlan(userId, businessId, "starter")) {
    return null;
  }

  const prisma = getPrisma();
  const transactionCount = await prisma.transaction.count({ where: { businessId } });

  if (transactionCount >= freeUsageLimits.transactions) {
    return limitResponse("Free includes 30 money records. Upgrade to Starter to keep recording.");
  }

  const transactions = await prisma.transaction.findMany({
    where: { businessId },
    select: { occurredAt: true },
    orderBy: { occurredAt: "asc" },
  });
  const activeDays = new Set(
    transactions.map((transaction) => transaction.occurredAt.toISOString().slice(0, 10)),
  );

  if (activeDays.size >= freeUsageLimits.activeTransactionDays) {
    return limitResponse("Free includes 14 active recording days. Upgrade to Starter to keep using daily records.");
  }

  return null;
}

export async function requirePeopleAllowance(userId: string, businessId: string) {
  if (await hasMinimumPlan(userId, businessId, "starter")) {
    return null;
  }

  const [customerCount, supplierCount] = await Promise.all([
    getPrisma().customer.count({ where: { businessId } }),
    getPrisma().supplier.count({ where: { businessId } }),
  ]);

  if (customerCount + supplierCount >= freeUsageLimits.people) {
    return limitResponse("Free includes 10 customers and suppliers. Upgrade to Starter to add more people.");
  }

  return null;
}

export async function requireInventoryItemAllowance(userId: string, businessId: string) {
  if (await hasMinimumPlan(userId, businessId, "starter")) {
    return null;
  }

  const itemCount = await getPrisma().inventoryItem.count({ where: { businessId } });

  if (itemCount >= freeUsageLimits.inventoryItems) {
    return limitResponse("Free includes 10 inventory items. Upgrade to Starter to track more stock.");
  }

  return null;
}
