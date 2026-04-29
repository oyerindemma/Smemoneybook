import type { Transaction } from "@/components/dashboard/types";
import { formatNaira } from "@/lib/bookkeeping/transaction-engine";

export function ActivityFeed({ transactions }: { transactions: Transaction[] }) {
  return (
    <section className="rounded-xl bg-white p-4 shadow-soft sm:p-6">
      <div>
        <p className="text-sm text-black/55">Latest records</p>
        <h2 className="text-xl font-semibold">Activity</h2>
      </div>

      <div className="mt-4 divide-y divide-black/10">
        {transactions.length === 0 ? (
          <p className="rounded-xl bg-[#F5F3EF] p-4 text-sm text-black/60">
            Nothing recorded yet.
          </p>
        ) : (
          transactions.slice(0, 8).map((transaction) => {
            const title = transaction.description ?? "Activity";

            return (
              <div
                key={transaction.id}
                className="grid grid-cols-[1fr_auto] gap-3 py-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{title}</p>
                  <p className="mt-1 text-sm text-black/50">
                    {describeTransaction(transaction)}
                  </p>
                </div>
                <strong
                  className={
                    transaction.type === "sale"
                      ? "text-right text-palm"
                      : "text-right text-red-600"
                  }
                >
                  {transaction.type === "sale" ? "+" : "-"}
                  {formatNaira(transaction.amount)}
                </strong>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

export function describeTransaction(transaction: Transaction) {
  const type = transaction.type.toUpperCase();
  const paymentMethod = transaction.paymentStatus.toUpperCase();

  if (type === "SALE") {
    if (paymentMethod === "CREDIT") {
      return "Customer will pay later";
    }

    return "Money received";
  }

  if (type === "EXPENSE") {
    return "Money spent";
  }

  return "Activity";
}
