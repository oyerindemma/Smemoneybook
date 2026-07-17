"use client";

import { FormEvent, useMemo, useState } from "react";
import type { Account, Transaction } from "@/components/dashboard/types";
import { formatNaira } from "@/lib/bookkeeping/transaction-engine";

type CustomerReturnInput = {
  originalTransactionId: string;
  reason: string;
  disposition: "sellable_stock" | "damaged_stock" | "no_stock";
  outcome:
    | "cash_refund"
    | "transfer_refund"
    | "store_credit"
    | "exchange"
    | "reduce_customer_balance";
  accountId?: string;
  note?: string;
  items: Array<{ inventoryItemId: string; quantity: number }>;
};

type QuantityByItem = Record<string, string>;

const dispositionOptions: Array<{ value: CustomerReturnInput["disposition"]; label: string }> = [
  { value: "sellable_stock", label: "Return to stock" },
  { value: "damaged_stock", label: "Damaged stock" },
  { value: "no_stock", label: "No stock change" },
];

const outcomeOptions: Array<{ value: CustomerReturnInput["outcome"]; label: string }> = [
  { value: "cash_refund", label: "Cash refund" },
  { value: "transfer_refund", label: "Transfer refund" },
  { value: "store_credit", label: "Store credit" },
  { value: "exchange", label: "Exchange" },
  { value: "reduce_customer_balance", label: "Reduce customer balance" },
];

export function CustomerReturnPanel({
  transactions,
  accounts,
  onSubmit,
}: {
  transactions: Transaction[];
  accounts: Account[];
  onSubmit: (input: CustomerReturnInput) => Promise<boolean>;
}) {
  const returnableSales = useMemo(
    () =>
      transactions
        .filter(
          (transaction) =>
            transaction.type === "sale" &&
            !transaction.reversedByTransactionId &&
            !transaction.isReversal &&
            (transaction.invoiceItems?.length ?? 0) > 0,
        )
        .slice(0, 20),
    [transactions],
  );
  const [selectedTransactionId, setSelectedTransactionId] = useState(returnableSales[0]?.id ?? "");
  const selectedTransaction =
    returnableSales.find((transaction) => transaction.id === selectedTransactionId) ??
    returnableSales[0] ??
    null;
  const [quantities, setQuantities] = useState<QuantityByItem>({});
  const [disposition, setDisposition] =
    useState<CustomerReturnInput["disposition"]>("sellable_stock");
  const [outcome, setOutcome] = useState<CustomerReturnInput["outcome"]>("cash_refund");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const needsRefundAccount = outcome === "cash_refund" || outcome === "transfer_refund";

  async function submitReturn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedTransaction) {
      setError("Choose an original sale.");
      return;
    }

    if (!reason.trim()) {
      setError("Enter a reason for the return.");
      return;
    }

    const items = (selectedTransaction.invoiceItems ?? []).flatMap((item) => {
      const quantity = Number(quantities[item.inventoryItemId] || 0);

      if (!Number.isFinite(quantity) || quantity <= 0) {
        return [];
      }

      return [{ inventoryItemId: item.inventoryItemId, quantity }];
    });

    if (items.length === 0) {
      setError("Enter at least one returned quantity.");
      return;
    }

    const overLimit = items.find((item) => {
      const soldLine = selectedTransaction.invoiceItems?.find(
        (line) => line.inventoryItemId === item.inventoryItemId,
      );

      return soldLine ? item.quantity > soldLine.quantity : true;
    });

    if (overLimit) {
      setError("Returned quantity cannot be more than the quantity sold.");
      return;
    }

    setError("");
    setIsSaving(true);
    const saved = await onSubmit({
      originalTransactionId: selectedTransaction.id,
      disposition,
      outcome,
      accountId: needsRefundAccount ? accountId || undefined : undefined,
      reason: reason.trim(),
      note: note.trim() || undefined,
      items,
    });
    setIsSaving(false);

    if (saved) {
      setQuantities({});
      setReason("");
      setNote("");
    }
  }

  return (
    <section className="rounded-2xl border border-gray-100 bg-card p-4 shadow-sm transition-shadow duration-200 md:hover:shadow-md md:p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs text-textSecondary md:text-sm">Returns</p>
          <h2 className="text-xl font-semibold tracking-tight md:text-2xl">Customer return</h2>
        </div>
        {selectedTransaction ? (
          <p className="rounded-xl bg-background px-3 py-2 text-xs font-semibold text-textSecondary">
            {formatNaira(selectedTransaction.amount)} sale
          </p>
        ) : null}
      </div>

      {returnableSales.length === 0 ? (
        <p className="mt-4 rounded-xl bg-background p-4 text-sm font-medium text-textSecondary">
          Product sales will appear here when they can be returned.
        </p>
      ) : (
        <form className="mt-4 grid gap-4" onSubmit={submitReturn}>
          <label className="grid gap-2 text-sm font-medium">
            Original sale
            <select
              className="min-h-12 rounded-xl border border-gray-200 bg-white px-4 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              value={selectedTransaction?.id ?? ""}
              onChange={(event) => {
                setSelectedTransactionId(event.target.value);
                setQuantities({});
                setError("");
              }}
            >
              {returnableSales.map((transaction) => (
                <option key={transaction.id} value={transaction.id}>
                  {transaction.description} · {formatNaira(transaction.amount)} ·{" "}
                  {formatDate(transaction.occurredAt)}
                </option>
              ))}
            </select>
          </label>

          {selectedTransaction ? (
            <div className="grid gap-2 rounded-2xl bg-background p-3">
              {(selectedTransaction.invoiceItems ?? []).map((item) => (
                <label
                  className="grid gap-2 rounded-xl bg-white p-3 text-sm font-medium sm:grid-cols-[1fr_120px]"
                  key={item.inventoryItemId}
                >
                  <span>
                    <span className="block font-semibold">{item.name}</span>
                    <span className="mt-1 block text-xs text-textSecondary">
                      Sold {formatQuantity(item.quantity)}
                      {item.unitLabel ? ` ${item.unitLabel}` : ""} ·{" "}
                      {formatNaira(item.unitPrice)} each
                    </span>
                  </span>
                  <input
                    className="min-h-11 rounded-xl border border-gray-200 px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    inputMode="decimal"
                    min="0"
                    max={item.quantity}
                    step="any"
                    type="number"
                    placeholder="0"
                    value={quantities[item.inventoryItemId] ?? ""}
                    onChange={(event) =>
                      setQuantities((current) => ({
                        ...current,
                        [item.inventoryItemId]: event.target.value,
                      }))
                    }
                  />
                </label>
              ))}
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">
              Stock handling
              <select
                className="min-h-12 rounded-xl border border-gray-200 bg-white px-4 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                value={disposition}
                onChange={(event) =>
                  setDisposition(event.target.value as CustomerReturnInput["disposition"])
                }
              >
                {dispositionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Outcome
              <select
                className="min-h-12 rounded-xl border border-gray-200 bg-white px-4 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                value={outcome}
                onChange={(event) =>
                  setOutcome(event.target.value as CustomerReturnInput["outcome"])
                }
              >
                {outcomeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

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

          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">
              Reason
              <input
                className="min-h-12 rounded-xl border border-gray-200 px-4 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                placeholder="Wrong size, damaged item"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Note optional
              <input
                className="min-h-12 rounded-xl border border-gray-200 px-4 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                placeholder="Replacement details"
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
            {isSaving ? "Saving return..." : "Save return"}
          </button>
        </form>
      )}
    </section>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

function formatQuantity(quantity: number) {
  if (Number.isInteger(quantity)) {
    return String(quantity);
  }

  return quantity.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}
