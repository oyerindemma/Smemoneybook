"use client";

import { FormEvent, useState } from "react";
import type {
  Account,
  CaptureFormData,
  QuickAction,
} from "@/components/dashboard/types";
import type { PaymentStatus } from "@/lib/bookkeeping/transaction-engine";
import { formatNaira } from "@/lib/bookkeeping/transaction-engine";

export function FirstTransactionSetup({
  accounts,
  balance,
  isComplete,
  onSubmit,
  onDashboard,
}: {
  accounts: Account[];
  balance: number;
  isComplete: boolean;
  onSubmit: (formData: CaptureFormData) => Promise<void>;
  onDashboard: () => void;
}) {
  const [action, setAction] = useState<Extract<QuickAction, "sale" | "expense"> | null>(null);
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState(
    accounts.find((account) => account.type === "cash")?.id ?? accounts[0]?.id ?? "",
  );
  const [note, setNote] = useState("");
  const [partyName, setPartyName] = useState("");
  const [invoiceNote, setInvoiceNote] = useState("");
  const [generateInvoice, setGenerateInvoice] = useState(true);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("paid");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const amountNumber = Number(amount);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!amount.trim()) {
      setError("Enter an amount");
      return;
    }

    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      setError("Enter a valid amount");
      return;
    }

    if (!action) {
      return;
    }

    setError("");
    setIsSaving(true);
    const isCustomerCredit = action === "sale" && paymentStatus === "credit";
    try {
      await onSubmit({
        type: action,
        amount: amountNumber,
        accountId,
        description:
          (isCustomerCredit ? invoiceNote.trim() : note.trim()) ||
          (action === "sale" ? "First money in" : "First money out"),
        paymentStatus,
        partyName:
          paymentStatus === "paid"
            ? undefined
            : partyName.trim() || note.trim() || undefined,
      });
    } catch {
      setError("Couldn’t save. Try again.");
    } finally {
      setIsSaving(false);
    }
  }

  const isCustomerCredit = action === "sale" && paymentStatus === "credit";

  if (isComplete) {
    return (
      <main className="flex min-h-screen items-center bg-background p-4 text-textPrimary">
        <section className="mx-auto w-full max-w-md rounded-2xl bg-card p-6 text-center shadow-sm border border-gray-100 transition hover:shadow-md sm:p-7">
          <h1 className="text-2xl font-semibold">Nice. You’re tracking your money already.</h1>
          <p className="mt-3 text-sm text-textSecondary">You now have</p>
          <strong className="mt-2 block text-4xl">{formatNaira(balance)}</strong>
          <button
            className="mt-6 w-full rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primaryHover"
            type="button"
            onClick={onDashboard}
          >
            Go to dashboard
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background p-4 text-textPrimary">
      <section className="mx-auto w-full max-w-md rounded-2xl bg-card p-6 shadow-sm border border-gray-100 transition hover:shadow-md sm:p-7">
        <p className="text-sm text-textSecondary">First activity</p>
        <h1 className="mt-2 text-2xl font-semibold">Record your first money activity</h1>
        <p className="mt-2 text-sm leading-6 text-textSecondary">
          Start with one sale or one expense.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            className={`rounded-xl px-5 py-3 text-base font-semibold shadow-sm ${
              action === "sale"
                ? "bg-success text-white"
                : "border border-gray-200 bg-white text-textPrimary hover:bg-background"
            }`}
            type="button"
            onClick={() => {
              setAction("sale");
              setPaymentStatus("paid");
            }}
          >
            + I got money
          </button>
          <button
            className={`rounded-xl px-5 py-3 text-base font-semibold shadow-sm ${
              action === "expense"
                ? "bg-danger text-white"
                : "border border-gray-200 bg-white text-textPrimary hover:bg-background"
            }`}
            type="button"
            onClick={() => {
              setAction("expense");
              setPaymentStatus("paid");
            }}
          >
            - I spent money
          </button>
        </div>

        {action ? (
          <form className="mt-5 grid gap-6" onSubmit={submit}>
            <label className="grid gap-2 text-sm font-medium">
              Amount
              <input
                className={`h-14 rounded-xl border px-4 text-lg font-semibold ${
                  error ? "border-danger" : "border-gray-200"
                }`}
                inputMode="numeric"
                min="1"
                type="number"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="25000"
              />
              {error ? <p className="text-xs text-danger">{error}</p> : null}
            </label>

            <label className="grid gap-2 text-sm font-medium">
              Where?
              <select
                className="h-14 rounded-xl border border-gray-200 bg-card px-4"
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
              >
                {accounts
                  .filter((account) => ["cash", "bank", "pos"].includes(account.type))
                  .map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm font-medium">
              {paymentStatus !== "paid" && action === "sale" ? "Customer name" : "Short note optional"}
              <input
                className="h-14 rounded-xl border border-gray-200 px-4"
                value={paymentStatus !== "paid" && action === "sale" ? partyName : note}
                onChange={(event) =>
                  paymentStatus !== "paid" && action === "sale"
                    ? setPartyName(event.target.value)
                    : setNote(event.target.value)
                }
                placeholder={
                  paymentStatus !== "paid" && action === "sale"
                    ? "e.g. Amina Stores"
                    : action === "sale"
                      ? "e.g. morning sale"
                      : "e.g. transport"
                }
                required={paymentStatus !== "paid" && action === "sale"}
              />
            </label>

            <div className="grid gap-2 rounded-xl bg-background p-3">
              {(action === "sale"
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
                      ? "bg-primary text-white hover:bg-primaryHover"
                      : "border border-gray-200 bg-white text-textPrimary hover:bg-background"
                  }`}
                  type="button"
                  onClick={() => setPaymentStatus(value as PaymentStatus)}
                >
                  <span className="mr-2">{paymentStatus === value ? "●" : "○"}</span>
                  {label}
                </button>
              ))}
            </div>

            {isCustomerCredit ? (
              <div className="grid gap-4 rounded-2xl border border-gray-100 bg-background/70 p-4">
                <label className="flex items-center justify-between gap-3 rounded-xl bg-card px-4 py-3 text-sm font-medium shadow-sm">
                  <span>Generate invoice</span>
                  <input
                    checked={generateInvoice}
                    className="h-5 w-5 rounded border-gray-200 text-primary"
                    type="checkbox"
                    onChange={(event) => setGenerateInvoice(event.target.checked)}
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium">
                  Invoice note
                  <input
                    className="h-14 rounded-xl border border-gray-200 px-4"
                    value={invoiceNote}
                    onChange={(event) => setInvoiceNote(event.target.value)}
                    placeholder="Optional, e.g. bags of rice"
                  />
                </label>
              </div>
            ) : null}

            <button
              className="rounded-xl bg-primary px-5 py-4 text-base font-semibold text-white shadow-sm hover:bg-primaryHover disabled:bg-textMuted"
              type="submit"
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
