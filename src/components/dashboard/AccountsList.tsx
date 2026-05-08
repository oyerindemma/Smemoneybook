import { EmptyState } from "@/components/dashboard/EmptyState";
import { ListSkeleton } from "@/components/dashboard/Skeleton";
import type { Account } from "@/components/dashboard/types";
import { formatNaira } from "@/lib/bookkeeping/transaction-engine";
import { FormEvent } from "react";

const accountOrder = ["cash", "bank", "pos", "mobile_money"];

export function AccountsList({
  accounts,
  onCreate,
  isLoading = false,
}: {
  accounts: Account[];
  onCreate: (input: {
    name: string;
    type: Account["type"];
    openingBalance: number;
  }) => void;
  isLoading?: boolean;
}) {
  const visibleAccounts = [...accounts].sort(
    (first, second) => getAccountOrder(first.type) - getAccountOrder(second.type),
  );

  return (
    <section className="rounded-2xl bg-card p-6 shadow-sm border border-gray-100 transition hover:shadow-md sm:p-7">
      <p className="text-sm text-textSecondary">Simple view</p>
      <h2 className="text-lg font-semibold">Where your money is</h2>

      <div className="mt-6 divide-y divide-gray-100">
        {isLoading ? (
          <ListSkeleton rows={3} />
        ) : visibleAccounts.length === 0 ? (
          <EmptyState
            title="No money places yet"
            description="Add cash, bank, POS, or wallet"
          />
        ) : (
          visibleAccounts.map((account) => (
            <div key={account.id} className="flex items-center justify-between gap-4 py-4">
              <div>
                <p className="font-medium">{account.name}</p>
                <p className="mt-1 text-xs text-textMuted">
                  Opened with {formatNaira(account.openingBalance)}
                </p>
              </div>
              <strong className="text-right">{formatNaira(account.balance)}</strong>
            </div>
          ))
        )}
      </div>

      <CreateAccountForm onCreate={onCreate} />
    </section>
  );
}

function getAccountOrder(type: Account["type"]) {
  const index = accountOrder.indexOf(type);
  return index === -1 ? accountOrder.length : index;
}

function CreateAccountForm({
  onCreate,
}: {
  onCreate: (input: {
    name: string;
    type: Account["type"];
    openingBalance: number;
  }) => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    onCreate({
      name: String(form.get("name") || ""),
      type: String(form.get("type") || "bank") as Account["type"],
      openingBalance: Number(form.get("openingBalance") || 0),
    });

    event.currentTarget.reset();
  }

  return (
    <form className="mt-6 grid gap-4 rounded-2xl bg-background p-5" onSubmit={submit}>
      <p className="text-sm font-semibold">Add money place</p>
      <input
        className="h-11 rounded-xl border border-gray-200 px-3 text-sm"
        name="name"
        placeholder="e.g. Opay wallet"
        required
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <select
          className="h-11 rounded-xl border border-gray-200 bg-card px-3 text-sm"
          name="type"
          defaultValue="bank"
        >
          <option value="cash">Cash</option>
          <option value="bank">Bank</option>
          <option value="pos">POS</option>
          <option value="mobile_money">Mobile money</option>
        </select>
        <input
          className="h-11 rounded-xl border border-gray-200 px-3 text-sm"
          min="0"
          name="openingBalance"
          placeholder="Opening balance"
          type="number"
        />
      </div>
      <button className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primaryHover" type="submit">
        Add place
      </button>
    </form>
  );
}
