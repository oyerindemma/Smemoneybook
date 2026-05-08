"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type { Account, CaptureFormData, QuickAction } from "@/components/dashboard/types";
import type { PaymentStatus } from "@/lib/bookkeeping/transaction-engine";

export function RecordMoneySheet({
  accounts,
  onClose,
  onSubmit,
}: {
  accounts: Account[];
  onClose: () => void;
  onSubmit: (formData: CaptureFormData) => Promise<boolean>;
}) {
  const [action, setAction] = useState<QuickAction>("sale");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState(
    accounts.find((account) => account.type === "cash")?.id ?? accounts[0]?.id ?? "",
  );
  const [destinationAccountId, setDestinationAccountId] = useState(
    accounts.find((account) => account.type === "bank")?.id ?? accounts[1]?.id ?? "",
  );
  const [note, setNote] = useState("");
  const [paidNow, setPaidNow] = useState(true);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const amountInputRef = useRef<HTMLInputElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const amountNumber = Number(amount);
  const isDirty = Boolean(amount.trim() || note.trim());
  const destinationOptions = useMemo(
    () => accounts.filter((account) => account.id !== accountId),
    [accounts, accountId],
  );

  const requestClose = useCallback(() => {
    if (isSaving) {
      return;
    }

    if (isDirty && !window.confirm("Close without saving this money record?")) {
      return;
    }

    onClose();
  }, [isDirty, isSaving, onClose]);

  const trapFocus = useCallback((event: KeyboardEvent) => {
    const sheet = document.getElementById("record-money-sheet");
    const focusable = Array.from(
      sheet?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    ).filter((element) => !element.hasAttribute("disabled"));

    if (focusable.length === 0) {
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => amountInputRef.current?.focus(), 80);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        requestClose();
      }

      if (event.key === "Tab") {
        trapFocus(event);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [requestClose, trapFocus]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!amount.trim()) {
      setError("Enter an amount.");
      return;
    }

    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      setError("Enter a valid amount.");
      return;
    }

    setError("");
    setIsSaving(true);

    const type = action === "expense" ? "expense" : action === "transfer" ? "transfer" : "sale";
    const paymentStatus: PaymentStatus =
      type === "transfer" ? "paid" : paidNow ? "paid" : type === "sale" ? "credit" : "unpaid";
    const fallbackDescription =
      type === "sale" ? "Money in" : type === "transfer" ? "Move money" : "Money out";
    const saved = await onSubmit({
      type,
      amount: amountNumber,
      accountId,
      destinationAccountId: type === "transfer" ? destinationAccountId : undefined,
      description: note.trim() || fallbackDescription,
      paymentStatus,
      partyName: paymentStatus === "paid" ? undefined : note.trim() || undefined,
    });

    setIsSaving(false);

    if (saved) {
      onClose();
    }
  }

  function selectAction(nextAction: QuickAction) {
    setAction(nextAction);
    setPaidNow(true);
    setError("");
    window.setTimeout(() => amountInputRef.current?.focus(), 0);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-textPrimary/45 p-0 backdrop-blur-sm md:items-center md:p-6">
      <button
        aria-label="Close record money sheet"
        className="absolute inset-0 cursor-default"
        type="button"
        onClick={requestClose}
      />
      <section
        aria-labelledby="record-money-title"
        aria-modal="true"
        className="relative w-full animate-[sheetUp_180ms_ease-out] rounded-t-3xl border border-gray-100 bg-card p-5 shadow-2xl md:max-w-lg md:rounded-3xl md:p-7"
        id="record-money-sheet"
        role="dialog"
      >
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-textMuted/30 md:hidden" />
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-textSecondary md:text-sm">Fast entry</p>
            <h2 className="text-xl font-semibold tracking-tight md:text-2xl" id="record-money-title">
              Record money
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200 bg-white text-textSecondary transition-all duration-150 hover:shadow-md active:scale-[0.98]"
            type="button"
            onClick={requestClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <ActionButton active={action === "sale"} onClick={() => selectAction("sale")}>
            + I got money
          </ActionButton>
          <ActionButton active={action === "expense"} onClick={() => selectAction("expense")}>
            - I spent money
          </ActionButton>
          <ActionButton active={action === "transfer"} onClick={() => selectAction("transfer")}>
            Move money
          </ActionButton>
        </div>

        <form className="mt-6 grid gap-4" onSubmit={submit}>
          <label className="grid gap-2 text-sm font-medium" htmlFor="record-amount">
            Amount
            <input
              ref={amountInputRef}
              className={`h-14 rounded-xl border bg-white px-4 text-2xl font-bold tabular-nums outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 ${
                error ? "border-danger" : "border-gray-200"
              }`}
              id="record-amount"
              inputMode="decimal"
              min="1"
              placeholder="25000"
              type="number"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
            {error ? <p className="text-xs font-medium text-danger">{error}</p> : null}
          </label>

          <label className="grid gap-2 text-sm font-medium" htmlFor="record-account">
            {action === "transfer" ? "From" : "Where?"}
            <select
              className="h-14 rounded-xl border border-gray-200 bg-white px-4 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              id="record-account"
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

          {action === "transfer" ? (
            <label className="grid gap-2 text-sm font-medium" htmlFor="record-destination">
              To
              <select
                className="h-14 rounded-xl border border-gray-200 bg-white px-4 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                id="record-destination"
                value={destinationAccountId || destinationOptions[0]?.id || ""}
                onChange={(event) => setDestinationAccountId(event.target.value)}
              >
                {destinationOptions.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="grid gap-2 text-sm font-medium" htmlFor="record-note">
            Short note optional
            <input
              className="h-14 rounded-xl border border-gray-200 bg-white px-4 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              id="record-note"
              placeholder={action === "sale" ? "Customer or sale note" : "Optional"}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>

          {action !== "transfer" ? (
            <label className="flex min-h-14 items-center justify-between gap-4 rounded-2xl bg-background px-4 py-3 text-sm font-medium">
              <span>{action === "sale" ? "Paid now" : "Paid now"}</span>
              <input
                checked={paidNow}
                className="h-5 w-5 rounded border-gray-200 text-primary focus:ring-primary/20"
                type="checkbox"
                onChange={(event) => setPaidNow(event.target.checked)}
              />
              <span className="sr-only">Customer will pay later when unchecked</span>
            </label>
          ) : null}

          <button
            className="min-h-14 rounded-xl bg-primary px-5 py-4 text-base font-semibold text-white shadow-sm transition-all duration-150 hover:bg-primaryHover hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            type="submit"
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save money"}
          </button>
        </form>
      </section>
    </div>
  );
}

function ActionButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={`min-h-12 rounded-xl px-2 py-3 text-xs font-semibold transition-all duration-150 hover:shadow-md active:scale-[0.98] md:text-sm ${
        active
          ? "bg-primary text-white shadow-sm hover:bg-primaryHover"
          : "border border-gray-200 bg-white text-textPrimary hover:bg-background"
      }`}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
