"use client";

import { useState } from "react";
import type { Account, Debt } from "@/components/dashboard/types";
import { formatNaira } from "@/lib/bookkeeping/transaction-engine";

export function DebtList({
  accounts,
  debts,
  onCollect,
  onSettleSupplier,
  onRemind,
}: {
  accounts: Account[];
  debts: Debt[];
  onCollect: (debtId: string, accountId: string, amount?: number) => void;
  onSettleSupplier: (debtId: string, accountId: string, amount?: number) => void;
  onRemind: (debtId: string, channel: "manual" | "whatsapp" | "sms") => void;
}) {
  const customerDebts = debts.filter((debt) => debt.type === "customer_owes_business");
  const supplierDebts = debts.filter((debt) => debt.type === "business_owes_supplier");

  return (
    <section className="rounded-xl bg-white p-4 shadow-soft sm:p-6">
      <div>
        <p className="text-sm text-black/55">People control</p>
        <h2 className="text-xl font-semibold">Customers and suppliers</h2>
      </div>

      <div className="mt-4 grid gap-4">
        <DebtGroup
          accounts={accounts}
          debts={customerDebts}
          emptyText="Nobody to collect from right now."
          title="Customers owing"
          actionLabel="Collect"
          tone="customer"
          onAction={onCollect}
          onRemind={onRemind}
        />
        <DebtGroup
          accounts={accounts}
          debts={supplierDebts}
          emptyText="No open supplier bills right now."
          title="Supplier bills"
          actionLabel="Pay"
          tone="supplier"
          onAction={onSettleSupplier}
          onRemind={onRemind}
        />
      </div>
    </section>
  );
}

function DebtGroup({
  accounts,
  debts,
  title,
  emptyText,
  actionLabel,
  tone,
  onAction,
  onRemind,
}: {
  accounts: Account[];
  debts: Debt[];
  title: string;
  emptyText: string;
  actionLabel: string;
  tone: "customer" | "supplier";
  onAction: (debtId: string, accountId: string, amount?: number) => void;
  onRemind: (debtId: string, channel: "manual" | "whatsapp" | "sms") => void;
}) {
  const defaultAccountId = accounts[0]?.id ?? "";
  const [selectedAccounts, setSelectedAccounts] = useState<Record<string, string>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  return (
    <div className="rounded-xl border border-black/10 p-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">{title}</h3>
        <span className="rounded-full bg-[#F5F3EF] px-3 py-1 text-xs font-semibold text-black/55">
          {debts.length}
        </span>
      </div>

      <div className="mt-3 space-y-3">
        {debts.length === 0 ? (
          <p className="rounded-xl bg-[#F5F3EF] p-4 text-sm text-black/60">
            {emptyText}
          </p>
        ) : (
          debts.map((debt) => {
            const selectedAccountId = selectedAccounts[debt.id] ?? defaultAccountId;
            const amount = amounts[debt.id] ? Number(amounts[debt.id]) : undefined;

            return (
              <div key={debt.id} className="grid gap-3 rounded-xl bg-[#F5F3EF] p-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium">{debt.partyName}</p>
                      {debt.isOverdue ? (
                        <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
                          Overdue
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-black/55">
                      {debt.partyPhone ? `${debt.partyPhone} · ` : ""}
                      {debt.dueAt ? `Due ${formatDate(debt.dueAt)}` : "No due date"}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-xs text-black/50">Remaining</p>
                    <strong>{formatNaira(debt.remainingAmount)}</strong>
                    {debt.paidAmount > 0 ? (
                      <p className="text-xs text-black/50">
                        Paid {formatNaira(debt.paidAmount)}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-[1fr_1fr]">
                  <select
                    className="h-10 rounded-xl border border-black/10 bg-white px-3 text-sm"
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
                    className="h-10 rounded-xl border border-black/10 bg-white px-3 text-sm"
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
                    className="h-10 rounded-xl bg-white px-3 text-sm font-semibold text-black/70"
                    type="button"
                    onClick={() => onRemind(debt.id, "manual")}
                  >
                    Note reminder
                  </button>
                  <button
                    className="h-10 rounded-xl bg-white px-3 text-sm font-semibold text-black/70"
                    type="button"
                    onClick={() => onRemind(debt.id, "whatsapp")}
                  >
                    WhatsApp
                  </button>
                  <button
                    className="h-10 rounded-xl bg-white px-3 text-sm font-semibold text-black/70"
                    type="button"
                    onClick={() => onRemind(debt.id, "sms")}
                  >
                    SMS
                  </button>
                  <button
                    className={`h-10 rounded-xl px-3 text-sm font-semibold text-white ${
                      tone === "customer" ? "bg-palm" : "bg-red-600"
                    }`}
                    type="button"
                    onClick={() => onAction(debt.id, selectedAccountId, amount)}
                  >
                    {actionLabel}
                  </button>
                </div>

                {debt.events.length > 0 ? (
                  <div className="space-y-1 border-t border-black/10 pt-2">
                    {debt.events.slice(0, 3).map((event) => (
                      <p key={event.id} className="text-xs text-black/55">
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
