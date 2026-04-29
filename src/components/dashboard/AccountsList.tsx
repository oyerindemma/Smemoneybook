import type { Account } from "@/components/dashboard/types";
import { formatNaira } from "@/lib/bookkeeping/transaction-engine";
import { FormEvent } from "react";

const accountOrder = ["cash", "bank", "pos", "mobile_money"];

export function AccountsList({
  accounts,
  onCreate,
}: {
  accounts: Account[];
  onCreate: (input: {
    name: string;
    type: Account["type"];
    openingBalance: number;
  }) => void;
}) {
  const visibleAccounts = [...accounts].sort(
    (first, second) => getAccountOrder(first.type) - getAccountOrder(second.type),
  );

  return (
    <section className="rounded-xl bg-white p-4 shadow-soft sm:p-6">
      <p className="text-sm text-black/55">Simple view</p>
      <h2 className="text-xl font-semibold">Where your money is</h2>

      <div className="mt-4 divide-y divide-black/10">
        {visibleAccounts.map((account) => (
          <div key={account.id} className="flex items-center justify-between gap-4 py-4">
            <div>
              <p className="font-medium">{account.name}</p>
              <p className="mt-1 text-xs text-black/45">
                Opened with {formatNaira(account.openingBalance)}
              </p>
            </div>
            <strong className="text-right">{formatNaira(account.balance)}</strong>
          </div>
        ))}
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
    <form className="mt-5 grid gap-3 rounded-xl bg-[#F5F3EF] p-3" onSubmit={submit}>
      <p className="text-sm font-semibold">Add account</p>
      <input
        className="h-11 rounded-xl border border-black/10 px-3 text-sm"
        name="name"
        placeholder="e.g. Opay wallet"
        required
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <select
          className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm"
          name="type"
          defaultValue="bank"
        >
          <option value="cash">Cash</option>
          <option value="bank">Bank</option>
          <option value="pos">POS</option>
          <option value="mobile_money">Mobile money</option>
        </select>
        <input
          className="h-11 rounded-xl border border-black/10 px-3 text-sm"
          min="0"
          name="openingBalance"
          placeholder="Opening balance"
          type="number"
        />
      </div>
      <button className="h-11 rounded-xl bg-ink text-sm font-semibold text-white" type="submit">
        Add account
      </button>
    </form>
  );
}
