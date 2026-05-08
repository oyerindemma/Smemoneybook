"use client";

import { EmptyState } from "@/components/dashboard/EmptyState";
import { FormEvent, useState } from "react";
import type { InventoryItem } from "@/components/dashboard/types";
import { formatNaira } from "@/lib/bookkeeping/transaction-engine";

export function InventoryPanel({
  items,
  onCreate,
  onMove,
  onRecord,
}: {
  items: InventoryItem[];
  onCreate: (input: {
    name: string;
    sellingPrice: number;
    costPrice: number;
    quantityOnHand: number;
    lowStockLevel: number;
  }) => void;
  onMove: (
    itemId: string,
    direction: "in" | "out",
    quantity: number,
    note?: string,
  ) => void;
  onRecord?: () => void;
}) {
  const [selectedItemId, setSelectedItemId] = useState(items[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const lowStockCount = items.filter((item) => item.isLowStock).length;
  const movementItemId = selectedItemId || items[0]?.id || "";
  const visibleItems = items.filter((item) =>
    `${item.name} ${item.sku ?? ""}`.toLowerCase().includes(query.toLowerCase()),
  );

  function submitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onCreate({
      name: String(form.get("name") || "").trim(),
      sellingPrice: Number(form.get("sellingPrice")),
      costPrice: Number(form.get("costPrice")),
      quantityOnHand: Number(form.get("quantityOnHand") || 0),
      lowStockLevel: Number(form.get("lowStockLevel") || 5),
    });
    event.currentTarget.reset();
  }

  function submitMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const itemId = String(form.get("itemId") || movementItemId);
    const direction = String(form.get("direction")) === "out" ? "out" : "in";
    onMove(
      itemId,
      direction,
      Number(form.get("quantity")),
      String(form.get("reason") || "").trim() || undefined,
    );
    event.currentTarget.reset();
  }

  return (
    <section className="rounded-2xl bg-card p-6 shadow-sm border border-gray-100 transition hover:shadow-md sm:p-7">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-textSecondary">Products</p>
          <h2 className="text-lg font-semibold">Stock on hand</h2>
        </div>
        <p
          className={`rounded-xl px-3 py-2 text-sm font-semibold ${
            lowStockCount > 0
              ? "bg-danger/5 text-danger"
              : "bg-background text-textSecondary"
          }`}
        >
          {lowStockCount} low
        </p>
      </div>

      <form className="mt-6 grid gap-4 rounded-2xl bg-background p-5" onSubmit={submitProduct}>
        <p className="text-sm font-semibold">Add product</p>
        <input
          className="h-11 rounded-xl border border-gray-200 px-3 text-sm"
          name="name"
          placeholder="Product name"
          required
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            className="h-11 rounded-xl border border-gray-200 px-3 text-sm"
            min="0"
            name="costPrice"
            placeholder="Cost price"
            required
            type="number"
          />
          <input
            className="h-11 rounded-xl border border-gray-200 px-3 text-sm"
            min="0"
            name="sellingPrice"
            placeholder="Selling price"
            required
            type="number"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input
            className="h-11 rounded-xl border border-gray-200 px-3 text-sm"
            min="0"
            name="quantityOnHand"
            placeholder="How many?"
            type="number"
          />
          <input
            className="h-11 rounded-xl border border-gray-200 px-3 text-sm"
            min="0"
            name="lowStockLevel"
            placeholder="Low alert"
            type="number"
          />
        </div>
        <button className="rounded-xl bg-primary text-sm font-semibold text-white hover:bg-primaryHover px-5 py-3 shadow-sm" type="submit">
          Save product
        </button>
      </form>

      {items.length > 0 ? (
        <form className="mt-6 grid gap-4 rounded-2xl border border-gray-200 p-5" onSubmit={submitMovement}>
          <p className="text-sm font-semibold">Move stock</p>
          <select
            className="h-11 rounded-xl border border-gray-200 bg-card px-3 text-sm"
            name="itemId"
            value={movementItemId}
            onChange={(event) => setSelectedItemId(event.target.value)}
          >
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_112px]">
            <select
              className="h-11 rounded-xl border border-gray-200 bg-card px-3 text-sm"
              name="direction"
            >
              <option value="in">Stock in</option>
              <option value="out">Stock out</option>
            </select>
            <input
              className="h-11 rounded-xl border border-gray-200 px-3 text-sm"
              min="1"
              name="quantity"
              placeholder="Qty"
              required
              type="number"
            />
            <input
              className="h-11 rounded-xl border border-gray-200 px-3 text-sm"
              name="reason"
              placeholder="Reason"
            />
            <button className="rounded-xl bg-primary text-sm font-semibold text-white hover:bg-primaryHover px-5 py-3 shadow-sm" type="submit">
              Save
            </button>
          </div>
        </form>
      ) : null}

      <input
        className="mt-6 h-12 w-full rounded-xl border border-gray-200 px-4 text-sm"
        placeholder="Search products"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      <div className="mt-6 divide-y divide-gray-100">
        {visibleItems.length === 0 ? (
          <EmptyState
            title={items.length === 0 ? "No products yet" : "No product found"}
            description={
              items.length === 0
                ? "Add your first product when you’re ready to track stock."
                : "Try a different search"
            }
            actionLabel={items.length === 0 ? "Record money" : undefined}
            onAction={items.length === 0 ? onRecord : undefined}
          />
        ) : (
          visibleItems.slice(0, 8).map((item) => (
            <div key={item.id} className="grid gap-4 py-5 sm:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-medium">{item.name}</p>
                  {item.isLowStock ? (
                    <span className="rounded-full bg-danger/5 px-2 py-1 text-xs font-semibold text-danger">
                      Low stock
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-textSecondary">
                  {item.quantityOnHand} left · Profit {formatNaira(item.profitPerItem)} each
                </p>
                {item.movements.length > 0 ? (
                  <div className="mt-2 space-y-1">
                    {item.movements.slice(0, 3).map((movement) => (
                      <p key={movement.id} className="text-xs text-textMuted">
                        {movement.type.replace("_", " ")} · {movement.quantity} ·{" "}
                        {movement.note ?? "No reason"}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
              <p className="text-sm font-semibold text-textSecondary">
                Sell {formatNaira(item.sellingPrice)}
              </p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
