import { BusinessLocationType, Prisma, Role } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import {
  hasPermission,
  mapRole,
  requireBusinessAccess,
} from "@/lib/operations/access";

type LocationInput = {
  businessId?: string;
  name: string;
  type: "main_shop" | "warehouse" | "branch" | "storage" | "virtual" | "damaged_goods" | "transit";
  address?: string;
  phone?: string;
  email?: string;
};

export async function listBusinessLocationsForUser(userId: string, businessId?: string) {
  const access = await requireBusinessAccess(userId, undefined, businessId);

  if (!hasPermission(access.role, "locations:view")) {
    throw new Error("You do not have permission to view locations.");
  }

  await ensureDefaultLocationForBusiness(access.businessId);

  const where =
    access.role === Role.OWNER
      ? { businessId: access.businessId }
      : {
          businessId: access.businessId,
          members: { some: { userId } },
        };

  const locations = await getPrisma().businessLocation.findMany({
    where,
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    include: {
      _count: {
        select: {
          members: true,
          inventoryBalances: true,
        },
      },
    },
  });

  return {
    businessId: access.businessId,
    businessName: access.businessName,
    role: mapRole(access.role),
    locations: locations.map((location) => ({
      id: location.id,
      name: location.name,
      type: location.type.toLowerCase(),
      address: location.address ?? undefined,
      phone: location.phone ?? undefined,
      email: location.email ?? undefined,
      isDefault: location.isDefault,
      archivedAt: location.archivedAt?.toISOString(),
      memberCount: location._count.members,
      productBalanceCount: location._count.inventoryBalances,
      createdAt: location.createdAt.toISOString(),
      updatedAt: location.updatedAt.toISOString(),
    })),
  };
}

export async function createBusinessLocationForUser(userId: string, input: LocationInput) {
  const access = await requireBusinessAccess(userId, "locations:create", input.businessId);
  const prisma = getPrisma();

  const location = await prisma.$transaction(async (tx) => {
    const created = await tx.businessLocation.create({
      data: {
        businessId: access.businessId,
        name: input.name,
        type: toDbLocationType(input.type),
        address: input.address || null,
        phone: input.phone || null,
        email: input.email || null,
      },
    });
    const [items, members] = await Promise.all([
      tx.inventoryItem.findMany({
        where: { businessId: access.businessId, archivedAt: null },
        select: {
          id: true,
          lowStockLevelDecimal: true,
        },
      }),
      tx.businessMember.findMany({
        where: {
          businessId: access.businessId,
          role: Role.OWNER,
        },
        select: {
          userId: true,
          role: true,
        },
      }),
    ]);

    if (items.length > 0) {
      await tx.inventoryBalance.createMany({
        data: items.map((item) => ({
          businessId: access.businessId,
          locationId: created.id,
          inventoryItemId: item.id,
          quantityOnHandDecimal: new Prisma.Decimal(0),
          lowStockLevelDecimal: item.lowStockLevelDecimal,
        })),
        skipDuplicates: true,
      });
    }

    await tx.businessLocationMember.createMany({
      data: [
        ...members,
        {
          userId,
          role: access.role,
        },
      ].map((member) => ({
        businessId: access.businessId,
        locationId: created.id,
        userId: member.userId,
        role: member.role,
      })),
      skipDuplicates: true,
    });

    await tx.auditLog.create({
      data: {
        businessId: access.businessId,
        actorId: userId,
        action: "location.created",
        message: `${created.name} location was created.`,
        metadata: {
          locationId: created.id,
          type: created.type,
        },
      },
    });

    return created;
  });

  return {
    id: location.id,
    name: location.name,
    type: location.type.toLowerCase(),
    address: location.address ?? undefined,
    phone: location.phone ?? undefined,
    email: location.email ?? undefined,
    isDefault: location.isDefault,
    archivedAt: location.archivedAt?.toISOString(),
    createdAt: location.createdAt.toISOString(),
    updatedAt: location.updatedAt.toISOString(),
  };
}

export async function archiveBusinessLocationForUser({
  userId,
  businessId,
  locationId,
}: {
  userId: string;
  businessId?: string;
  locationId: string;
}) {
  const access = await requireBusinessAccess(userId, "locations:archive", businessId);
  const prisma = getPrisma();
  const location = await prisma.businessLocation.findFirst({
    where: {
      id: locationId,
      businessId: access.businessId,
      archivedAt: null,
    },
  });

  if (!location) {
    throw new Error("Choose a valid business location.");
  }

  if (location.isDefault) {
    throw new Error("The default location cannot be archived.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.businessLocation.update({
      where: { id: location.id },
      data: { archivedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        businessId: access.businessId,
        actorId: userId,
        action: "location.archived",
        message: `${location.name} location was archived.`,
        metadata: {
          locationId: location.id,
          type: location.type,
        },
      },
    });
  });
}

export async function ensureDefaultLocationForBusiness(businessId: string) {
  const prisma = getPrisma();
  const existingDefault = await prisma.businessLocation.findFirst({
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

  return prisma.$transaction(async (tx) => {
    const business = await tx.business.findUnique({
      where: { id: businessId },
      select: {
        id: true,
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
        })
      : await tx.businessLocation.create({
          data: {
            businessId,
            name: "Main shop",
            type: BusinessLocationType.MAIN_SHOP,
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

    return {
      id: location.id,
      name: location.name,
      type: location.type,
      isDefault: location.isDefault,
    };
  });
}

function toDbLocationType(type: LocationInput["type"]) {
  return type.toUpperCase() as BusinessLocationType;
}
