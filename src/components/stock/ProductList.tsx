"use client";

import { forwardRef, FormEvent, useMemo, useRef, useState } from "react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import {
  Boxes,
  Download,
  Minus,
  PackagePlus,
  Plus,
  Printer,
  Search,
  Tags,
  TrendingUp,
} from "lucide-react";
import { EmptyState } from "@/components/dashboard/EmptyState";
import type { InventoryItem } from "@/components/dashboard/types";
import { formatNaira } from "@/lib/bookkeeping/transaction-engine";
import {
  formatQuantityValue,
  formatSaleQuantity,
  formatStockQuantity,
  getConversionFactor,
  getSellingUnitLabel,
  getStockQuantity,
  getStockUnitLabel,
  isConvertedSaleUnit,
  saleQuantityToStockQuantity,
  stockQuantityToSaleQuantity,
} from "@/lib/inventory/unit-conversion";

type ProductInput = {
  name: string;
  sku?: string;
  barcode?: string;
  unitName?: string;
  baseUnitName?: string;
  sellingUnitName?: string;
  conversionFactor?: number;
  categoryName?: string;
  brandName?: string;
  sellingPrice: number;
  costPrice: number;
  quantityOnHand: number;
  lowStockLevel: number;
};

type StockDirection = "in" | "out";

type FormErrors = Partial<Record<keyof ProductInput, string>>;
type NotifyOwnerResult = { whatsappUrl?: string } | void;

export function ProductList({
  items,
  onCreate,
  onCreateInvoice,
  onMove,
  onNotifyOwner,
}: {
  items: InventoryItem[];
  onCreate: (input: ProductInput) => Promise<void>;
  onCreateInvoice?: () => void;
  onMove: (
    itemId: string,
    direction: StockDirection,
    quantity: number,
    note?: string,
  ) => Promise<void>;
  onNotifyOwner: (itemId: string, ownerPhone: string) => Promise<NotifyOwnerResult>;
}) {
  const productNameRef = useRef<HTMLInputElement>(null);
  const [showAddProduct, setShowAddProduct] = useState(items.length === 0);
  const [productErrors, setProductErrors] = useState<FormErrors>({});
  const [isCreating, setIsCreating] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState(items[0]?.id ?? "");
  const [stockDirection, setStockDirection] = useState<StockDirection>("in");
  const [stockQuantity, setStockQuantity] = useState("1");
  const [stockUnitMode, setStockUnitMode] = useState<"stock" | "sale">("stock");
  const [stockReason, setStockReason] = useState("");
  const [stockError, setStockError] = useState("");
  const [isMoving, setIsMoving] = useState(false);
  const [search, setSearch] = useState("");
  const [quickMoveId, setQuickMoveId] = useState("");
  const [notifyingItemId, setNotifyingItemId] = useState("");

  const totalQuantity = items.reduce((total, item) => total + getStockQuantity(item), 0);
  const totalCostValue = items.reduce(
    (total, item) =>
      total + item.costPrice * stockQuantityToSaleQuantity(item, getStockQuantity(item)),
    0,
  );
  const totalSellingValue = items.reduce(
    (total, item) =>
      total + item.sellingPrice * stockQuantityToSaleQuantity(item, getStockQuantity(item)),
    0,
  );
  const expectedProfitValue = totalSellingValue - totalCostValue;
  const lowStockItems = items.filter((item) => getStockQuantity(item) > 0 && item.isLowStock);
  const outOfStockItems = items.filter((item) => getStockQuantity(item) === 0);
  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return items;
    }

    return items.filter((item) =>
      [
        item.name,
        item.sku,
        item.barcode,
        item.internalCode,
        item.categoryName,
        item.brandName,
      ]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(query)),
    );
  }, [items, search]);
  const selectedItem =
    items.find((item) => item.id === selectedItemId) ?? items[0] ?? null;
  const needsEmptyState = items.length === 0;

  async function submitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const productForm = event.currentTarget;
    const form = new FormData(productForm);
    const stockUnitName = String(form.get("unitName") || "").trim();
    const sellingUnitName = String(form.get("sellingUnitName") || "").trim();
    const nextProduct = {
      name: String(form.get("name") || "").trim(),
      sku: String(form.get("sku") || "").trim() || undefined,
      barcode: String(form.get("barcode") || "").trim() || undefined,
      unitName: stockUnitName || undefined,
      baseUnitName: stockUnitName || undefined,
      sellingUnitName: sellingUnitName || undefined,
      conversionFactor: sellingUnitName ? Number(form.get("conversionFactor") || 0) : undefined,
      categoryName: String(form.get("categoryName") || "").trim() || undefined,
      brandName: String(form.get("brandName") || "").trim() || undefined,
      costPrice: Number(form.get("costPrice")),
      sellingPrice: Number(form.get("sellingPrice")),
      quantityOnHand: Number(form.get("quantityOnHand") || 1),
      lowStockLevel: Number(form.get("lowStockLevel") || 5),
    };
    const errors = validateProduct(nextProduct, items);

    if (Object.keys(errors).length > 0) {
      setProductErrors(errors);
      return;
    }

    setProductErrors({});
    setIsCreating(true);
    try {
      await onCreate(nextProduct);
      productForm.reset();
      setShowAddProduct(false);
      window.setTimeout(() => productNameRef.current?.focus(), 0);
    } finally {
      setIsCreating(false);
    }
  }

  async function submitStockMove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedItem) {
      setStockError("Add a product first.");
      return;
    }

    const inputQuantity = Number(stockQuantity);
    const quantity =
      stockUnitMode === "sale"
        ? saleQuantityToStockQuantity(selectedItem, inputQuantity)
        : inputQuantity;
    const error = validateStockMove(selectedItem, stockDirection, quantity);
    if (error) {
      setStockError(error);
      return;
    }

    setStockError("");
    setIsMoving(true);
    try {
      await onMove(
        selectedItem.id,
        stockDirection,
        quantity,
        buildStockMoveNote(selectedItem, stockDirection, inputQuantity, quantity, stockUnitMode, stockReason),
      );
      setStockQuantity("1");
      setStockReason("");
    } finally {
      setIsMoving(false);
    }
  }

  async function quickMove(item: InventoryItem, direction: StockDirection) {
    const quantity = 1;
    const error = validateStockMove(item, direction, quantity);
    if (error) {
      setStockError(error);
      return;
    }

    setQuickMoveId(`${item.id}-${direction}`);
    setStockError("");
    try {
      await onMove(
        item.id,
        direction,
        quantity,
        `${direction === "in" ? "Quick add" : "Quick remove"} ${formatStockQuantity(item, quantity)}`,
      );
    } finally {
      setQuickMoveId("");
    }
  }

  async function notifyOwner(item: InventoryItem) {
    const ownerPhone = window.prompt("Owner WhatsApp phone number");
    if (!ownerPhone) {
      return;
    }

    const whatsappWindow = window.open("", "_blank");
    if (whatsappWindow) {
      whatsappWindow.opener = null;
    }

    setNotifyingItemId(item.id);
    try {
      const result = await onNotifyOwner(item.id, ownerPhone);
      if (result?.whatsappUrl) {
        if (whatsappWindow) {
          whatsappWindow.location.href = result.whatsappUrl;
        } else {
          window.open(result.whatsappUrl, "_blank", "noopener,noreferrer");
        }
      } else {
        whatsappWindow?.close();
      }
    } catch (error) {
      whatsappWindow?.close();
      throw error;
    } finally {
      setNotifyingItemId("");
    }
  }

  function openAddProduct() {
    setShowAddProduct(true);
    window.setTimeout(() => productNameRef.current?.focus(), 0);
  }

  return (
    <div className="space-y-6 pb-24 sm:pb-0">
      <StockSummaryCard
        totalProducts={items.length}
        totalQuantity={totalQuantity}
        totalCostValue={totalCostValue}
        totalSellingValue={totalSellingValue}
        expectedProfitValue={expectedProfitValue}
        lowStockCount={lowStockItems.length + outOfStockItems.length}
        onAddProduct={openAddProduct}
        onAdjustStock={() =>
          document.getElementById("adjust-stock")?.scrollIntoView({ behavior: "smooth" })
        }
        onCreateInvoice={onCreateInvoice}
      />

      <BarcodeLabelCard items={items} />

      <Card id="add-product">
        <SectionHeader
          eyebrow="Quick entry"
          title="Add product"
          description="Save a new product in one step."
        />

        {showAddProduct || needsEmptyState ? (
          <form className="mt-5 grid gap-4" onSubmit={submitProduct}>
            <Field label="Product name" error={productErrors.name}>
              <Input
                ref={productNameRef}
                name="name"
                placeholder="e.g. Indomie carton"
                autoComplete="off"
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Barcode" error={productErrors.barcode}>
                <Input name="barcode" inputMode="numeric" placeholder="Scan or enter code" />
              </Field>
              <Field label="SKU optional" error={productErrors.sku}>
                <Input name="sku" placeholder="Internal SKU" />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Cost price" error={productErrors.costPrice}>
                <Input name="costPrice" min="0" inputMode="decimal" placeholder="0" type="number" />
              </Field>
              <Field label="Selling price" error={productErrors.sellingPrice}>
                <Input name="sellingPrice" min="0" inputMode="decimal" placeholder="0" type="number" />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Stock unit">
                <Input name="unitName" placeholder="bottle, kg, piece" />
              </Field>
              <Field label="Selling unit optional">
                <Input name="sellingUnitName" placeholder="carton, bag" />
              </Field>
              <Field label="Stock per sale unit" error={productErrors.conversionFactor}>
                <Input
                  name="conversionFactor"
                  min="0"
                  inputMode="decimal"
                  placeholder="12"
                  step="any"
                  type="number"
                />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Category">
                <Input name="categoryName" placeholder="Beverages" />
              </Field>
              <Field label="Brand">
                <Input name="brandName" placeholder="Coca-Cola" />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Opening stock" error={productErrors.quantityOnHand}>
                <Input
                  name="quantityOnHand"
                  defaultValue="1"
                  min="0"
                  inputMode="decimal"
                  step="any"
                  type="number"
                />
              </Field>
              <Field label="Low alert" error={productErrors.lowStockLevel}>
                <Input
                  name="lowStockLevel"
                  defaultValue="5"
                  min="0"
                  inputMode="decimal"
                  step="any"
                  type="number"
                />
              </Field>
            </div>

            <Button type="submit" disabled={isCreating}>
              {isCreating ? "Saving..." : "Save product"}
            </Button>
          </form>
        ) : (
          <button
            className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-textPrimary transition-all duration-150 hover:bg-background hover:shadow-md active:scale-[0.98]"
            type="button"
            onClick={openAddProduct}
          >
            <PackagePlus size={18} aria-hidden="true" />
            Add another product
          </button>
        )}
      </Card>

      <Card id="adjust-stock">
        <SectionHeader
          eyebrow="Core action"
          title="Adjust stock"
          description="Add or remove stock in under five seconds."
        />

        <form className="mt-5 grid gap-4" onSubmit={submitStockMove}>
          <Field label="Product">
            <select
              className="min-h-12 rounded-xl border border-gray-200 bg-white px-4 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              value={selectedItem?.id ?? ""}
              onChange={(event) => setSelectedItemId(event.target.value)}
              disabled={items.length === 0}
            >
              {items.length === 0 ? (
                <option value="">No products yet</option>
              ) : (
                items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({formatStockQuantity(item)} left)
                  </option>
                ))
              )}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-background p-2">
            <ToggleButton
              active={stockDirection === "in"}
              tone="success"
              onClick={() => setStockDirection("in")}
            >
              Stock in
            </ToggleButton>
            <ToggleButton
              active={stockDirection === "out"}
              tone="danger"
              onClick={() => setStockDirection("out")}
            >
              Stock out
            </ToggleButton>
          </div>

          {selectedItem && isConvertedSaleUnit(selectedItem) ? (
            <p className="rounded-xl bg-background px-4 py-3 text-xs font-medium text-textSecondary">
              {formatSaleQuantity(selectedItem, 1)} equals{" "}
              {formatStockQuantity(selectedItem, getConversionFactor(selectedItem))}.
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-[140px_160px_1fr]">
            <Field label="Quantity">
              <Input
                min="1"
                inputMode="decimal"
                step="any"
                type="number"
                value={stockQuantity}
                onChange={(event) => setStockQuantity(event.target.value)}
              />
            </Field>
            <Field label="Unit">
              <select
                className="min-h-12 rounded-xl border border-gray-200 bg-white px-4 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-background disabled:text-textSecondary"
                value={stockUnitMode}
                onChange={(event) => setStockUnitMode(event.target.value as "stock" | "sale")}
                disabled={!selectedItem || !isConvertedSaleUnit(selectedItem)}
              >
                <option value="stock">
                  {selectedItem ? getStockUnitLabel(selectedItem, 2) : "Stock unit"}
                </option>
                {selectedItem && isConvertedSaleUnit(selectedItem) ? (
                  <option value="sale">{getSellingUnitLabel(selectedItem, 2)}</option>
                ) : null}
              </select>
            </Field>
            <Field label="Reason optional">
              <Input
                value={stockReason}
                onChange={(event) => setStockReason(event.target.value)}
                placeholder={stockDirection === "in" ? "New delivery" : "Damaged or sold"}
              />
            </Field>
          </div>

          {stockError ? <p className="text-sm font-medium text-danger">{stockError}</p> : null}

          <Button type="submit" disabled={isMoving || items.length === 0}>
            {isMoving ? "Updating..." : "Update stock"}
          </Button>
        </form>
      </Card>

      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <SectionHeader
            eyebrow="Products"
            title="Product list"
            description="Search and make quick stock changes inline."
          />
          <label className="relative block sm:w-72">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-textMuted"
              size={18}
              aria-hidden="true"
            />
            <input
              className="min-h-12 w-full rounded-xl border border-gray-200 bg-white pl-11 pr-4 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search products"
              type="search"
            />
          </label>
        </div>

        <div className="mt-5 grid gap-3">
          {needsEmptyState ? (
            <EmptyState
              icon={Boxes}
              title="No products yet"
              description="Add your first product when you’re ready to track stock."
              actionLabel="Add product"
              onAction={openAddProduct}
            />
          ) : filteredItems.length === 0 ? (
            <div className="rounded-2xl bg-background p-6 text-center">
              <p className="font-semibold text-textPrimary">No product found</p>
              <p className="mt-2 text-sm text-textSecondary">Try a different search.</p>
            </div>
          ) : (
            filteredItems.map((item) => (
              <ProductCard
                key={item.id}
                item={item}
                busyAction={quickMoveId}
                onAdd={() => quickMove(item, "in")}
                onRemove={() => quickMove(item, "out")}
              />
            ))
          )}
        </div>
      </Card>

      <Card>
        <SectionHeader
          eyebrow="Alerts"
          title="Low stock alerts"
          description="Products that need attention now."
        />
        <div className="mt-5 grid gap-3">
          {lowStockItems.length === 0 && outOfStockItems.length === 0 ? (
            <div className="rounded-2xl bg-success/10 p-5 text-sm font-medium text-success">
              Stock looks healthy.
            </div>
          ) : (
            [...outOfStockItems, ...lowStockItems].map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-3 rounded-2xl border border-accent/30 bg-accent/10 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-semibold text-textPrimary">{item.name}</p>
                  <p className="mt-1 text-sm text-textSecondary">
                    {formatStockQuantity(item)} left · alert at{" "}
                    {formatStockQuantity(item, item.lowStockLevelDecimal ?? item.lowStockLevel)}
                  </p>
                </div>
                <button
                  className="min-h-11 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-primaryHover hover:shadow-md active:scale-[0.98] disabled:opacity-50"
                  type="button"
                  disabled={Boolean(notifyingItemId)}
                  onClick={() => void notifyOwner(item)}
                >
                  {notifyingItemId === item.id ? "Sending..." : "Notify owner"}
                </button>
                <button
                  className="min-h-11 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-textPrimary shadow-sm transition-all duration-150 hover:bg-background hover:shadow-md active:scale-[0.98]"
                  type="button"
                  onClick={() => {
                    setSelectedItemId(item.id);
                    setStockDirection("in");
                    document
                      .getElementById("adjust-stock")
                      ?.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  Restock
                </button>
              </div>
            ))
          )}
        </div>
      </Card>

      <button
        className="fixed inset-x-4 bottom-24 z-30 min-h-12 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-lg transition-all duration-150 hover:bg-primaryHover hover:shadow-md active:scale-[0.98] sm:hidden"
        type="button"
        onClick={openAddProduct}
      >
        + Add product
      </button>
    </div>
  );
}

function StockSummaryCard({
  totalProducts,
  totalQuantity,
  totalCostValue,
  totalSellingValue,
  expectedProfitValue,
  lowStockCount,
  onAddProduct,
  onAdjustStock,
  onCreateInvoice,
}: {
  totalProducts: number;
  totalQuantity: number;
  totalCostValue: number;
  totalSellingValue: number;
  expectedProfitValue: number;
  lowStockCount: number;
  onAddProduct: () => void;
  onAdjustStock: () => void;
  onCreateInvoice?: () => void;
}) {
  return (
    <Card className="bg-primary text-white shadow-lg">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-white/70">Stock summary</p>
          <h2 className="mt-1 text-xl font-semibold">Today’s stock position</h2>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <button
            className="min-h-11 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-primary transition-all duration-150 hover:bg-background hover:shadow-md active:scale-[0.98]"
            type="button"
            onClick={onAddProduct}
          >
            + Add product
          </button>
          <button
            className="min-h-11 rounded-xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition-all duration-150 hover:bg-white/20 hover:shadow-md active:scale-[0.98]"
            type="button"
            onClick={onAdjustStock}
          >
            Adjust stock
          </button>
          {onCreateInvoice ? (
            <button
              className="col-span-2 min-h-11 rounded-xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition-all duration-150 hover:bg-white/20 hover:shadow-md active:scale-[0.98] sm:col-span-1"
              type="button"
              onClick={onCreateInvoice}
            >
              Create invoice
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <SummaryMetric
          label="Products"
          value={totalProducts}
          helper={`Cost ${formatNaira(totalCostValue)}`}
        />
        <SummaryMetric
          label="Quantity"
          value={formatQuantityValue(totalQuantity)}
          helper={`Sales ${formatNaira(totalSellingValue)}`}
        />
        <SummaryMetric
          label="Low stock"
          value={lowStockCount}
          helper={`Profit ${formatNaira(expectedProfitValue)}`}
          warning
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <MoneyMetric label="Stock Cost Value" value={totalCostValue} />
        <MoneyMetric label="Potential Revenue" value={totalSellingValue} />
        <MoneyMetric label="Potential Profit" value={expectedProfitValue} highlight />
      </div>
    </Card>
  );
}

function BarcodeLabelCard({ items }: { items: InventoryItem[] }) {
  const labelItems = useMemo(
    () =>
      items
        .map((item) => ({ item, code: getProductCode(item) }))
        .filter((entry): entry is { item: InventoryItem; code: string } => Boolean(entry.code)),
    [items],
  );

  function printLabels() {
    if (typeof window === "undefined" || labelItems.length === 0) {
      return;
    }

    const printWindow = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
    if (!printWindow) {
      return;
    }

    const labels = labelItems
      .map(({ item, code }) => buildBarcodeLabelHtml(item, code))
      .join("");

    printWindow.document.write(`<!doctype html>
      <html>
        <head>
          <title>Barcode Labels</title>
          <style>
            * { box-sizing: border-box; }
            body { margin: 0; padding: 18px; font-family: Arial, sans-serif; color: #111827; }
            .sheet { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; }
            .label { min-height: 104px; border: 1px solid #d1d5db; border-radius: 8px; padding: 10px; break-inside: avoid; }
            .name { font-size: 12px; font-weight: 700; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .meta { margin-top: 3px; font-size: 10px; color: #4b5563; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .bars { display: flex; align-items: flex-end; height: 34px; gap: 1px; margin-top: 8px; overflow: hidden; }
            .bar { display: block; height: 32px; background: #111827; }
            .code { margin-top: 5px; font-family: "Courier New", monospace; font-size: 11px; letter-spacing: 1px; text-align: center; }
            @page { size: A4; margin: 10mm; }
            @media print { body { padding: 0; } .label { border-color: #111827; } }
          </style>
        </head>
        <body>
          <main class="sheet">${labels}</main>
          <script>window.addEventListener("load", () => window.print());</script>
        </body>
      </html>`);
    printWindow.document.close();
  }

  function exportLabels() {
    if (typeof window === "undefined" || labelItems.length === 0) {
      return;
    }

    const rows = [
      ["Product", "Code", "Category", "Brand", "Stock", "Selling Price"],
      ...labelItems.map(({ item, code }) => [
        item.name,
        code,
        item.categoryName ?? "",
        item.brandName ?? "",
        formatStockQuantity(item),
        String(item.sellingPrice),
      ]),
    ];
    const csv = rows.map((row) => row.map(toCsvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `barcode-labels-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <SectionHeader
          eyebrow="Labels"
          title="Barcode labels"
          description="Print shelf labels or export product codes for external printers."
        />
        <span className="inline-flex w-fit items-center gap-2 rounded-xl bg-background px-3 py-2 text-xs font-semibold text-textSecondary">
          <Tags size={16} aria-hidden="true" />
          {labelItems.length} ready
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <button
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-primaryHover hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          onClick={printLabels}
          disabled={labelItems.length === 0}
        >
          <Printer size={17} aria-hidden="true" />
          Print labels
        </button>
        <button
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-textPrimary shadow-sm transition-all duration-150 hover:bg-background hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          onClick={exportLabels}
          disabled={labelItems.length === 0}
        >
          <Download size={17} aria-hidden="true" />
          Export CSV
        </button>
      </div>

      {labelItems.length === 0 ? (
        <p className="mt-4 rounded-xl bg-background px-4 py-3 text-sm font-medium text-textSecondary">
          Add a barcode or SKU to a product before printing labels.
        </p>
      ) : (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {labelItems.slice(0, 6).map(({ item, code }) => (
            <div key={item.id} className="rounded-xl border border-gray-100 bg-background px-4 py-3">
              <p className="truncate text-sm font-semibold text-textPrimary">{item.name}</p>
              <p className="mt-1 font-mono text-xs text-textSecondary">{code}</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function ProductCard({
  item,
  busyAction,
  onAdd,
  onRemove,
}: {
  item: InventoryItem;
  busyAction: string;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const status = getStockStatus(item);
  const isRemoving = busyAction === `${item.id}-out`;
  const isAdding = busyAction === `${item.id}-in`;
  const availableSaleQuantity = stockQuantityToSaleQuantity(item, getStockQuantity(item));

  return (
    <article
      className={`rounded-2xl border border-gray-100 bg-card p-4 shadow-sm transition-shadow duration-200 md:hover:shadow-md ${
        status.tone !== "success" ? "animate-pulse" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-semibold text-textPrimary">{item.name}</h3>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status.className}`}
            >
              {status.label}
            </span>
          </div>
          <p className="mt-2 text-sm text-textSecondary">
            <strong className="text-lg text-textPrimary">{formatStockQuantity(item)}</strong> left
          </p>
          {isConvertedSaleUnit(item) ? (
            <p className="mt-1 text-xs font-medium text-textSecondary">
              Sell as {formatSaleQuantity(item, availableSaleQuantity)} · 1{" "}
              {getSellingUnitLabel(item, 1)} = {formatStockQuantity(item, getConversionFactor(item))}
            </p>
          ) : null}
          {item.categoryName || item.brandName || item.barcode || item.internalCode ? (
            <p className="mt-1 text-xs text-textSecondary">
              {[item.categoryName, item.brandName, item.barcode || item.internalCode]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}
          <p className="mt-1 flex items-center gap-1 text-sm text-textSecondary">
            <TrendingUp size={14} aria-hidden="true" />
            Profit per item {formatNaira(item.profitPerItem)}
          </p>
        </div>

        <div className="grid gap-2">
          <button
            className="inline-flex min-h-11 min-w-24 items-center justify-center gap-2 rounded-xl bg-success px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-success/90 hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            onClick={onAdd}
            disabled={Boolean(busyAction)}
          >
            <Plus size={16} aria-hidden="true" />
            {isAdding ? "Adding" : "Add"}
          </button>
          <button
            className="inline-flex min-h-11 min-w-24 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-danger transition-all duration-150 hover:bg-background hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            onClick={onRemove}
            disabled={Boolean(busyAction) || getStockQuantity(item) <= 0}
          >
            <Minus size={16} aria-hidden="true" />
            {isRemoving ? "Removing" : "Remove"}
          </button>
        </div>
      </div>
    </article>
  );
}

function Card({
  children,
  className = "",
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={`rounded-2xl border border-gray-100 bg-card p-6 shadow-sm transition-shadow duration-200 md:hover:shadow-md md:p-7 ${className}`}
    >
      {children}
    </section>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <p className="text-xs text-textSecondary md:text-sm">{eyebrow}</p>
      <h2 className="mt-1 text-xl font-semibold tracking-tight text-textPrimary md:text-2xl">{title}</h2>
      <p className="mt-1 text-sm text-textSecondary md:text-base">{description}</p>
    </div>
  );
}

function SummaryMetric({
  label,
  value,
  helper,
  warning = false,
}: {
  label: string;
  value: number | string;
  helper?: string;
  warning?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-white/10 p-4">
      <p className="text-xs text-white/70">{label}</p>
      <strong className={`mt-2 block text-2xl font-bold ${warning ? "text-accent" : "text-white"}`}>
        {value}
      </strong>
      {helper ? <p className="mt-2 text-xs font-medium text-white/75">{helper}</p> : null}
    </div>
  );
}

function MoneyMetric({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-2xl p-4 ${highlight ? "bg-white text-primary" : "bg-white/10 text-white"}`}>
      <p className={`text-xs ${highlight ? "text-primary/70" : "text-white/70"}`}>{label}</p>
      <strong className="mt-2 block text-lg font-bold sm:text-xl">{formatNaira(value)}</strong>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium text-textPrimary">
      {label}
      {children}
      {error ? <span className="text-xs font-medium text-danger">{error}</span> : null}
    </label>
  );
}

const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = "", ...props }, ref) {
    return (
      <input
        ref={ref}
        className={`min-h-12 rounded-xl border border-gray-200 bg-white px-4 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 ${className}`}
        {...props}
      />
    );
  },
);

function Button({
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`min-h-12 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-primaryHover hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

function ToggleButton({
  active,
  tone,
  children,
  onClick,
}: {
  active: boolean;
  tone: "success" | "danger";
  children: ReactNode;
  onClick: () => void;
}) {
  const activeClass = tone === "success" ? "bg-success text-white" : "bg-danger text-white";

  return (
    <button
      className={`min-h-11 rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-150 hover:shadow-md active:scale-[0.98] ${
        active ? activeClass : "border border-gray-200 bg-white text-textPrimary hover:bg-background"
      }`}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function validateProduct(product: ProductInput, existingItems: InventoryItem[] = []) {
  const errors: FormErrors = {};

  if (!product.name) {
    errors.name = "Enter product name.";
  }

  if (!Number.isFinite(product.costPrice) || product.costPrice < 0) {
    errors.costPrice = "Enter a valid cost price.";
  }

  if (!Number.isFinite(product.sellingPrice) || product.sellingPrice < 0) {
    errors.sellingPrice = "Enter a valid selling price.";
  }

  if (!Number.isFinite(product.quantityOnHand) || product.quantityOnHand < 0) {
    errors.quantityOnHand = "Enter a valid quantity.";
  }

  if (!Number.isFinite(product.lowStockLevel) || product.lowStockLevel < 0) {
    errors.lowStockLevel = "Enter a valid alert level.";
  }

  if (
    product.sellingUnitName &&
    (!Number.isFinite(product.conversionFactor) || !product.conversionFactor || product.conversionFactor <= 0)
  ) {
    errors.conversionFactor = "Enter how many stock units make one sale unit.";
  }

  const barcode = normalizeProductCode(product.barcode);
  const sku = normalizeProductCode(product.sku);

  if (barcode && findItemByAnyCode(existingItems, barcode)) {
    errors.barcode = "This code already belongs to another product.";
  }

  if (sku && findItemByAnyCode(existingItems, sku)) {
    errors.sku = "This SKU already belongs to another product.";
  }

  if (barcode && sku && barcode === sku) {
    errors.sku = "Use a SKU that is different from the barcode.";
  }

  return errors;
}

function getProductCode(item: InventoryItem) {
  return item.barcode || item.internalCode || item.sku || "";
}

function normalizeProductCode(value?: string) {
  return value?.trim().toLowerCase() ?? "";
}

function findItemByAnyCode(items: InventoryItem[], code: string) {
  return items.find((item) =>
    [item.barcode, item.internalCode, item.sku]
      .filter(Boolean)
      .some((value) => normalizeProductCode(value) === code),
  );
}

function buildBarcodeLabelHtml(item: InventoryItem, code: string) {
  return `<article class="label">
    <div class="name">${escapeHtml(item.name)}</div>
    <div class="meta">${escapeHtml([item.categoryName, item.brandName, formatNaira(item.sellingPrice)].filter(Boolean).join(" · "))}</div>
    <div class="bars" aria-hidden="true">${buildCodeBars(code)}</div>
    <div class="code">${escapeHtml(code)}</div>
  </article>`;
}

function buildCodeBars(code: string) {
  const values = Array.from(code)
    .map((character) => character.charCodeAt(0))
    .filter((charCode) => charCode >= 32 && charCode <= 127)
    .slice(0, 48)
    .map((charCode) => charCode - 32);
  const checksum = values.reduce((total, value, index) => total + value * (index + 1), 104) % 103;
  const patterns = [104, ...values, checksum, 106];

  return patterns.map(renderCode128Pattern).join("");
}

function renderCode128Pattern(value: number) {
  const pattern = code128Patterns[value] ?? "";
  let isBar = true;

  return Array.from(pattern)
    .map((width) => {
      const moduleWidth = Number(width);
      const html = isBar
        ? `<span class="bar" style="width:${moduleWidth * 2}px"></span>`
        : `<span style="display:block;width:${moduleWidth * 2}px"></span>`;
      isBar = !isBar;
      return html;
    })
    .join("");
}

const code128Patterns = [
  "212222",
  "222122",
  "222221",
  "121223",
  "121322",
  "131222",
  "122213",
  "122312",
  "132212",
  "221213",
  "221312",
  "231212",
  "112232",
  "122132",
  "122231",
  "113222",
  "123122",
  "123221",
  "223211",
  "221132",
  "221231",
  "213212",
  "223112",
  "312131",
  "311222",
  "321122",
  "321221",
  "312212",
  "322112",
  "322211",
  "212123",
  "212321",
  "232121",
  "111323",
  "131123",
  "131321",
  "112313",
  "132113",
  "132311",
  "211313",
  "231113",
  "231311",
  "112133",
  "112331",
  "132131",
  "113123",
  "113321",
  "133121",
  "313121",
  "211331",
  "231131",
  "213113",
  "213311",
  "213131",
  "311123",
  "311321",
  "331121",
  "312113",
  "312311",
  "332111",
  "314111",
  "221411",
  "431111",
  "111224",
  "111422",
  "121124",
  "121421",
  "141122",
  "141221",
  "112214",
  "112412",
  "122114",
  "122411",
  "142112",
  "142211",
  "241211",
  "221114",
  "413111",
  "241112",
  "134111",
  "111242",
  "121142",
  "121241",
  "114212",
  "124112",
  "124211",
  "411212",
  "421112",
  "421211",
  "212141",
  "214121",
  "412121",
  "111143",
  "111341",
  "131141",
  "114113",
  "114311",
  "411113",
  "411311",
  "113141",
  "114131",
  "311141",
  "411131",
  "211412",
  "211214",
  "211232",
  "2331112",
] as const;

function toCsvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildStockMoveNote(
  item: InventoryItem,
  direction: StockDirection,
  inputQuantity: number,
  stockQuantity: number,
  unitMode: "stock" | "sale",
  reason: string,
) {
  const trimmedReason = reason.trim();

  if (trimmedReason) {
    return trimmedReason;
  }

  const action = direction === "in" ? "Stock in" : "Stock out";

  if (unitMode === "sale" && isConvertedSaleUnit(item)) {
    return `${action}: ${formatSaleQuantity(item, inputQuantity)} (${formatStockQuantity(item, stockQuantity)})`;
  }

  return `${action}: ${formatStockQuantity(item, stockQuantity)}`;
}

function validateStockMove(item: InventoryItem, direction: StockDirection, quantity: number) {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return "Enter a valid quantity.";
  }

  if (quantity > 999999) {
    return "Quantity is too large.";
  }

  if (direction === "out" && quantity > getStockQuantity(item)) {
    return `Only ${formatStockQuantity(item)} left. You cannot remove more than that.`;
  }

  return "";
}

function getStockStatus(item: InventoryItem) {
  if (getStockQuantity(item) <= 0) {
    return {
      label: "Out of stock",
      tone: "danger" as const,
      className: "bg-danger/10 text-danger",
    };
  }

  if (item.isLowStock) {
    return {
      label: "Low stock",
      tone: "warning" as const,
      className: "bg-accent/10 text-accent",
    };
  }

  return {
    label: "In stock",
    tone: "success" as const,
    className: "bg-success/10 text-success",
  };
}
