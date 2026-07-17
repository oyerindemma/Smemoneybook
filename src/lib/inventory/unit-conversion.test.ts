import { describe, expect, it } from "vitest";
import {
  formatSaleQuantity,
  formatStockQuantity,
  getAvailableSaleQuantity,
  isConvertedSaleUnit,
  saleQuantityToStockQuantity,
  stockQuantityToSaleQuantity,
} from "@/lib/inventory/unit-conversion";
import type { InventoryItem } from "@/lib/bookkeeping/transaction-engine";

const item: InventoryItem = {
  id: "item_1",
  name: "Soft drink",
  sellingPrice: 6000,
  costPrice: 4800,
  quantityOnHand: 24,
  quantityOnHandDecimal: 24,
  lowStockLevel: 6,
  lowStockLevelDecimal: 6,
  profitPerItem: 1200,
  isLowStock: false,
  unitName: "bottle",
  unitSingular: "bottle",
  unitPlural: "bottles",
  baseUnitName: "bottle",
  baseUnitSingular: "bottle",
  baseUnitPlural: "bottles",
  sellingUnitName: "carton",
  sellingUnitSingular: "carton",
  sellingUnitPlural: "cartons",
  conversionFactor: 12,
  movements: [],
};

describe("unit conversion helpers", () => {
  it("converts sale units into stock units", () => {
    expect(isConvertedSaleUnit(item)).toBe(true);
    expect(saleQuantityToStockQuantity(item, 2)).toBe(24);
    expect(stockQuantityToSaleQuantity(item, 18)).toBe(1.5);
    expect(getAvailableSaleQuantity(item)).toBe(2);
  });

  it("formats sale and stock quantity labels", () => {
    expect(formatSaleQuantity(item, 1)).toBe("1 carton");
    expect(formatSaleQuantity(item, 1.5)).toBe("1.5 cartons");
    expect(formatStockQuantity(item, 12)).toBe("12 bottles");
  });
});
