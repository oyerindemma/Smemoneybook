"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type {
  Account,
  CaptureFormData,
  QuickAction,
} from "@/components/dashboard/types";
import type { PaymentStatus } from "@/lib/bookkeeping/transaction-engine";

const expenseCategories = [
  "Stock purchase",
  "Transport",
  "Rent",
  "Utilities",
  "Salary",
  "Fuel",
  "Repairs",
  "Marketing",
  "Bank charges",
  "Other",
];

export function QuickCapture({
  accounts,
  activeAction,
  lastUsedAccountId,
  onActionSelect,
  onSubmit,
}: {
  accounts: Account[];
  activeAction: QuickAction | null;
  lastUsedAccountId: string;
  onActionSelect: (action: QuickAction) => void;
  onSubmit: (formData: CaptureFormData) => void;
}) {
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("paid");
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeAction) {
      amountRef.current?.focus();
    }
  }, [activeAction]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const note = String(form.get("note") || "").trim();
    const amount = Number(form.get("amount"));
    const type =
      activeAction === "expense"
        ? "expense"
        : activeAction === "transfer"
          ? "transfer"
          : "sale";
    const category = String(form.get("category") || "").trim();
    const occurredAt = String(form.get("occurredAt") || "").trim();
    const partyPhone = String(form.get("partyPhone") || "").trim();
    const dueAt = String(form.get("dueAt") || "").trim();

    onSubmit({
      type,
      amount,
      accountId: String(form.get("accountId")),
      destinationAccountId:
        type === "transfer" ? String(form.get("destinationAccountId")) : undefined,
      description:
        note ||
        (type === "sale"
          ? "Money in"
          : type === "transfer"
            ? "Money transfer"
            : "Money out"),
      category: category || undefined,
      paymentStatus: type === "transfer" ? "paid" : paymentStatus,
      partyName: type === "transfer" || paymentStatus === "paid" ? undefined : note || undefined,
      partyPhone: partyPhone || undefined,
      occurredAt: occurredAt || undefined,
      dueAt: dueAt || undefined,
    });

    event.currentTarget.reset();
    setPaymentStatus("paid");
    amountRef.current?.focus();
  }

  const isMoneyIn = activeAction === "sale";
  const isTransfer = activeAction === "transfer";
  const defaultDestinationAccountId =
    accounts.find((account) => account.id !== lastUsedAccountId)?.id ?? accounts[0]?.id;
  const handleActionSelect = (action: QuickAction) => {
    setPaymentStatus("paid");
    onActionSelect(action);
  };

  return (
    <section className="rounded-xl bg-white p-4 shadow-soft sm:p-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <button
          className={`h-14 rounded-xl text-base font-semibold ${
            activeAction === "sale"
              ? "bg-palm text-white"
              : "border border-black/10 bg-[#F5F3EF] text-black/75"
          }`}
          type="button"
          onClick={() => handleActionSelect("sale")}
        >
          + I got money
        </button>
        <button
          className={`h-14 rounded-xl text-base font-semibold ${
            activeAction === "expense"
              ? "bg-red-600 text-white"
              : "border border-black/10 bg-[#F5F3EF] text-black/75"
          }`}
          type="button"
          onClick={() => handleActionSelect("expense")}
        >
          - I spent money
        </button>
        <button
          className={`h-14 rounded-xl text-base font-semibold ${
            activeAction === "transfer"
              ? "bg-lagoon text-white"
              : "border border-black/10 bg-[#F5F3EF] text-black/75"
          }`}
          type="button"
          onClick={() => handleActionSelect("transfer")}
        >
          Move money
        </button>
      </div>

      {activeAction ? (
        <form className="mt-5 grid gap-4" onSubmit={submit}>
          <label className="grid gap-2 text-sm font-medium">
            Amount
            <input
              ref={amountRef}
              className="h-14 rounded-xl border border-black/10 px-4 text-lg font-semibold focus:focus-ring"
              name="amount"
              type="number"
              min="1"
              inputMode="numeric"
              placeholder="25000"
              required
            />
          </label>

          <label className="grid gap-2 text-sm font-medium">
            {isTransfer ? "From account" : "Account"}
            <select
              className="h-14 rounded-xl border border-black/10 bg-white px-4 focus:focus-ring"
              name="accountId"
              defaultValue={lastUsedAccountId}
              required
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>

          {isTransfer ? (
            <label className="grid gap-2 text-sm font-medium">
              To account
              <select
                className="h-14 rounded-xl border border-black/10 bg-white px-4 focus:focus-ring"
                name="destinationAccountId"
                defaultValue={defaultDestinationAccountId}
                required
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="grid gap-2 text-sm font-medium">
            Date
            <input
              className="h-14 rounded-xl border border-black/10 px-4 focus:focus-ring"
              name="occurredAt"
              type="date"
            />
          </label>

          {activeAction === "expense" ? (
            <label className="grid gap-2 text-sm font-medium">
              Category
              <select
                className="h-14 rounded-xl border border-black/10 bg-white px-4 focus:focus-ring"
                name="category"
                defaultValue=""
              >
                <option value="">Choose category</option>
                {expenseCategories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {!isTransfer && paymentStatus !== "paid" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium">
                Phone
                <input
                  className="h-14 rounded-xl border border-black/10 px-4 focus:focus-ring"
                  name="partyPhone"
                  placeholder="Optional"
                  type="tel"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Due date
                <input
                  className="h-14 rounded-xl border border-black/10 px-4 focus:focus-ring"
                  name="dueAt"
                  type="date"
                />
              </label>
            </div>
          ) : null}

          <label className="grid gap-2 text-sm font-medium">
            Note
            <input
              className="h-14 rounded-xl border border-black/10 px-4 focus:focus-ring"
              name="note"
              placeholder={
                isMoneyIn
                  ? "Optional, e.g. Amina Stores"
                  : isTransfer
                    ? "Optional, e.g. POS settlement"
                    : "Optional, e.g. fuel"
              }
            />
          </label>

          {!isTransfer ? (
          <div className="grid gap-2 rounded-xl bg-[#F5F3EF] p-3">
            {(isMoneyIn
              ? [
                  ["paid", "Paid now"],
                  ["credit", "Customer will pay later"],
                ]
              : [
                  ["paid", "Paid now"],
                  ["unpaid", "I will pay later"],
                ]
            ).map(([value, label]) => (
              <button
                key={value}
                className={`flex h-11 items-center rounded-xl px-3 text-left text-sm font-medium ${
                  paymentStatus === value
                    ? "bg-ink text-white"
                    : "bg-white text-black/70"
                }`}
                type="button"
                onClick={() => setPaymentStatus(value as PaymentStatus)}
              >
                <span className="mr-2">{paymentStatus === value ? "●" : "○"}</span>
                {label}
              </button>
            ))}
          </div>
          ) : null}

          <div className="sticky bottom-20 z-20 -mx-4 bg-white/95 px-4 py-3 sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:py-0">
            <button
              className="h-14 w-full rounded-xl bg-ink text-base font-semibold text-white"
              type="submit"
            >
              Save
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
