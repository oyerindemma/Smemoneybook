import type { InventoryItem } from "@/lib/bookkeeping/transaction-engine";

export function getStockQuantity(item: InventoryItem) {
  return item.quantityOnHandDecimal ?? item.quantityOnHand;
}

export function getConversionFactor(item: InventoryItem) {
  return item.conversionFactor && Number.isFinite(item.conversionFactor) && item.conversionFactor > 0
    ? item.conversionFactor
    : 1;
}

export function isConvertedSaleUnit(item: InventoryItem) {
  return getConversionFactor(item) !== 1 && Boolean(item.sellingUnitName || item.sellingUnitId);
}

export function saleQuantityToStockQuantity(item: InventoryItem, quantity: number) {
  return roundQuantity(normalizeQuantity(quantity) * getConversionFactor(item));
}

export function stockQuantityToSaleQuantity(item: InventoryItem, quantity: number) {
  return roundQuantity(normalizeQuantity(quantity) / getConversionFactor(item));
}

export function getAvailableSaleQuantity(item: InventoryItem) {
  return stockQuantityToSaleQuantity(item, getStockQuantity(item));
}

export function formatQuantityValue(quantity: number) {
  const rounded = roundQuantity(quantity);

  if (Number.isInteger(rounded)) {
    return String(rounded);
  }

  return rounded.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

export function formatStockQuantity(item: InventoryItem, quantity = getStockQuantity(item)) {
  return `${formatQuantityValue(quantity)} ${getStockUnitLabel(item, quantity)}`.trim();
}

export function formatSaleQuantity(item: InventoryItem, quantity: number) {
  return `${formatQuantityValue(quantity)} ${getSellingUnitLabel(item, quantity)}`.trim();
}

export function getStockUnitLabel(item: InventoryItem, quantity: number) {
  return getUnitLabel(
    item.baseUnitSingular ?? item.unitSingular,
    item.baseUnitPlural ?? item.unitPlural,
    quantity,
  );
}

export function getSellingUnitLabel(item: InventoryItem, quantity: number) {
  return getUnitLabel(
    item.sellingUnitSingular ?? item.unitSingular ?? item.baseUnitSingular,
    item.sellingUnitPlural ?? item.unitPlural ?? item.baseUnitPlural,
    quantity,
  );
}

function getUnitLabel(singular: string | undefined, plural: string | undefined, quantity: number) {
  if (quantity === 1) {
    return singular ?? plural ?? "unit";
  }

  return plural ?? singular ?? "units";
}

function normalizeQuantity(quantity: number) {
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
}

function roundQuantity(quantity: number) {
  return Math.round(quantity * 10000) / 10000;
}
