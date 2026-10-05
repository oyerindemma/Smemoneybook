"use client";

import { FormEvent, useState } from "react";
import type { Account, InventoryItem } from "@/components/dashboard/types";
import { formatNaira } from "@/lib/bookkeeping/transaction-engine";
import {
  formatStockQuantity,
  getStockQuantity,
  stockQuantityToSaleQuantity,
} from "@/lib/inventory/unit-conversion";

type SupplierReturnInput = {
  reason: string;
  settlement:
    | "supplier_credit"
    | "refund_received"
    | "replacement_expected"
    | "reduce_supplier_bill";
  supplierId?: string;
  originalTransactionId?: string;
  accountId?: string;
  note?: string;
  items: Array<{ inventoryItemId: string; quantity: number }>;
};

type QuantityByItem = Record<string, string>;

const settlementOptions: Array<{ value: SupplierReturnInput["settlement"]; label: string }> = [
  { value: "supplier_credit", label: "Supplier credit" },
  { value: "refund_received", label: "Refund received" },
  { value: "replacement_expected", label: "Replacement expected" },
  { value: "reduce_supplier_bill", label: "Reduce supplier bill" },
];

export function SupplierReturnPanel({
  items,
  accounts,
  onSubmit,
}: {
  items: InventoryItem[];
  accounts: Account[];
  onSubmit: (input: SupplierReturnInput) => Promise<boolean>;
}) {
  const [quantities, setQuantities] = useState<QuantityByItem>({});
  const [settlement, setSettlement] =
    useState<SupplierReturnInput["settlement"]>("supplier_credit");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const needsRefundAccount = settlement === "refund_received";
  const selectedLines = items.flatMap((item) => {
    const quantity = Number(quantities[item.id] || 0);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return [];
    }

    return [{ item, quantity }];
  });
  const estimatedValue = selectedLines.reduce(
    (total, line) =>
      total + line.item.costPrice * stockQuantityToSaleQuantity(line.item, line.quantity),
    0,
  );

  async function submitReturn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!reason.trim()) {
      setError("Enter a reason for the supplier return.");
      return;
    }

    if (selectedLines.length === 0) {
      setError("Enter at least one returned quantity.");
      return;
    }

    const overStock = selectedLines.find((line) => line.quantity > getStockQuantity(line.item));

    if (overStock) {
      setError(`Only ${formatStockQuantity(overStock.item)} left for ${overStock.item.name}.`);
      return;
    }

    setError("");
    setIsSaving(true);
    const saved = await onSubmit({
      settlement,
      accountId: needsRefundAccount ? accountId || undefined : undefined,
      reason: reason.trim(),
      note: note.trim() || undefined,
      items: selectedLines.map((line) => ({
        inventoryItemId: line.item.id,
        quantity: line.quantity,
      })),
    });
    setIsSaving(false);

    if (saved) {
      setQuantities({});
      setReason("");
      setNote("");
    }
  }

  return (
    <section className="rounded-2xl border border-gray-100 bg-card p-6 shadow-sm transition-shadow duration-200 md:hover:shadow-md md:p-7">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs text-textSecondary md:text-sm">Supplier returns</p>
          <h2 className="text-xl font-semibold tracking-tight text-textPrimary md:text-2xl">
            Return stock to supplier
          </h2>
        </div>
        <p className="rounded-xl bg-background px-3 py-2 text-xs font-semibold text-textSecondary">
          Est. {formatNaira(estimatedValue)}
        </p>
      </div>

      {items.length === 0 ? (
        <p className="mt-5 rounded-xl bg-background p-4 text-sm font-medium text-textSecondary">
          Add products before recording supplier returns.
        </p>
      ) : (
        <form className="mt-5 grid gap-4" onSubmit={submitReturn}>
          <div className="grid max-h-80 gap-2 overflow-y-auto rounded-2xl bg-background p-3">
            {items.map((item) => (
              <label
                className="grid gap-2 rounded-xl bg-white p-3 text-sm font-medium sm:grid-cols-[1fr_120px]"
                key={item.id}
              >
                <span>
                  <span className="block font-semibold">{item.name}</span>
                  <span className="mt-1 block text-xs text-textSecondary">
                    {formatStockQuantity(item)} left · cost {formatNaira(item.costPrice)}
                  </span>
                </span>
                <input
                  className="min-h-11 rounded-xl border border-gray-200 px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                  inputMode="decimal"
                  min="0"
                  max={getStockQuantity(item)}
                  step="any"
                  type="number"
                  placeholder="0"
                  value={quantities[item.id] ?? ""}
                  onChange={(event) =>
                    setQuantities((current) => ({
                      ...current,
                      [item.id]: event.target.value,
                    }))
                  }
                />
              </label>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">
              Settlement
              <select
                className="min-h-12 rounded-xl border border-gray-200 bg-white px-4 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                value={settlement}
                onChange={(event) =>
                  setSettlement(event.target.value as SupplierReturnInput["settlement"])
                }
              >
                {settlementOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {needsRefundAccount ? (
              <label className="grid gap-2 text-sm font-medium">
                Refund account
                <select
                  className="min-h-12 rounded-xl border border-gray-200 bg-white px-4 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                  value={accountId}
                  onChange={(event) => setAccountId(event.target.value)}
                >
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">
              Reason
              <input
                className="min-h-12 rounded-xl border border-gray-200 px-4 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                placeholder="Damaged delivery, wrong item"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Note optional
              <input
                className="min-h-12 rounded-xl border border-gray-200 px-4 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                placeholder="Supplier reference"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
          </div>

          {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}

          <button
            className="min-h-12 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-primaryHover hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            type="submit"
            disabled={isSaving}
          >
            {isSaving ? "Saving return..." : "Save supplier return"}
          </button>
        </form>
      )}
    </section>
  );
}
