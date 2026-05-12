"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type {
  Account,
  CaptureFormData,
  InventoryItem,
  QuickAction,
  RecordMoneyMode,
} from "@/components/dashboard/types";
import type { PaymentStatus } from "@/lib/bookkeeping/transaction-engine";
import { formatNaira } from "@/lib/bookkeeping/transaction-engine";

export function RecordMoneySheet({
  accounts,
  initialMode = "money",
  items,
  onClose,
  onSubmit,
}: {
  accounts: Account[];
  initialMode?: RecordMoneyMode;
  items: InventoryItem[];
  onClose: () => void;
  onSubmit: (formData: CaptureFormData) => Promise<boolean>;
}) {
  const [action, setAction] = useState<QuickAction>(initialMode === "invoice" ? "sale" : "sale");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState(
    accounts.find((account) => account.type === "cash")?.id ?? accounts[0]?.id ?? "",
  );
  const [destinationAccountId, setDestinationAccountId] = useState(
    accounts.find((account) => account.type === "bank")?.id ?? accounts[1]?.id ?? "",
  );
  const [note, setNote] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [itemQuantity, setItemQuantity] = useState(1);
  const [paidNow, setPaidNow] = useState(initialMode !== "invoice");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const amountInputRef = useRef<HTMLInputElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const selectedItem = items.find((item) => item.id === selectedItemId);
  const normalizedQuantity = Math.max(Number(itemQuantity) || 1, 1);
  const productAmount = selectedItem ? selectedItem.sellingPrice * normalizedQuantity : 0;
  const amountNumber = selectedItem ? productAmount : Number(amount);
  const isSale = action === "sale";
  const isInvoice = isSale && !paidNow;
  const isDirty = Boolean(
    amount.trim() ||
      note.trim() ||
      customerName.trim() ||
      customerPhone.trim() ||
      dueAt ||
      selectedItemId,
  );
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

    if (!selectedItem && !amount.trim()) {
      setError("Enter an amount.");
      return;
    }

    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      setError("Enter a valid amount.");
      return;
    }

    if (isInvoice && !customerName.trim()) {
      setError("Enter the customer name for this invoice.");
      return;
    }

    if (selectedItem && selectedItem.quantityOnHand < normalizedQuantity) {
      setError("You do not have enough stock for this invoice.");
      return;
    }

    setError("");
    setIsSaving(true);

    const type = action === "expense" ? "expense" : action === "transfer" ? "transfer" : "sale";
    const paymentStatus: PaymentStatus =
      type === "transfer" ? "paid" : paidNow ? "paid" : type === "sale" ? "credit" : "unpaid";
    const fallbackDescription =
      type === "sale" ? "Money in" : type === "transfer" ? "Move money" : "Money out";
    const productDescription = selectedItem
      ? `${selectedItem.name} x ${normalizedQuantity}`
      : "";
    const saved = await onSubmit({
      type,
      amount: amountNumber,
      accountId,
      destinationAccountId: type === "transfer" ? destinationAccountId : undefined,
      description: note.trim() || productDescription || fallbackDescription,
      paymentStatus,
      partyName:
        paymentStatus === "paid"
          ? undefined
          : customerName.trim() || note.trim() || undefined,
      partyPhone: customerPhone.trim() || undefined,
      inventoryItemId: selectedItem?.id,
      inventoryQuantity: selectedItem ? normalizedQuantity : undefined,
      costOfGoods: selectedItem ? selectedItem.costPrice * normalizedQuantity : undefined,
      dueAt: dueAt || undefined,
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
    setSelectedItemId("");
    setItemQuantity(1);
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
        className="relative max-h-[92vh] w-full animate-[sheetUp_180ms_ease-out] overflow-y-auto rounded-t-3xl border border-gray-100 bg-card p-5 shadow-2xl md:max-w-lg md:rounded-3xl md:p-7"
        id="record-money-sheet"
        role="dialog"
      >
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-textMuted/30 md:hidden" />
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-textSecondary md:text-sm">Fast entry</p>
            <h2 className="text-xl font-semibold tracking-tight md:text-2xl" id="record-money-title">
              {initialMode === "invoice" ? "Create invoice" : "Record money"}
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
          {isSale && items.length > 0 ? (
            <div className="grid gap-3 rounded-2xl bg-background p-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_112px]">
                <label className="grid gap-2 text-sm font-medium" htmlFor="record-product">
                  Goods sold
                  <select
                    className="h-14 rounded-xl border border-gray-200 bg-white px-4 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    id="record-product"
                    value={selectedItemId}
                    onChange={(event) => {
                      setSelectedItemId(event.target.value);
                      setError("");
                    }}
                  >
                    <option value="">No stock item</option>
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.quantityOnHand} left)
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-medium" htmlFor="record-product-quantity">
                  Qty
                  <input
                    className="h-14 rounded-xl border border-gray-200 bg-white px-4 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    id="record-product-quantity"
                    min="1"
                    type="number"
                    value={itemQuantity}
                    onChange={(event) => setItemQuantity(Number(event.target.value))}
                  />
                </label>
              </div>
              {selectedItem ? (
                <p className="text-sm text-textSecondary">
                  Invoice total {formatNaira(productAmount)} · stock will reduce by {normalizedQuantity}
                </p>
              ) : null}
            </div>
          ) : null}

          <label className="grid gap-2 text-sm font-medium" htmlFor="record-amount">
            {selectedItem ? "Amount from stock item" : "Amount"}
            <input
              ref={amountInputRef}
              className={`h-14 rounded-xl border bg-white px-4 text-2xl font-bold tabular-nums outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-background disabled:text-textSecondary ${
                error ? "border-danger" : "border-gray-200"
              }`}
              disabled={Boolean(selectedItem)}
              id="record-amount"
              inputMode="decimal"
              min="1"
              placeholder="25000"
              type="number"
              value={selectedItem ? String(productAmount) : amount}
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

          {action !== "transfer" ? (
            <label className="flex min-h-14 items-center justify-between gap-4 rounded-2xl bg-background px-4 py-3 text-sm font-medium">
              <span>{action === "sale" ? "Paid now, not invoice" : "Paid now"}</span>
              <input
                checked={paidNow}
                className="h-5 w-5 rounded border-gray-200 text-primary focus:ring-primary/20"
                type="checkbox"
                onChange={(event) => setPaidNow(event.target.checked)}
              />
              <span className="sr-only">Customer will pay later when unchecked</span>
            </label>
          ) : null}

          {isInvoice ? (
            <div className="grid gap-4 rounded-2xl border border-gray-100 bg-background/70 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium" htmlFor="record-customer-name">
                  Customer name
                  <input
                    className="h-14 rounded-xl border border-gray-200 bg-white px-4 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    id="record-customer-name"
                    placeholder="Amina Stores"
                    value={customerName}
                    onChange={(event) => setCustomerName(event.target.value)}
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium" htmlFor="record-customer-phone">
                  Phone / WhatsApp
                  <input
                    className="h-14 rounded-xl border border-gray-200 bg-white px-4 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    id="record-customer-phone"
                    inputMode="tel"
                    placeholder="+234..."
                    type="tel"
                    value={customerPhone}
                    onChange={(event) => setCustomerPhone(event.target.value)}
                  />
                </label>
              </div>
              <label className="grid gap-2 text-sm font-medium" htmlFor="record-due-date">
                Due date optional
                <input
                  className="h-14 rounded-xl border border-gray-200 bg-white px-4 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                  id="record-due-date"
                  type="date"
                  value={dueAt}
                  onChange={(event) => setDueAt(event.target.value)}
                />
              </label>
            </div>
          ) : null}

          <label className="grid gap-2 text-sm font-medium" htmlFor="record-note">
            {isInvoice ? "Invoice note optional" : "Short note optional"}
            <input
              className="h-14 rounded-xl border border-gray-200 bg-white px-4 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              id="record-note"
              placeholder={
                isInvoice
                  ? "e.g. 2 bags of rice"
                  : action === "sale"
                    ? "Customer or sale note"
                    : "Optional"
              }
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>

          <button
            className="min-h-14 rounded-xl bg-primary px-5 py-4 text-base font-semibold text-white shadow-sm transition-all duration-150 hover:bg-primaryHover hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            type="submit"
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : isInvoice ? "Save invoice" : "Save money"}
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
