"use client";

import { useState } from "react";
import type { Account, Debt } from "@/components/dashboard/types";
import { formatNaira } from "@/lib/bookkeeping/transaction-engine";

export function DebtList({
  accounts,
  debts,
  onCollect,
  onRemind,
}: {
  accounts: Account[];
  debts: Debt[];
  onCollect: (debtId: string, accountId: string) => void;
  onRemind: (debtId: string) => void;
}) {
  const peopleToCollectFrom = debts.filter(
    (debt) => debt.type === "customer_owes_business",
  );
  const defaultAccountId = accounts[0]?.id ?? "";
  const [selectedAccounts, setSelectedAccounts] = useState<Record<string, string>>(
    {},
  );

  return (
    <section className="rounded-xl bg-white p-4 shadow-soft sm:p-6">
      <p className="text-sm text-black/55">Follow up</p>
      <h2 className="text-xl font-semibold">People to collect from</h2>

      <div className="mt-4 space-y-3">
        {peopleToCollectFrom.length === 0 ? (
          <p className="rounded-xl bg-[#F5F3EF] p-4 text-sm text-black/60">
            Nobody to collect from right now.
          </p>
        ) : (
          peopleToCollectFrom.slice(0, 5).map((debt) => {
            const selectedAccountId = selectedAccounts[debt.id] ?? defaultAccountId;

            return (
              <div
                key={debt.id}
                className="grid gap-3 rounded-xl border border-black/10 p-3 sm:grid-cols-[1fr_auto]"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{debt.partyName}</p>
                  <p className="text-sm text-black/55">{formatNaira(debt.amount)}</p>
                </div>
                <div className="grid gap-2 sm:min-w-64">
                  <label className="sr-only" htmlFor={`collect-account-${debt.id}`}>
                    Where the collected money entered
                  </label>
                  <select
                    className="h-10 rounded-xl border border-black/10 bg-white px-3 text-sm"
                    id={`collect-account-${debt.id}`}
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
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      className="h-10 rounded-xl bg-[#F5F3EF] px-3 text-sm font-semibold text-black/70"
                      type="button"
                      onClick={() => onRemind(debt.id)}
                    >
                      Remind
                    </button>
                    <button
                      className="h-10 rounded-xl bg-palm px-3 text-sm font-semibold text-white"
                      type="button"
                      onClick={() => onCollect(debt.id, selectedAccountId)}
                    >
                      Collected
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
