"use client";

import { forwardRef, FormEvent, useMemo, useRef, useState } from "react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import {
  Boxes,
  Minus,
  PackagePlus,
  Plus,
  Search,
  TrendingUp,
} from "lucide-react";
import { EmptyState } from "@/components/dashboard/EmptyState";
import type { InventoryItem } from "@/components/dashboard/types";
import { formatNaira } from "@/lib/bookkeeping/transaction-engine";

type ProductInput = {
  name: string;
  sellingPrice: number;
  costPrice: number;
  quantityOnHand: number;
  lowStockLevel: number;
};

type StockDirection = "in" | "out";

type FormErrors = Partial<Record<keyof ProductInput, string>>;

export function ProductList({
  items,
  onCreate,
  onMove,
  onNotifyOwner,
}: {
  items: InventoryItem[];
  onCreate: (input: ProductInput) => Promise<void>;
  onMove: (
    itemId: string,
    direction: StockDirection,
    quantity: number,
    note?: string,
  ) => Promise<void>;
  onNotifyOwner: (itemId: string, ownerPhone: string) => Promise<void>;
}) {
  const productNameRef = useRef<HTMLInputElement>(null);
  const [showAddProduct, setShowAddProduct] = useState(items.length === 0);
  const [productErrors, setProductErrors] = useState<FormErrors>({});
  const [isCreating, setIsCreating] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState(items[0]?.id ?? "");
  const [stockDirection, setStockDirection] = useState<StockDirection>("in");
  const [stockQuantity, setStockQuantity] = useState("1");
  const [stockReason, setStockReason] = useState("");
  const [stockError, setStockError] = useState("");
  const [isMoving, setIsMoving] = useState(false);
  const [search, setSearch] = useState("");
  const [quickMoveId, setQuickMoveId] = useState("");
  const [notifyingItemId, setNotifyingItemId] = useState("");

  const totalQuantity = items.reduce((total, item) => total + item.quantityOnHand, 0);
  const lowStockItems = items.filter((item) => item.quantityOnHand > 0 && item.isLowStock);
  const outOfStockItems = items.filter((item) => item.quantityOnHand === 0);
  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return items;
    }

    return items.filter((item) => item.name.toLowerCase().includes(query));
  }, [items, search]);
  const selectedItem =
    items.find((item) => item.id === selectedItemId) ?? items[0] ?? null;
  const needsEmptyState = items.length === 0;

  async function submitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const productForm = event.currentTarget;
    const form = new FormData(productForm);
    const nextProduct = {
      name: String(form.get("name") || "").trim(),
      costPrice: Number(form.get("costPrice")),
      sellingPrice: Number(form.get("sellingPrice")),
      quantityOnHand: Number(form.get("quantityOnHand") || 1),
      lowStockLevel: Number(form.get("lowStockLevel") || 5),
    };
    const errors = validateProduct(nextProduct);

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

    const quantity = Number(stockQuantity);
    const error = validateStockMove(selectedItem, stockDirection, quantity);
    if (error) {
      setStockError(error);
      return;
    }

    setStockError("");
    setIsMoving(true);
    try {
      await onMove(selectedItem.id, stockDirection, quantity, stockReason.trim() || undefined);
      setStockQuantity("1");
      setStockReason("");
    } finally {
      setIsMoving(false);
    }
  }

  async function quickMove(item: InventoryItem, direction: StockDirection) {
    const error = validateStockMove(item, direction, 1);
    if (error) {
      setStockError(error);
      return;
    }

    setQuickMoveId(`${item.id}-${direction}`);
    setStockError("");
    try {
      await onMove(item.id, direction, 1, direction === "in" ? "Quick add" : "Quick remove");
    } finally {
      setQuickMoveId("");
    }
  }

  async function notifyOwner(item: InventoryItem) {
    const ownerPhone = window.prompt("Owner WhatsApp phone number");
    if (!ownerPhone) {
      return;
    }

    setNotifyingItemId(item.id);
    try {
      await onNotifyOwner(item.id, ownerPhone);
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
        lowStockCount={lowStockItems.length + outOfStockItems.length}
        onAddProduct={openAddProduct}
        onAdjustStock={() =>
          document.getElementById("adjust-stock")?.scrollIntoView({ behavior: "smooth" })
        }
      />

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
              <Field label="Cost price" error={productErrors.costPrice}>
                <Input name="costPrice" min="0" inputMode="decimal" placeholder="0" type="number" />
              </Field>
              <Field label="Selling price" error={productErrors.sellingPrice}>
                <Input name="sellingPrice" min="0" inputMode="decimal" placeholder="0" type="number" />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Quantity" error={productErrors.quantityOnHand}>
                <Input name="quantityOnHand" defaultValue="1" min="0" inputMode="numeric" type="number" />
              </Field>
              <Field label="Low alert" error={productErrors.lowStockLevel}>
                <Input name="lowStockLevel" defaultValue="5" min="0" inputMode="numeric" type="number" />
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
                    {item.name} ({item.quantityOnHand} left)
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

          <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
            <Field label="Quantity">
              <Input
                min="1"
                inputMode="numeric"
                type="number"
                value={stockQuantity}
                onChange={(event) => setStockQuantity(event.target.value)}
              />
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
                    {item.quantityOnHand} left · alert at {item.lowStockLevel}
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
  lowStockCount,
  onAddProduct,
  onAdjustStock,
}: {
  totalProducts: number;
  totalQuantity: number;
  lowStockCount: number;
  onAddProduct: () => void;
  onAdjustStock: () => void;
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
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <SummaryMetric label="Products" value={totalProducts} />
        <SummaryMetric label="Quantity" value={totalQuantity} />
        <SummaryMetric label="Low stock" value={lowStockCount} warning />
      </div>
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
            <strong className="text-lg text-textPrimary">{item.quantityOnHand}</strong> left
          </p>
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
            disabled={Boolean(busyAction) || item.quantityOnHand <= 0}
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
  warning = false,
}: {
  label: string;
  value: number;
  warning?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-white/10 p-4">
      <p className="text-xs text-white/70">{label}</p>
      <strong className={`mt-2 block text-2xl font-bold ${warning ? "text-accent" : "text-white"}`}>
        {value}
      </strong>
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

function validateProduct(product: ProductInput) {
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

  if (!Number.isInteger(product.quantityOnHand) || product.quantityOnHand < 0) {
    errors.quantityOnHand = "Enter a valid quantity.";
  }

  if (!Number.isInteger(product.lowStockLevel) || product.lowStockLevel < 0) {
    errors.lowStockLevel = "Enter a valid alert level.";
  }

  return errors;
}

function validateStockMove(item: InventoryItem, direction: StockDirection, quantity: number) {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return "Enter a valid quantity.";
  }

  if (quantity > 999999) {
    return "Quantity is too large.";
  }

  if (direction === "out" && quantity > item.quantityOnHand) {
    return `Only ${item.quantityOnHand} left. You cannot remove more than that.`;
  }

  return "";
}

function getStockStatus(item: InventoryItem) {
  if (item.quantityOnHand <= 0) {
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
