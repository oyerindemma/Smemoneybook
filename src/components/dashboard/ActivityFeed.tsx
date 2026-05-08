import { EmptyState } from "@/components/dashboard/EmptyState";
import { ListSkeleton } from "@/components/dashboard/Skeleton";
import type { Transaction } from "@/components/dashboard/types";
import { formatNaira } from "@/lib/bookkeeping/transaction-engine";

export function ActivityFeed({
  transactions,
  onReverse,
  canReverse = true,
  isLoading = false,
  onRecord,
}: {
  transactions: Transaction[];
  onReverse: (transactionId: string) => void;
  canReverse?: boolean;
  isLoading?: boolean;
  onRecord?: () => void;
}) {
  return (
    <section className="rounded-2xl bg-card p-6 shadow-sm border border-gray-100 transition-shadow duration-200 md:hover:shadow-md md:p-7">
      <div>
        <p className="text-xs text-textSecondary md:text-sm">Latest records</p>
        <h2 className="text-xl font-semibold tracking-tight md:text-2xl">Activity</h2>
      </div>

      <div className="mt-6 divide-y divide-gray-100">
        {isLoading ? (
          <ListSkeleton rows={4} />
        ) : transactions.length === 0 ? (
          <EmptyState
            title="No activity yet"
            description="Record your first sale to start tracking profit automatically."
            actionLabel="Record first sale"
            onAction={onRecord}
          />
        ) : (
          transactions.slice(0, 8).map((transaction) => {
            const title = transaction.description ?? "Activity";

            return (
              <div
                key={transaction.id}
                className="grid grid-cols-[1fr_auto] gap-4 py-5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold md:text-base">{title}</p>
                  <p className="mt-1 text-xs text-textMuted md:text-sm">
                    {describeTransaction(transaction)}
                  </p>
                </div>
                <div className="text-right">
                  <strong
                    className={`tabular-nums ${
                      transaction.type === "sale"
                        ? "text-success"
                        : transaction.type === "transfer" || transaction.type === "adjustment"
                          ? "text-textSecondary"
                          : "text-danger"
                    }`}
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
                      className="mt-1 block text-xs font-semibold text-textMuted transition-colors hover:text-danger"
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
    return transaction.reversedByTransactionId ? "Transfer reversed" : "Moved between money places";
  }

  if (type === "ADJUSTMENT") {
    return "Correction entry";
  }

  return "Activity";
}
