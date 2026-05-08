"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type {
  Account,
  CaptureFormData,
  InventoryItem,
  QuickAction,
} from "@/components/dashboard/types";
import type { PaymentStatus } from "@/lib/bookkeeping/transaction-engine";
import { formatNaira } from "@/lib/bookkeeping/transaction-engine";

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
  items,
  activeAction,
  lastUsedAccountId,
  onActionSelect,
  onSubmit,
}: {
  accounts: Account[];
  items: InventoryItem[];
  activeAction: QuickAction | null;
  lastUsedAccountId: string;
  onActionSelect: (action: QuickAction) => void;
  onSubmit: (formData: CaptureFormData) => Promise<void> | void;
}) {
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("paid");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [itemQuantity, setItemQuantity] = useState(1);
  const [amountInput, setAmountInput] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [generateInvoice, setGenerateInvoice] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeAction) {
      amountRef.current?.focus();
    }
  }, [activeAction]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAmountTouched(true);

    if (amountError) {
      return;
    }

    const form = new FormData(event.currentTarget);
    const note = String(form.get("note") || "").trim();
    const partyName = String(form.get("partyName") || "").trim();
    const invoiceNote = String(form.get("invoiceNote") || "").trim();
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
    const inventoryItemId = String(form.get("inventoryItemId") || "").trim();
    const inventoryQuantity = Number(form.get("inventoryQuantity") || 0);
    const selectedItem = items.find((item) => item.id === inventoryItemId);
    const isCustomerCredit = type === "sale" && paymentStatus === "credit";
    const description =
      (isCustomerCredit ? invoiceNote : note) ||
      (type === "sale"
        ? "Money in"
        : type === "transfer"
          ? "Money transfer"
          : "Money out");
    const itemSaleAmount =
      type === "sale" && selectedItem && inventoryQuantity > 0
        ? selectedItem.sellingPrice * inventoryQuantity
        : amount;

    setIsSaving(true);
    try {
      await onSubmit({
        type,
        amount: itemSaleAmount,
        accountId: String(form.get("accountId")),
        destinationAccountId:
          type === "transfer" ? String(form.get("destinationAccountId")) : undefined,
        description,
        category: category || undefined,
        paymentStatus: type === "transfer" ? "paid" : paymentStatus,
        partyName:
          type === "transfer" || paymentStatus === "paid"
            ? undefined
            : partyName || note || undefined,
        partyPhone: partyPhone || undefined,
        inventoryItemId: inventoryItemId || undefined,
        inventoryQuantity:
          inventoryItemId && inventoryQuantity > 0 ? inventoryQuantity : undefined,
        occurredAt: occurredAt || undefined,
        dueAt: dueAt || undefined,
      });

      event.currentTarget.reset();
      setAmountInput("");
      setAmountTouched(false);
      setPaymentStatus("paid");
      setSelectedItemId("");
      setItemQuantity(1);
      setGenerateInvoice(true);
      amountRef.current?.focus();
    } finally {
      setIsSaving(false);
    }
  }

  const isMoneyIn = activeAction === "sale";
  const isTransfer = activeAction === "transfer";
  const isCustomerCredit = isMoneyIn && paymentStatus === "credit";
  const selectedItem = items.find((item) => item.id === selectedItemId);
  const hasProductTotal = Boolean(selectedItem && itemQuantity > 0);
  const amountNumber = Number(amountInput);
  const amountError =
    hasProductTotal
      ? ""
      : amountInput.trim() === ""
        ? "Enter an amount"
        : !Number.isFinite(amountNumber) || amountNumber <= 0
          ? "Enter a valid amount"
          : "";
  const defaultDestinationAccountId =
    accounts.find((account) => account.id !== lastUsedAccountId)?.id ?? accounts[0]?.id;
  const handleActionSelect = (action: QuickAction) => {
    setPaymentStatus("paid");
    setAmountTouched(false);
    setGenerateInvoice(true);
    onActionSelect(action);
  };

  return (
    <section className="rounded-2xl bg-card p-6 shadow-sm border border-gray-100 transition hover:shadow-md sm:p-7">
      <div className="grid gap-3 sm:grid-cols-3">
        <button
          className={`rounded-xl px-5 py-3 text-base font-semibold shadow-sm ${
            activeAction === "sale"
              ? "bg-success text-white"
              : "border border-gray-200 bg-white text-textPrimary hover:bg-background"
          }`}
          type="button"
          onClick={() => handleActionSelect("sale")}
        >
          + I got money
        </button>
        <button
          className={`rounded-xl px-5 py-3 text-base font-semibold shadow-sm ${
            activeAction === "expense"
              ? "bg-danger text-white"
              : "border border-gray-200 bg-white text-textPrimary hover:bg-background"
          }`}
          type="button"
          onClick={() => handleActionSelect("expense")}
        >
          - I spent money
        </button>
        <button
          className={`rounded-xl px-5 py-3 text-base font-semibold shadow-sm ${
            activeAction === "transfer"
              ? "bg-primary text-white hover:bg-primaryHover"
              : "border border-gray-200 bg-white text-textPrimary hover:bg-background"
          }`}
          type="button"
          onClick={() => handleActionSelect("transfer")}
        >
          Move money
        </button>
      </div>

      {activeAction ? (
        <form className="mt-5 grid gap-6" onSubmit={submit}>
          <label className="grid gap-2 text-sm font-medium">
            Amount
            <input
              ref={amountRef}
              className={`h-14 rounded-xl border px-4 text-lg font-semibold focus:focus-ring ${
                amountTouched && amountError ? "border-danger" : "border-gray-200"
              }`}
              name="amount"
              type="number"
              min="1"
              inputMode="numeric"
              value={amountInput}
              onBlur={() => setAmountTouched(true)}
              onChange={(event) => setAmountInput(event.target.value)}
              placeholder={
                selectedItem
                  ? String(selectedItem.sellingPrice * Math.max(itemQuantity, 1))
                  : "25000"
              }
              required={!selectedItem}
            />
            {amountTouched && amountError ? (
              <p className="text-xs text-danger mt-1">{amountError}</p>
            ) : null}
          </label>

          {isMoneyIn && items.length > 0 ? (
            <div className="grid gap-3 rounded-xl bg-background p-3 sm:grid-cols-[1fr_120px]">
              <label className="grid gap-2 text-sm font-medium">
                Product sold
                <select
                  className="h-12 rounded-xl border border-gray-200 bg-card px-3 focus:focus-ring"
                  name="inventoryItemId"
                  value={selectedItemId}
                  onChange={(event) => setSelectedItemId(event.target.value)}
                >
                  <option value="">No product</option>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.quantityOnHand} left)
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Qty
                <input
                  className="h-12 rounded-xl border border-gray-200 px-3 focus:focus-ring"
                  min="1"
                  name="inventoryQuantity"
                  type="number"
                  value={itemQuantity}
                  onChange={(event) => setItemQuantity(Number(event.target.value))}
                />
              </label>
              {selectedItem ? (
                <p className="text-sm text-textSecondary sm:col-span-2">
                  Sale total {formatProductTotal(selectedItem.sellingPrice, itemQuantity)}
                </p>
              ) : null}
            </div>
          ) : null}

          <label className="grid gap-2 text-sm font-medium">
            {isTransfer ? "From" : "Where is the money?"}
            <select
              className="h-14 rounded-xl border border-gray-200 bg-card px-4 focus:focus-ring"
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
              To
              <select
                className="h-14 rounded-xl border border-gray-200 bg-card px-4 focus:focus-ring"
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
              className="h-14 rounded-xl border border-gray-200 px-4 focus:focus-ring"
              name="occurredAt"
              type="date"
            />
          </label>

          {activeAction === "expense" ? (
            <label className="grid gap-2 text-sm font-medium">
              Category
              <select
                className="h-14 rounded-xl border border-gray-200 bg-card px-4 focus:focus-ring"
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

          {activeAction === "sale" ? (
            <label className="grid gap-2 text-sm font-medium">
              VAT type
              <select
                className="h-14 rounded-xl border border-gray-200 bg-card px-4 focus:focus-ring"
                name="category"
                defaultValue="Taxable sale"
              >
                <option value="Taxable sale">Taxable sale</option>
                <option value="Non-taxable sale">Non-taxable sale</option>
              </select>
            </label>
          ) : null}

          {!isTransfer ? (
          <div className="grid gap-2 rounded-xl bg-background p-3">
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
          ) : null}

          {!isTransfer && paymentStatus !== "paid" ? (
            <div className="grid gap-4 rounded-2xl border border-gray-100 bg-background/70 p-4">
              {isCustomerCredit ? (
                <label className="flex items-center justify-between gap-3 rounded-xl bg-card px-4 py-3 text-sm font-medium shadow-sm">
                  <span>Generate invoice</span>
                  <input
                    checked={generateInvoice}
                    className="h-5 w-5 rounded border-gray-200 text-primary focus:focus-ring"
                    type="checkbox"
                    onChange={(event) => setGenerateInvoice(event.target.checked)}
                  />
                </label>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium">
                  {isCustomerCredit ? "Customer name" : "Supplier name"}
                  <input
                    className="h-14 rounded-xl border border-gray-200 px-4 focus:focus-ring"
                    name="partyName"
                    placeholder={isCustomerCredit ? "e.g. Amina Stores" : "e.g. supplier name"}
                    required
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium">
                  Phone
                  <input
                    className="h-14 rounded-xl border border-gray-200 px-4 focus:focus-ring"
                    name="partyPhone"
                    placeholder="Optional"
                    type="tel"
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium">
                  Due date
                  <input
                    className="h-14 rounded-xl border border-gray-200 px-4 focus:focus-ring"
                    name="dueAt"
                    type="date"
                  />
                </label>
                {isCustomerCredit ? (
                  <label className="grid gap-2 text-sm font-medium">
                    Invoice note
                    <input
                      className="h-14 rounded-xl border border-gray-200 px-4 focus:focus-ring"
                      name="invoiceNote"
                      placeholder="Optional, e.g. bags of rice"
                    />
                  </label>
                ) : (
                  <label className="grid gap-2 text-sm font-medium">
                    Note
                    <input
                      className="h-14 rounded-xl border border-gray-200 px-4 focus:focus-ring"
                      name="note"
                      placeholder="Optional, e.g. stock balance"
                    />
                  </label>
                )}
              </div>
            </div>
          ) : (
            <label className="grid gap-2 text-sm font-medium">
              Note
              <input
                className="h-14 rounded-xl border border-gray-200 px-4 focus:focus-ring"
                name="note"
                placeholder={
                  isMoneyIn
                    ? "Optional, e.g. morning sale"
                    : isTransfer
                      ? "Optional, e.g. POS settlement"
                      : "Optional, e.g. fuel"
                }
              />
            </label>
          )}

          <div className="sticky bottom-20 z-20 -mx-6 bg-card/95 px-6 py-4 sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:py-0">
            <button
              className="w-full rounded-xl bg-primary px-5 py-4 text-base font-semibold text-white shadow-sm hover:bg-primaryHover disabled:cursor-not-allowed disabled:bg-textMuted"
              type="submit"
              disabled={Boolean(amountError) || isSaving}
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function formatProductTotal(price: number, quantity: number) {
  return formatNaira(price * Math.max(quantity || 1, 1));
}
