"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type {
  Account,
  CaptureFormData,
  QuickAction,
} from "@/components/dashboard/types";
import type { PaymentStatus } from "@/lib/bookkeeping/transaction-engine";

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
    const type = activeAction === "expense" ? "expense" : "sale";

    onSubmit({
      type,
      amount,
      accountId: String(form.get("accountId")),
      description: note || (type === "sale" ? "Money in" : "Money out"),
      paymentStatus,
      partyName: paymentStatus === "paid" ? undefined : note || undefined,
    });

    event.currentTarget.reset();
    setPaymentStatus("paid");
    amountRef.current?.focus();
  }

  const isMoneyIn = activeAction === "sale";
  const handleActionSelect = (action: QuickAction) => {
    setPaymentStatus("paid");
    onActionSelect(action);
  };

  return (
    <section className="rounded-xl bg-white p-4 shadow-soft sm:p-6">
      <div className="grid grid-cols-2 gap-3">
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
            Account
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

          <label className="grid gap-2 text-sm font-medium">
            Note
            <input
              className="h-14 rounded-xl border border-black/10 px-4 focus:focus-ring"
              name="note"
              placeholder={
                isMoneyIn ? "Optional, e.g. Amina Stores" : "Optional, e.g. fuel"
              }
            />
          </label>

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
