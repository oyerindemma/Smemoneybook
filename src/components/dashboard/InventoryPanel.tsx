"use client";

import { FormEvent, useState } from "react";
import type { InventoryItem } from "@/components/dashboard/types";
import { formatNaira } from "@/lib/bookkeeping/transaction-engine";

export function InventoryPanel({
  items,
  onCreate,
  onMove,
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
    <section className="rounded-xl bg-white p-4 shadow-soft sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-black/55">Products</p>
          <h2 className="text-xl font-semibold">Stock on hand</h2>
        </div>
        <p
          className={`rounded-xl px-3 py-2 text-sm font-semibold ${
            lowStockCount > 0
              ? "bg-red-50 text-red-700"
              : "bg-[#F5F3EF] text-black/70"
          }`}
        >
          {lowStockCount} low
        </p>
      </div>

      <form className="mt-4 grid gap-3 rounded-xl bg-[#F5F3EF] p-3" onSubmit={submitProduct}>
        <p className="text-sm font-semibold">Add product</p>
        <input
          className="h-11 rounded-xl border border-black/10 px-3 text-sm"
          name="name"
          placeholder="Product name"
          required
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            className="h-11 rounded-xl border border-black/10 px-3 text-sm"
            min="0"
            name="costPrice"
            placeholder="Cost price"
            required
            type="number"
          />
          <input
            className="h-11 rounded-xl border border-black/10 px-3 text-sm"
            min="0"
            name="sellingPrice"
            placeholder="Selling price"
            required
            type="number"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input
            className="h-11 rounded-xl border border-black/10 px-3 text-sm"
            min="0"
            name="quantityOnHand"
            placeholder="How many?"
            type="number"
          />
          <input
            className="h-11 rounded-xl border border-black/10 px-3 text-sm"
            min="0"
            name="lowStockLevel"
            placeholder="Low alert"
            type="number"
          />
        </div>
        <button className="h-11 rounded-xl bg-ink text-sm font-semibold text-white" type="submit">
          Save product
        </button>
      </form>

      {items.length > 0 ? (
        <form className="mt-3 grid gap-3 rounded-xl border border-black/10 p-3" onSubmit={submitMovement}>
          <p className="text-sm font-semibold">Move stock</p>
          <select
            className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm"
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
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_96px]">
            <select
              className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm"
              name="direction"
            >
              <option value="in">Stock in</option>
              <option value="out">Stock out</option>
            </select>
            <input
              className="h-11 rounded-xl border border-black/10 px-3 text-sm"
              min="1"
              name="quantity"
              placeholder="Qty"
              required
              type="number"
            />
            <input
              className="h-11 rounded-xl border border-black/10 px-3 text-sm"
              name="reason"
              placeholder="Reason"
            />
            <button className="h-11 rounded-xl bg-ink text-sm font-semibold text-white" type="submit">
              Save
            </button>
          </div>
        </form>
      ) : null}

      <input
        className="mt-4 h-11 w-full rounded-xl border border-black/10 px-3 text-sm"
        placeholder="Search products"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      <div className="mt-4 divide-y divide-black/10">
        {visibleItems.length === 0 ? (
          <p className="rounded-xl bg-[#F5F3EF] p-4 text-sm text-black/60">
            {items.length === 0
              ? "Add your first product to see stock and profit."
              : "No product matches your search."}
          </p>
        ) : (
          visibleItems.slice(0, 8).map((item) => (
            <div key={item.id} className="grid gap-2 py-4 sm:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-medium">{item.name}</p>
                  {item.isLowStock ? (
                    <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-600">
                      Low stock
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-black/55">
                  {item.quantityOnHand} left · Profit {formatNaira(item.profitPerItem)} each
                </p>
                {item.movements.length > 0 ? (
                  <div className="mt-2 space-y-1">
                    {item.movements.slice(0, 3).map((movement) => (
                      <p key={movement.id} className="text-xs text-black/50">
                        {movement.type.replace("_", " ")} · {movement.quantity} ·{" "}
                        {movement.note ?? "No reason"}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
              <p className="text-sm font-semibold text-black/70">
                Sell {formatNaira(item.sellingPrice)}
              </p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
