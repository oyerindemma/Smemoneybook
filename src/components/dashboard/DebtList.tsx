"use client";

import { EmptyState } from "@/components/dashboard/EmptyState";
import { HandCoins, MessageCircle, ReceiptText, Smartphone, X } from "lucide-react";
import { useState } from "react";
import type { Account, Debt } from "@/components/dashboard/types";
import { formatNaira } from "@/lib/bookkeeping/transaction-engine";

export function DebtList({
  accounts,
  debts,
  onCollect,
  onSettleSupplier,
  onRemind,
  onSendInvoice,
  onSendPaymentConfirmation,
  onUpgradePrompt,
  onRecord,
}: {
  accounts: Account[];
  debts: Debt[];
  onCollect: (debtId: string, accountId: string, amount?: number) => void;
  onSettleSupplier: (debtId: string, accountId: string, amount?: number) => void;
  onRemind: (debtId: string, channel: "manual" | "whatsapp" | "sms") => Promise<void>;
  onSendInvoice: (debtId: string) => Promise<void>;
  onSendPaymentConfirmation: (debtId: string, amount?: number) => Promise<void>;
  onUpgradePrompt?: (prompt: { title: string; description: string }) => void;
  onRecord?: () => void;
}) {
  const customerDebts = debts.filter((debt) => debt.type === "customer_owes_business");
  const supplierDebts = debts.filter((debt) => debt.type === "business_owes_supplier");

  return (
    <section className="rounded-2xl bg-card p-6 shadow-sm border border-gray-100 transition-shadow duration-200 md:hover:shadow-md md:p-7">
      <div>
        <p className="text-xs text-textSecondary md:text-sm">People control</p>
        <h2 className="text-xl font-semibold tracking-tight md:text-2xl">Customers and suppliers</h2>
      </div>

      <div className="mt-6 grid gap-6">
        <DebtGroup
          accounts={accounts}
          debts={customerDebts}
          emptyTitle="No one owes you yet"
          emptyDescription="Record a sale where the customer will pay later."
          title="Customers owing"
          actionLabel="Collect"
          tone="customer"
          onAction={onCollect}
          onRemind={onRemind}
          onSendInvoice={onSendInvoice}
          onSendPaymentConfirmation={onSendPaymentConfirmation}
          onUpgradePrompt={onUpgradePrompt}
          onRecord={onRecord}
        />
        <DebtGroup
          accounts={accounts}
          debts={supplierDebts}
          emptyTitle="No supplier bills yet"
          emptyDescription="Record what you will pay later."
          title="Supplier bills"
          actionLabel="Pay"
          tone="supplier"
          onAction={onSettleSupplier}
          onRemind={onRemind}
          onSendInvoice={onSendInvoice}
          onSendPaymentConfirmation={onSendPaymentConfirmation}
          onUpgradePrompt={onUpgradePrompt}
          onRecord={onRecord}
        />
      </div>
    </section>
  );
}

function DebtGroup({
  accounts,
  debts,
  title,
  emptyTitle,
  emptyDescription,
  actionLabel,
  tone,
  onAction,
  onRemind,
  onSendInvoice,
  onSendPaymentConfirmation,
  onUpgradePrompt,
  onRecord,
}: {
  accounts: Account[];
  debts: Debt[];
  title: string;
  emptyTitle: string;
  emptyDescription: string;
  actionLabel: string;
  tone: "customer" | "supplier";
  onAction: (debtId: string, accountId: string, amount?: number) => void;
  onRemind: (debtId: string, channel: "manual" | "whatsapp" | "sms") => Promise<void>;
  onSendInvoice: (debtId: string) => Promise<void>;
  onSendPaymentConfirmation: (debtId: string, amount?: number) => Promise<void>;
  onUpgradePrompt?: (prompt: { title: string; description: string }) => void;
  onRecord?: () => void;
}) {
  const defaultAccountId = accounts[0]?.id ?? "";
  const [selectedAccounts, setSelectedAccounts] = useState<Record<string, string>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busyAction, setBusyAction] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState<Debt | null>(null);
  const activeInvoice = selectedInvoice
    ? debts.find((debt) => debt.id === selectedInvoice.id) ?? selectedInvoice
    : null;

  function sendInvoice(debt: Debt, channel: "whatsapp" | "sms") {
    const message = buildInvoiceMessage(debt);
    const encodedMessage = encodeURIComponent(message);

    if (channel === "whatsapp") {
      const phone = cleanPhone(debt.partyPhone);
      window.open(
        phone
          ? `https://wa.me/${phone}?text=${encodedMessage}`
          : `https://wa.me/?text=${encodedMessage}`,
        "_blank",
        "noopener,noreferrer",
      );
      return;
    }

    window.open(`sms:${debt.partyPhone ?? ""}?&body=${encodedMessage}`, "_self");
  }

  async function runDebtAction(key: string, action: () => Promise<void>) {
    setBusyAction(key);
    try {
      await action();
    } finally {
      setBusyAction("");
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-background/60 p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">{title}</h3>
        <span className="rounded-full bg-background px-3 py-1 text-xs font-semibold text-textSecondary">
          {debts.length}
        </span>
      </div>

      <div className="mt-4 space-y-4">
        {debts.length === 0 ? (
          <EmptyState
            title={emptyTitle}
            description={emptyDescription}
            actionLabel={tone === "customer" ? "Record first sale" : undefined}
            onAction={tone === "customer" ? onRecord : undefined}
          />
        ) : (
          debts.map((debt) => {
            const selectedAccountId = selectedAccounts[debt.id] ?? defaultAccountId;
            const amount = amounts[debt.id] ? Number(amounts[debt.id]) : undefined;
            const isPaid = debt.status === "settled" || debt.remainingAmount <= 0;

            if (tone === "customer") {
              return (
                <div
                  key={debt.id}
                  className="grid gap-4 rounded-2xl border border-gray-100 bg-card p-5 shadow-sm transition hover:shadow-md"
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedInvoice(debt)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedInvoice(debt);
                    }
                  }}
                >
                  <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <ReceiptText className="text-primary" size={18} aria-hidden="true" />
                        <p className="truncate font-semibold text-textPrimary">{debt.partyName}</p>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            isPaid
                              ? "bg-success/10 text-success"
                              : "bg-accent/10 text-textPrimary"
                          }`}
                        >
                          {isPaid ? "Paid" : "Unpaid"}
                        </span>
                        {debt.isOverdue && !isPaid ? (
                          <span className="rounded-full bg-danger/10 px-2.5 py-1 text-xs font-semibold text-danger">
                            Overdue
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm text-textSecondary">
                        {getInvoiceNote(debt) || "Credit sale invoice"}
                      </p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-xs text-textMuted">Amount due</p>
                      <strong className="text-2xl text-textPrimary">
                        {formatNaira(debt.remainingAmount)}
                      </strong>
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-4">
                    <button
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-textPrimary hover:bg-background"
                      type="button"
                      disabled={Boolean(busyAction)}
                      onClick={(event) => {
                        event.stopPropagation();
                        void runDebtAction(`reminder-${debt.id}`, () =>
                          onRemind(debt.id, "whatsapp"),
                        );
                      }}
                    >
                      <MessageCircle size={16} aria-hidden="true" />
                      {busyAction === `reminder-${debt.id}`
                        ? "Sending..."
                        : "Send WhatsApp Reminder"}
                    </button>
                    <button
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-textPrimary hover:bg-background"
                      type="button"
                      disabled={Boolean(busyAction)}
                      onClick={(event) => {
                        event.stopPropagation();
                        void runDebtAction(`invoice-${debt.id}`, () => onSendInvoice(debt.id));
                      }}
                    >
                      <ReceiptText size={16} aria-hidden="true" />
                      {busyAction === `invoice-${debt.id}` ? "Sending..." : "Send invoice"}
                    </button>
                    <button
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-textPrimary hover:bg-background"
                      type="button"
                      disabled={Boolean(busyAction)}
                      onClick={(event) => {
                        event.stopPropagation();
                        void runDebtAction(`payment-${debt.id}`, () =>
                          onSendPaymentConfirmation(debt.id),
                        );
                      }}
                    >
                      <Smartphone size={16} aria-hidden="true" />
                      {busyAction === `payment-${debt.id}` ? "Sending..." : "Confirm payment"}
                    </button>
                    <button
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-success px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-success/90"
                      type="button"
                      disabled={Boolean(busyAction)}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedInvoice(debt);
                      }}
                    >
                      <HandCoins size={16} aria-hidden="true" />
                      Collect
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div key={debt.id} className="grid gap-4 rounded-2xl bg-card p-5 shadow-sm">
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium">{debt.partyName}</p>
                      {debt.isOverdue ? (
                        <span className="rounded-full bg-danger/10 px-2 py-1 text-xs font-semibold text-danger">
                          Overdue
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-textSecondary">
                      {debt.partyPhone ? `${debt.partyPhone} · ` : ""}
                      {debt.dueAt ? `Due ${formatDate(debt.dueAt)}` : "No due date"}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-xs text-textMuted">Remaining</p>
                    <strong>{formatNaira(debt.remainingAmount)}</strong>
                    {debt.paidAmount > 0 ? (
                      <p className="text-xs text-textMuted">
                        Paid {formatNaira(debt.paidAmount)}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-[1fr_1fr]">
                  <select
                    className="h-10 rounded-xl border border-gray-200 bg-card px-3 text-sm"
                    value={selectedAccountId}
                    onChange={(event) =>
                      setSelectedAccounts((current) => ({
                        ...current,
                        [debt.id]: event.target.value,
                      }))
                    }
                  >
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className="h-10 rounded-xl border border-gray-200 bg-card px-3 text-sm"
                    min="1"
                    placeholder={`Amount, max ${debt.remainingAmount}`}
                    type="number"
                    value={amounts[debt.id] ?? ""}
                    onChange={(event) =>
                      setAmounts((current) => ({
                        ...current,
                        [debt.id]: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="grid gap-2 sm:grid-cols-4">
                  <button
                    className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-textPrimary hover:bg-background"
                    type="button"
                    disabled={Boolean(busyAction)}
                    onClick={() =>
                      void runDebtAction(`note-${debt.id}`, () => onRemind(debt.id, "manual"))
                    }
                  >
                    {busyAction === `note-${debt.id}` ? "Saving..." : "Note reminder"}
                  </button>
                  <button
                    className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-textPrimary hover:bg-background"
                    type="button"
                    disabled={Boolean(busyAction)}
                    onClick={() =>
                      onUpgradePrompt
                        ? onUpgradePrompt({
                            title: "Unlock smart reminders",
                            description:
                              "Remind customers who owe you without doing it manually.",
                          })
                        : void runDebtAction(`reminder-${debt.id}`, () =>
                            onRemind(debt.id, "whatsapp"),
                          )
                    }
                  >
                    {busyAction === `reminder-${debt.id}` ? "Sending..." : "WhatsApp"}
                  </button>
                  <button
                    className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-textPrimary hover:bg-background"
                    type="button"
                    disabled={Boolean(busyAction)}
                    onClick={() =>
                      onUpgradePrompt
                        ? onUpgradePrompt({
                            title: "Unlock smart reminders",
                            description:
                              "Remind customers who owe you without doing it manually.",
                          })
                        : void runDebtAction(`sms-${debt.id}`, () => onRemind(debt.id, "sms"))
                    }
                  >
                    {busyAction === `sms-${debt.id}` ? "Saving..." : "SMS"}
                  </button>
                  <button
                    className="rounded-xl bg-danger px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-danger/90"
                    type="button"
                    disabled={Boolean(busyAction)}
                    onClick={() => onAction(debt.id, selectedAccountId, amount)}
                  >
                    {actionLabel}
                  </button>
                </div>

                {debt.events.length > 0 ? (
                  <div className="space-y-1 border-t border-gray-200 pt-2">
                    {debt.events.slice(0, 3).map((event) => (
                      <p key={event.id} className="text-xs text-textSecondary">
                        {formatEvent(event.type)}{" "}
                        {event.amount ? formatNaira(event.amount) : ""}
                        {event.channel ? ` via ${event.channel}` : ""} ·{" "}
                        {formatDate(event.createdAt)}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {activeInvoice && tone === "customer" ? (
        <InvoiceModal
          accounts={accounts}
          debt={activeInvoice}
          selectedAccountId={selectedAccounts[activeInvoice.id] ?? defaultAccountId}
          amountValue={amounts[activeInvoice.id] ?? ""}
          onAccountChange={(accountId) =>
            setSelectedAccounts((current) => ({
              ...current,
              [activeInvoice.id]: accountId,
            }))
          }
          onAmountChange={(amount) =>
            setAmounts((current) => ({
              ...current,
              [activeInvoice.id]: amount,
            }))
          }
          onClose={() => setSelectedInvoice(null)}
          onCollect={() => {
            const selectedAccountId = selectedAccounts[activeInvoice.id] ?? defaultAccountId;
            const amount = amounts[activeInvoice.id]
              ? Number(amounts[activeInvoice.id])
              : undefined;
            onAction(activeInvoice.id, selectedAccountId, amount);
            setSelectedInvoice(null);
          }}
          onSend={sendInvoice}
          onSendCloudInvoice={() =>
            runDebtAction(`invoice-${activeInvoice.id}`, () => onSendInvoice(activeInvoice.id))
          }
          onSendPaymentConfirmation={() =>
            runDebtAction(`payment-${activeInvoice.id}`, () =>
              onSendPaymentConfirmation(
                activeInvoice.id,
                amounts[activeInvoice.id] ? Number(amounts[activeInvoice.id]) : undefined,
              ),
            )
          }
          busyAction={busyAction}
        />
      ) : null}
    </div>
  );
}

function InvoiceModal({
  accounts,
  debt,
  selectedAccountId,
  amountValue,
  onAccountChange,
  onAmountChange,
  onClose,
  onCollect,
  onSend,
  onSendCloudInvoice,
  onSendPaymentConfirmation,
  busyAction,
}: {
  accounts: Account[];
  debt: Debt;
  selectedAccountId: string;
  amountValue: string;
  onAccountChange: (accountId: string) => void;
  onAmountChange: (amount: string) => void;
  onClose: () => void;
  onCollect: () => void;
  onSend: (debt: Debt, channel: "whatsapp" | "sms") => void;
  onSendCloudInvoice: () => void;
  onSendPaymentConfirmation: () => void;
  busyAction: string;
}) {
  const isPaid = debt.status === "settled" || debt.remainingAmount <= 0;
  const note = getInvoiceNote(debt);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-textPrimary/40 p-4 sm:items-center">
      <section className="w-full rounded-2xl border border-gray-100 bg-card p-6 shadow-lg sm:mx-auto sm:max-w-lg sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-textSecondary">Invoice</p>
            <h3 className="mt-1 text-lg font-semibold text-textPrimary">{debt.partyName}</h3>
          </div>
          <button
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-textSecondary hover:bg-background"
            type="button"
            onClick={onClose}
            aria-label="Close invoice"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-6 grid gap-4 rounded-2xl bg-background p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-textSecondary">Amount</span>
            <strong className="text-3xl text-textPrimary">{formatNaira(debt.remainingAmount)}</strong>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-textSecondary">Status</span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                isPaid ? "bg-success/10 text-success" : "bg-accent/10 text-textPrimary"
              }`}
            >
              {isPaid ? "Paid" : "Unpaid"}
            </span>
          </div>
          <div>
            <p className="text-sm text-textSecondary">Note</p>
            <p className="mt-1 text-sm font-medium text-textPrimary">
              {note || "No invoice note added."}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-textPrimary hover:bg-background"
            type="button"
            disabled={Boolean(busyAction)}
            onClick={onSendCloudInvoice}
          >
            <MessageCircle size={16} aria-hidden="true" />
            {busyAction === `invoice-${debt.id}` ? "Sending..." : "Send via WhatsApp"}
          </button>
          <button
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-textPrimary hover:bg-background"
            type="button"
            disabled={Boolean(busyAction)}
            onClick={() => onSend(debt, "sms")}
          >
            <Smartphone size={16} aria-hidden="true" />
            Send via SMS
          </button>
        </div>

        <div className="mt-6 grid gap-3 rounded-2xl border border-gray-100 bg-card p-4 shadow-sm">
          <p className="text-sm font-semibold text-textPrimary">Collect payment</p>
          <input
            className="h-12 rounded-xl border border-gray-200 px-4"
            min="1"
            placeholder={`Amount, max ${debt.remainingAmount}`}
            type="number"
            value={amountValue}
            onChange={(event) => onAmountChange(event.target.value)}
          />
          <select
            className="h-12 rounded-xl border border-gray-200 bg-card px-4"
            value={selectedAccountId}
            onChange={(event) => onAccountChange(event.target.value)}
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
          <button
            className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primaryHover disabled:bg-textMuted"
            type="button"
            disabled={!selectedAccountId || isPaid || Boolean(busyAction)}
            onClick={onCollect}
          >
            Confirm collection
          </button>
          <button
            className="rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-textPrimary shadow-sm hover:bg-background disabled:opacity-50"
            type="button"
            disabled={Boolean(busyAction)}
            onClick={onSendPaymentConfirmation}
          >
            {busyAction === `payment-${debt.id}` ? "Sending..." : "Confirm payment on WhatsApp"}
          </button>
        </div>
      </section>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatEvent(type: Debt["events"][number]["type"]) {
  return {
    reminder: "Reminder",
    customer_collection: "Collected",
    supplier_settlement: "Paid",
    note: "Note",
  }[type];
}

function getInvoiceNote(debt: Debt) {
  const note = debt.events.find((event) => event.type === "note" && event.note)?.note;
  return note && !["Money in", "First money in"].includes(note) ? note : "";
}

function buildInvoiceMessage(debt: Debt) {
  const note = getInvoiceNote(debt);
  return `Hello ${debt.partyName}, you owe ${formatNaira(debt.remainingAmount)}.${note ? ` ${note}` : ""}`;
}

function cleanPhone(phone?: string) {
  return phone?.replace(/[^\d]/g, "");
}
