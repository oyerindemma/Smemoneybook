import type { Account } from "@/components/dashboard/types";
import { formatNaira } from "@/lib/bookkeeping/transaction-engine";

const accountOrder = ["cash", "bank", "pos"];

export function AccountsList({ accounts }: { accounts: Account[] }) {
  const visibleAccounts = [...accounts].sort(
    (first, second) =>
      accountOrder.indexOf(first.type) - accountOrder.indexOf(second.type),
  );

  return (
    <section className="rounded-xl bg-white p-4 shadow-soft sm:p-6">
      <p className="text-sm text-black/55">Simple view</p>
      <h2 className="text-xl font-semibold">Where your money is</h2>

      <div className="mt-4 divide-y divide-black/10">
        {visibleAccounts.map((account) => (
          <div key={account.id} className="flex items-center justify-between gap-4 py-4">
            <p className="font-medium">{account.name}</p>
            <strong className="text-right">{formatNaira(account.balance)}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
