import { BusinessLocationType, Prisma, Role } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  applyInventoryBalanceChange,
  resolveInventoryLocation,
} from "@/lib/inventory/location-balances";

function createTx() {
  return {
    inventoryItem: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    inventoryBalance: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    businessLocation: {
      findFirst: vi.fn(),
    },
    businessLocationMember: {
      findFirst: vi.fn(),
    },
  } as unknown as Prisma.TransactionClient & {
    inventoryItem: {
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    inventoryBalance: {
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    businessLocation: {
      findFirst: ReturnType<typeof vi.fn>;
    };
    businessLocationMember: {
      findFirst: ReturnType<typeof vi.fn>;
    };
  };
}

const location = {
  id: "loc_1",
  name: "Main shop",
  type: BusinessLocationType.MAIN_SHOP,
  isDefault: true,
};

describe("location inventory balances", () => {
  it("updates the selected location balance and aggregate inventory cache", async () => {
    const tx = createTx();
    tx.inventoryItem.findFirst.mockResolvedValue({
      id: "item_1",
      name: "Rice",
      businessId: "biz_1",
      quantityOnHandDecimal: new Prisma.Decimal(10),
      lowStockLevelDecimal: new Prisma.Decimal(2),
    });
    tx.inventoryBalance.findUnique.mockResolvedValue({
      id: "balance_1",
      quantityOnHandDecimal: new Prisma.Decimal(6),
    });

    const result = await applyInventoryBalanceChange({
      tx,
      businessId: "biz_1",
      location,
      itemId: "item_1",
      changeQuantity: new Prisma.Decimal(-2),
    });

    expect(result.beforeLocationQuantity.toString()).toBe("6");
    expect(result.afterLocationQuantity.toString()).toBe("4");
    expect(tx.inventoryBalance.update).toHaveBeenCalledWith({
      where: { id: "balance_1" },
      data: { quantityOnHandDecimal: new Prisma.Decimal(4) },
    });
    expect(tx.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: "item_1" },
      data: {
        quantityOnHand: 8,
        quantityOnHandDecimal: new Prisma.Decimal(8),
      },
    });
  });

  it("blocks a location stock-out when that location lacks stock", async () => {
    const tx = createTx();
    tx.inventoryItem.findFirst.mockResolvedValue({
      id: "item_1",
      name: "Rice",
      businessId: "biz_1",
      quantityOnHandDecimal: new Prisma.Decimal(10),
      lowStockLevelDecimal: new Prisma.Decimal(2),
    });
    tx.inventoryBalance.findUnique.mockResolvedValue({
      id: "balance_1",
      quantityOnHandDecimal: new Prisma.Decimal(1),
    });

    await expect(
      applyInventoryBalanceChange({
        tx,
        businessId: "biz_1",
        location,
        itemId: "item_1",
        changeQuantity: new Prisma.Decimal(-2),
      }),
    ).rejects.toThrow("You do not have enough stock for Rice.");

    expect(tx.inventoryBalance.update).not.toHaveBeenCalled();
    expect(tx.inventoryItem.update).not.toHaveBeenCalled();
  });

  it("requires non-owner users to belong to the selected location", async () => {
    const tx = createTx();
    tx.businessLocation.findFirst.mockResolvedValue(location);
    tx.businessLocationMember.findFirst.mockResolvedValue(null);

    await expect(
      resolveInventoryLocation({
        tx,
        userId: "staff_1",
        businessId: "biz_1",
        role: Role.STAFF,
        locationId: "loc_1",
      }),
    ).rejects.toThrow("You do not have access to this location.");
  });
});
