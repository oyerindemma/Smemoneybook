import type { Transaction } from "@/components/dashboard/types";
import { formatNaira } from "@/lib/bookkeeping/transaction-engine";

export function ActivityFeed({
  transactions,
  onReverse,
  canReverse = true,
}: {
  transactions: Transaction[];
  onReverse: (transactionId: string) => void;
  canReverse?: boolean;
}) {
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
                <div className="text-right">
                  <strong
                    className={
                      transaction.type === "sale"
                        ? "text-palm"
                        : transaction.type === "transfer" || transaction.type === "adjustment"
                          ? "text-lagoon"
                          : "text-red-600"
                    }
                  >
                    {transaction.type === "sale"
                      ? "+"
                      : transaction.type === "expense"
                        ? "-"
                        : ""}
                    {formatNaira(transaction.amount)}
                  </strong>
                  {canReverse && !transaction.isReversal && !transaction.reversedByTransactionId ? (
                    <button
                      className="mt-1 block text-xs font-semibold text-black/45 hover:text-red-600"
                      type="button"
                      onClick={() => onReverse(transaction.id)}
                    >
                      Reverse
                    </button>
                  ) : null}
                </div>
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
    if (transaction.reversedByTransactionId) {
      return "Reversed";
    }

    if (paymentMethod === "CREDIT") {
      return "Customer will pay later";
    }

    return "Money received";
  }

  if (type === "EXPENSE") {
    if (transaction.reversedByTransactionId) {
      return "Reversed";
    }

    return "Money spent";
  }

  if (type === "TRANSFER") {
    return transaction.reversedByTransactionId ? "Transfer reversed" : "Moved between accounts";
  }

  if (type === "ADJUSTMENT") {
    return "Correction entry";
  }

  return "Activity";
}
