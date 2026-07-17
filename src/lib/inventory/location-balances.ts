import { BusinessLocationType, Prisma, Role } from "@prisma/client";

export type InventoryLocation = {
  id: string;
  name: string;
  type: BusinessLocationType;
  isDefault: boolean;
};

type PrismaTransaction = Prisma.TransactionClient;

type InventoryItemForBalance = {
  id: string;
  name: string;
  businessId: string;
  quantityOnHandDecimal: Prisma.Decimal;
  lowStockLevelDecimal: Prisma.Decimal;
};

export async function resolveInventoryLocation({
  tx,
  userId,
  businessId,
  role,
  locationId,
}: {
  tx: PrismaTransaction;
  userId: string;
  businessId: string;
  role: Role;
  locationId?: string | null;
}): Promise<InventoryLocation> {
  const location = locationId
    ? await tx.businessLocation.findFirst({
        where: {
          id: locationId,
          businessId,
          archivedAt: null,
        },
        select: {
          id: true,
          name: true,
          type: true,
          isDefault: true,
        },
      })
    : await ensureDefaultLocationInTransaction(tx, businessId);

  if (!location) {
    throw new Error("Choose a valid business location.");
  }

  if (role !== Role.OWNER) {
    const membership = await tx.businessLocationMember.findFirst({
      where: {
        businessId,
        locationId: location.id,
        userId,
      },
      select: { id: true },
    });

    if (!membership) {
      throw new Error("You do not have access to this location.");
    }
  }

  return location;
}

export async function applyInventoryBalanceChange({
  tx,
  businessId,
  location,
  itemId,
  changeQuantity,
  notEnoughMessage,
}: {
  tx: PrismaTransaction;
  businessId: string;
  location: InventoryLocation;
  itemId: string;
  changeQuantity: Prisma.Decimal | number;
  notEnoughMessage?: string;
}) {
  const item = await tx.inventoryItem.findFirst({
    where: {
      id: itemId,
      businessId,
      archivedAt: null,
    },
    select: {
      id: true,
      name: true,
      businessId: true,
      quantityOnHandDecimal: true,
      lowStockLevelDecimal: true,
    },
  });

  if (!item) {
    throw new Error("Choose a valid product.");
  }

  const balance = await ensureInventoryBalanceForItem({
    tx,
    businessId,
    location,
    item,
  });
  const delta = new Prisma.Decimal(changeQuantity);
  const beforeLocationQuantity = balance.quantityOnHandDecimal;
  const afterLocationQuantity = beforeLocationQuantity.plus(delta);

  if (afterLocationQuantity.lt(0)) {
    throw new Error(notEnoughMessage ?? `You do not have enough stock for ${item.name}.`);
  }

  const beforeAggregateQuantity = item.quantityOnHandDecimal;
  const afterAggregateQuantity = beforeAggregateQuantity.plus(delta);

  if (afterAggregateQuantity.lt(0)) {
    throw new Error("Stock records are out of sync. Refresh and try again.");
  }

  await Promise.all([
    tx.inventoryBalance.update({
      where: { id: balance.id },
      data: { quantityOnHandDecimal: afterLocationQuantity },
    }),
    tx.inventoryItem.update({
      where: { id: item.id },
      data: {
        quantityOnHand: Math.trunc(afterAggregateQuantity.toNumber()),
        quantityOnHandDecimal: afterAggregateQuantity,
      },
    }),
  ]);

  return {
    item,
    beforeLocationQuantity,
    afterLocationQuantity,
    beforeAggregateQuantity,
    afterAggregateQuantity,
  };
}

export async function ensureInventoryBalanceForItem({
  tx,
  businessId,
  location,
  item,
}: {
  tx: PrismaTransaction;
  businessId: string;
  location: InventoryLocation;
  item: InventoryItemForBalance;
}) {
  const existing = await tx.inventoryBalance.findUnique({
    where: {
      businessId_locationId_inventoryItemId: {
        businessId,
        locationId: location.id,
        inventoryItemId: item.id,
      },
    },
  });

  if (existing) {
    return existing;
  }

  return tx.inventoryBalance.create({
    data: {
      businessId,
      locationId: location.id,
      inventoryItemId: item.id,
      quantityOnHandDecimal: location.isDefault
        ? item.quantityOnHandDecimal
        : new Prisma.Decimal(0),
      lowStockLevelDecimal: item.lowStockLevelDecimal,
    },
  });
}

export async function ensureDefaultLocationInTransaction(
  tx: PrismaTransaction,
  businessId: string,
): Promise<InventoryLocation> {
  const existingDefault = await tx.businessLocation.findFirst({
    where: {
      businessId,
      isDefault: true,
      archivedAt: null,
    },
    select: {
      id: true,
      name: true,
      type: true,
      isDefault: true,
    },
  });

  if (existingDefault) {
    return existingDefault;
  }

  const business = await tx.business.findUnique({
    where: { id: businessId },
    select: {
      members: {
        select: {
          userId: true,
          role: true,
        },
      },
      items: {
        where: { archivedAt: null },
        select: {
          id: true,
          quantityOnHandDecimal: true,
          lowStockLevelDecimal: true,
        },
      },
    },
  });

  if (!business) {
    throw new Error("Create a business before continuing.");
  }

  const existingMain = await tx.businessLocation.findFirst({
    where: {
      businessId,
      name: "Main shop",
    },
  });
  const location = existingMain
    ? await tx.businessLocation.update({
        where: { id: existingMain.id },
        data: {
          isDefault: true,
          archivedAt: null,
        },
        select: {
          id: true,
          name: true,
          type: true,
          isDefault: true,
        },
      })
    : await tx.businessLocation.create({
        data: {
          businessId,
          name: "Main shop",
          type: BusinessLocationType.MAIN_SHOP,
          isDefault: true,
        },
        select: {
          id: true,
          name: true,
          type: true,
          isDefault: true,
        },
      });

  if (business.members.length > 0) {
    await tx.businessLocationMember.createMany({
      data: business.members.map((member) => ({
        businessId,
        locationId: location.id,
        userId: member.userId,
        role: member.role,
      })),
      skipDuplicates: true,
    });
  }

  if (business.items.length > 0) {
    await tx.inventoryBalance.createMany({
      data: business.items.map((item) => ({
        businessId,
        locationId: location.id,
        inventoryItemId: item.id,
        quantityOnHandDecimal: item.quantityOnHandDecimal,
        lowStockLevelDecimal: item.lowStockLevelDecimal,
      })),
      skipDuplicates: true,
    });
  }

  return location;
}
