"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import type {
  Account,
  CaptureFormData,
  InventoryItem,
  QuickAction,
  RecordMoneyMode,
} from "@/components/dashboard/types";
import type { VoiceBookkeepingDraft } from "@/lib/voice";
import type { PaymentStatus } from "@/lib/bookkeeping/transaction-engine";
import { formatNaira } from "@/lib/bookkeeping/transaction-engine";
import { getBusinessTemplate } from "@/lib/bookkeeping/business-templates";
import { trackProductEvent } from "@/lib/analytics/product-analytics";

type InvoiceDraftLine = {
  inventoryItemId: string;
  quantity: number;
};

type InvoiceMessageLine = {
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

const emptyInvoiceLine: InvoiceDraftLine = {
  inventoryItemId: "",
  quantity: 1,
};

export function RecordMoneySheet({
  accounts,
  initialMode = "money",
  initialDraft,
  items,
  businessType,
  onClose,
  onSubmit,
}: {
  accounts: Account[];
  initialMode?: RecordMoneyMode;
  initialDraft?: VoiceBookkeepingDraft;
  items: InventoryItem[];
  businessType?: string;
  onClose: () => void;
  onSubmit: (formData: CaptureFormData) => Promise<boolean>;
}) {
  const initialAction = getInitialAction(initialMode, initialDraft);
  const initialAccountId = getInitialAccountId(accounts, initialDraft);
  const [action, setAction] = useState<QuickAction>(initialAction);
  const [amount, setAmount] = useState(
    initialDraft?.capture?.amount ? String(initialDraft.capture.amount) : "",
  );
  const [accountId, setAccountId] = useState(
    initialAccountId,
  );
  const [note, setNote] = useState(initialDraft?.capture?.description ?? "");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [invoiceLines, setInvoiceLines] = useState<InvoiceDraftLine[]>([
    { ...emptyInvoiceLine },
  ]);
  const [paidNow, setPaidNow] = useState(
    initialDraft?.capture?.paymentStatus
      ? initialDraft.capture.paymentStatus === "paid"
      : initialMode !== "invoice",
  );
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const amountInputRef = useRef<HTMLInputElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const startedAtRef = useRef(0);
  const expenseCategories = getBusinessTemplate(businessType).expenseCategories;
  const selectedInvoiceItems = invoiceLines
    .map((line) => {
      const item = items.find((stockItem) => stockItem.id === line.inventoryItemId);
      const quantity = Math.max(Number(line.quantity) || 1, 1);

      return item
        ? {
            inventoryItemId: item.id,
            name: item.name,
            quantity,
            unitPrice: item.sellingPrice,
            costPrice: item.costPrice,
            total: item.sellingPrice * quantity,
          }
        : null;
    })
    .filter((line): line is NonNullable<typeof line> => Boolean(line));
  const hasProductLines = selectedInvoiceItems.length > 0;
  const productAmount = selectedInvoiceItems.reduce((total, item) => total + item.total, 0);
  const costOfGoods = selectedInvoiceItems.reduce(
    (total, item) => total + item.costPrice * item.quantity,
    0,
  );
  const amountNumber = hasProductLines ? productAmount : Number(amount);
  const isSale = action === "sale";
  const isInvoiceMode = initialMode === "invoice" && isSale;
  const isCreditSale = isSale && !paidNow;
  const shouldCaptureCustomer = isInvoiceMode || isCreditSale;
  const isDirty = Boolean(
    amount.trim() ||
      note.trim() ||
      customerName.trim() ||
      customerPhone.trim() ||
      dueAt ||
      invoiceLines.some((line) => line.inventoryItemId),
  );
  const requestClose = useCallback(() => {
    if (isSaving) {
      return;
    }

    if (isDirty && !window.confirm("Close without saving this money record?")) {
      return;
    }

    if (isDirty) {
      trackProductEvent("money_entry_abandoned", {
        mode: initialMode,
        action,
        entry_time_seconds: Math.round((Date.now() - startedAtRef.current) / 1000),
      });
    }

    onClose();
  }, [action, initialMode, isDirty, isSaving, onClose]);

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
    startedAtRef.current = Date.now();
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

    if (!hasProductLines && !amount.trim()) {
      setError("Enter an amount.");
      return;
    }

    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      setError("Enter a valid amount.");
      return;
    }

    if (shouldCaptureCustomer && !customerName.trim()) {
      setError("Enter the customer name for this invoice.");
      return;
    }

    const productQuantities = new Map<string, number>();

    for (const item of selectedInvoiceItems) {
      productQuantities.set(
        item.inventoryItemId,
        (productQuantities.get(item.inventoryItemId) ?? 0) + item.quantity,
      );
    }

    const outOfStockItem = items.find(
      (item) => (productQuantities.get(item.id) ?? 0) > item.quantityOnHand,
    );

    if (outOfStockItem) {
      setError(`You do not have enough stock for ${outOfStockItem.name}.`);
      return;
    }

    setError("");
    setIsSaving(true);

    const type = action === "expense" ? "expense" : "sale";
    const paymentStatus: PaymentStatus =
      paidNow ? "paid" : type === "sale" ? "credit" : "unpaid";
    const fallbackDescription =
      type === "sale" ? "Sale" : "Expense";
    const productDescription = selectedInvoiceItems
      .map((item) => `${item.name} x ${item.quantity}`)
      .join(", ");
    const invoiceMessage = isInvoiceMode
      ? buildInvoiceMessage({
          amount: amountNumber,
          customerName: customerName.trim(),
          dueAt,
          items: selectedInvoiceItems,
          note: note.trim() || productDescription,
          paidNow,
        })
      : "";
    const invoiceWindow = isInvoiceMode ? window.open("", "_blank") : null;

    if (invoiceWindow) {
      invoiceWindow.opener = null;
    }

    const saved = await onSubmit({
      type,
      amount: amountNumber,
      accountId,
      description: note.trim() || productDescription || fallbackDescription,
      category: type === "expense" ? category || undefined : undefined,
      paymentStatus,
      partyName:
        paymentStatus === "paid" && !isInvoiceMode
          ? undefined
          : customerName.trim() || note.trim() || undefined,
      partyPhone: customerPhone.trim() || undefined,
      inventoryItemId: selectedInvoiceItems[0]?.inventoryItemId,
      inventoryQuantity: selectedInvoiceItems[0]?.quantity,
      invoiceItems: selectedInvoiceItems.map((item) => ({
        inventoryItemId: item.inventoryItemId,
        quantity: item.quantity,
      })),
      costOfGoods: hasProductLines ? costOfGoods : undefined,
      dueAt: dueAt || undefined,
    });

    setIsSaving(false);

    if (saved) {
      const entryTimeSeconds = getElapsedSeconds(startedAtRef.current);

      trackProductEvent("money_entry_completed", {
        type,
        mode: initialMode,
        entry_time_seconds: entryTimeSeconds,
        has_customer: Boolean(customerName.trim()),
        has_note: Boolean(note.trim()),
        has_category: Boolean(category),
        offline_capable: true,
      });
      if (initialDraft) {
        trackProductEvent("voice_entry_saved", {
          type,
          entry_time_seconds: entryTimeSeconds,
          has_amount: Boolean(amountNumber),
        });
      }
      if (isInvoiceMode) {
        openWhatsAppInvoice(customerPhone, invoiceMessage, invoiceWindow);
      }
      onClose();
    } else {
      invoiceWindow?.close();
    }
  }

  function selectAction(nextAction: QuickAction) {
    setAction(nextAction);
    setPaidNow(true);
    setError("");
    setInvoiceLines([{ ...emptyInvoiceLine }]);
    setCategory("");
    window.setTimeout(() => amountInputRef.current?.focus(), 0);
  }

  function updateInvoiceLine(index: number, nextLine: InvoiceDraftLine) {
    setInvoiceLines((current) =>
      current.map((line, lineIndex) => (lineIndex === index ? nextLine : line)),
    );
    setError("");
  }

  function removeInvoiceLine(index: number) {
    setInvoiceLines((current) =>
      current.length === 1
        ? [{ ...emptyInvoiceLine }]
        : current.filter((_, lineIndex) => lineIndex !== index),
    );
    setError("");
  }

  function addInvoiceLine() {
    setInvoiceLines((current) => [...current, { ...emptyInvoiceLine }]);
    setError("");
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
              {initialDraft
                ? "Review voice entry"
                : initialMode === "invoice"
                ? "Send invoice"
                : action === "expense"
                  ? "Add expense"
                  : "Add sale"}
            </h2>
            {initialDraft ? (
              <p className="mt-1 text-sm leading-5 text-textSecondary">
                Heard: “{initialDraft.intent.rawText}”
              </p>
            ) : null}
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

        <div className="grid grid-cols-2 gap-2">
          <ActionButton active={action === "sale"} onClick={() => selectAction("sale")}>
            Add Sale
          </ActionButton>
          <ActionButton active={action === "expense"} onClick={() => selectAction("expense")}>
            Add Expense
          </ActionButton>
        </div>

        <form className="mt-6 grid gap-4" onSubmit={submit}>
          {isSale && items.length > 0 ? (
            <div className="grid gap-3 rounded-2xl bg-background p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">Goods sold</p>
                <button
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-xs font-semibold text-textPrimary transition hover:bg-background"
                  type="button"
                  onClick={addInvoiceLine}
                >
                  <Plus size={15} aria-hidden="true" />
                  Add product
                </button>
              </div>

              <div className="grid gap-3">
                {invoiceLines.map((line, index) => {
                  const rowItem = items.find((item) => item.id === line.inventoryItemId);
                  const rowTotal = rowItem
                    ? rowItem.sellingPrice * Math.max(Number(line.quantity) || 1, 1)
                    : 0;

                  return (
                    <div
                      className="grid gap-3 rounded-xl border border-gray-100 bg-white p-3 sm:grid-cols-[1fr_96px_44px]"
                      key={`${index}-${line.inventoryItemId}`}
                    >
                      <label className="grid gap-2 text-sm font-medium" htmlFor={`record-product-${index}`}>
                        Product
                        <select
                          className="h-12 rounded-xl border border-gray-200 bg-white px-3 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                          id={`record-product-${index}`}
                          value={line.inventoryItemId}
                          onChange={(event) =>
                            updateInvoiceLine(index, {
                              ...line,
                              inventoryItemId: event.target.value,
                            })
                          }
                        >
                          <option value="">No stock item</option>
                          {items.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name} ({item.quantityOnHand} left)
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-2 text-sm font-medium" htmlFor={`record-product-quantity-${index}`}>
                        Qty
                        <input
                          className="h-12 rounded-xl border border-gray-200 bg-white px-3 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                          id={`record-product-quantity-${index}`}
                          min="1"
                          type="number"
                          value={line.quantity}
                          onChange={(event) =>
                            updateInvoiceLine(index, {
                              ...line,
                              quantity: Number(event.target.value),
                            })
                          }
                        />
                      </label>
                      <button
                        aria-label="Remove product"
                        className="mt-auto flex h-12 w-12 items-center justify-center rounded-xl border border-gray-200 text-textSecondary transition hover:bg-background"
                        type="button"
                        onClick={() => removeInvoiceLine(index)}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                      {rowItem ? (
                        <p className="text-xs text-textSecondary sm:col-span-3">
                          {formatNaira(rowTotal)} · stock will reduce by{" "}
                          {Math.max(Number(line.quantity) || 1, 1)}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {hasProductLines ? (
                <p className="text-sm text-textSecondary">
                  Invoice total {formatNaira(productAmount)} across {selectedInvoiceItems.length}{" "}
                  product{selectedInvoiceItems.length === 1 ? "" : "s"}.
                </p>
              ) : null}
            </div>
          ) : null}

          <label className="grid gap-2 text-sm font-medium" htmlFor="record-amount">
            Amount
            <input
              ref={amountInputRef}
              className={`h-14 rounded-xl border bg-white px-4 text-2xl font-bold tabular-nums outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-background disabled:text-textSecondary ${
                error ? "border-danger" : "border-gray-200"
              }`}
              disabled={hasProductLines}
              id="record-amount"
              inputMode="decimal"
              min="1"
              placeholder="25000"
              type="number"
              value={hasProductLines ? String(productAmount) : amount}
              onChange={(event) => setAmount(event.target.value)}
            />
            {error ? <p className="text-xs font-medium text-danger">{error}</p> : null}
          </label>

          {action === "expense" ? (
            <label className="grid gap-2 text-sm font-medium" htmlFor="record-category">
              Category
              <select
                className="h-14 rounded-xl border border-gray-200 bg-white px-4 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                id="record-category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option value="">Choose one</option>
                {expenseCategories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="grid gap-2 text-sm font-medium" htmlFor="record-account">
            Money location
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

          <label className="flex min-h-14 items-center justify-between gap-4 rounded-2xl bg-background px-4 py-3 text-sm font-medium">
              <span>{action === "sale" ? "Customer paid now" : "Paid already"}</span>
              <input
                checked={paidNow}
                className="h-5 w-5 rounded border-gray-200 text-primary focus:ring-primary/20"
                type="checkbox"
                onChange={(event) => setPaidNow(event.target.checked)}
              />
              <span className="sr-only">Customer will pay later when unchecked</span>
            </label>

          {shouldCaptureCustomer ? (
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
            {isInvoiceMode || isCreditSale ? "Invoice note optional" : action === "sale" ? "Customer or note optional" : "Note optional"}
            <input
              className="h-14 rounded-xl border border-gray-200 bg-white px-4 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              id="record-note"
              placeholder={
                isInvoiceMode || isCreditSale
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
            {isSaving
              ? isInvoiceMode
                ? "Sending..."
                : "Saving..."
              : isInvoiceMode
                ? "Send invoice"
                : action === "expense"
                  ? "Save expense"
                  : "Save sale"}
          </button>
        </form>
      </section>
    </div>
  );
}

function getInitialAction(
  initialMode: RecordMoneyMode,
  initialDraft?: VoiceBookkeepingDraft,
): QuickAction {
  if (initialDraft?.intent.kind === "expense") {
    return "expense";
  }

  if (initialDraft?.intent.kind === "sale") {
    return "sale";
  }

  return initialMode === "expense" ? "expense" : "sale";
}

function getInitialAccountId(accounts: Account[], initialDraft?: VoiceBookkeepingDraft) {
  const paymentMethod =
    initialDraft?.intent.kind === "sale" || initialDraft?.intent.kind === "expense"
      ? initialDraft.intent.paymentMethod
      : undefined;

  return (
    accounts.find((account) => account.type === paymentMethod)?.id ??
    accounts.find((account) => account.type === "cash")?.id ??
    accounts[0]?.id ??
    ""
  );
}

function buildInvoiceMessage({
  amount,
  customerName,
  dueAt,
  items,
  note,
  paidNow,
}: {
  amount: number;
  customerName: string;
  dueAt?: string;
  items: InvoiceMessageLine[];
  note?: string;
  paidNow: boolean;
}) {
  const lines = [
    `Hello ${customerName},`,
    `Your invoice total is ${formatNaira(amount)}.`,
    paidNow ? "Status: Paid." : "Status: Unpaid.",
  ];

  if (items.length > 0) {
    lines.push("Items:");
    lines.push(
      ...items.map(
        (item, index) =>
          `${index + 1}. ${item.name} x ${item.quantity} @ ${formatNaira(item.unitPrice)} = ${formatNaira(item.total)}`,
      ),
    );
  }

  if (!paidNow && dueAt) {
    lines.push(`Due date: ${formatInvoiceDate(dueAt)}.`);
  }

  if (note) {
    lines.push(`Details: ${note}.`);
  }

  lines.push("Thank you.");
  return lines.join("\n");
}

function openWhatsAppInvoice(phone: string, message: string, invoiceWindow?: Window | null) {
  const encodedMessage = encodeURIComponent(message);
  const normalizedPhone = normalizeWhatsAppPhone(phone);
  const url = buildWhatsAppInvoiceUrl(normalizedPhone, encodedMessage);

  if (invoiceWindow) {
    invoiceWindow.location.href = url;
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}

function buildWhatsAppInvoiceUrl(phone: string, encodedMessage: string) {
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  if (isMobile) {
    return phone
      ? `https://wa.me/${phone}?text=${encodedMessage}`
      : `https://wa.me/?text=${encodedMessage}`;
  }

  return phone
    ? `https://web.whatsapp.com/send?phone=${phone}&text=${encodedMessage}`
    : `https://web.whatsapp.com/send?text=${encodedMessage}`;
}

function normalizeWhatsAppPhone(phone: string) {
  const digits = phone.replace(/[^\d]/g, "");

  if (/^0[789][01]\d{8}$/.test(digits)) {
    return `234${digits.slice(1)}`;
  }

  if (/^234[789][01]\d{8}$/.test(digits)) {
    return digits;
  }

  if (/^[789][01]\d{8}$/.test(digits)) {
    return `234${digits}`;
  }

  return "";
}

function formatInvoiceDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function getElapsedSeconds(startedAt: number) {
  return Math.round((Date.now() - startedAt) / 1000);
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
