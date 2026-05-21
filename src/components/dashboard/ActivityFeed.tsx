import { EmptyState } from "@/components/dashboard/EmptyState";
import { ListSkeleton } from "@/components/dashboard/Skeleton";
import type { Transaction } from "@/components/dashboard/types";
import { formatNaira } from "@/lib/bookkeeping/transaction-engine";
import type { Debt } from "@/lib/bookkeeping/transaction-engine";

export function ActivityFeed({
  transactions,
  debts = [],
  onReverse,
  canReverse = true,
  isLoading = false,
  onRecord,
}: {
  transactions: Transaction[];
  debts?: Debt[];
  onReverse: (transactionId: string) => void;
  canReverse?: boolean;
  isLoading?: boolean;
  onRecord?: () => void;
}) {
  const pulseItems = buildPulseItems(transactions, debts);

  return (
    <section className="rounded-2xl bg-card p-4 shadow-sm border border-gray-100 transition-shadow duration-200 md:hover:shadow-md md:p-5">
      <div>
        <p className="text-xs text-textSecondary md:text-sm">Latest records</p>
        <h2 className="text-xl font-semibold tracking-tight md:text-2xl">Business pulse</h2>
      </div>

      {pulseItems.length > 0 ? (
        <div className="mt-4 grid gap-2">
          {pulseItems.map((item) => (
            <div
              key={item}
              className="rounded-xl bg-background px-3.5 py-3 text-sm font-medium leading-5 text-textPrimary"
            >
              {item}
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-4 divide-y divide-gray-100">
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
                className="grid grid-cols-[1fr_auto] gap-3 py-3.5"
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
                      Undo
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

    return "Customer payment";
  }

  if (type === "EXPENSE") {
    if (transaction.reversedByTransactionId) {
      return "Reversed";
    }

    return transaction.category ? `${transaction.category} expense` : "Business expense";
  }

  if (type === "TRANSFER") {
    return transaction.reversedByTransactionId ? "Move undone" : "Moved between cash and bank";
  }

  if (type === "ADJUSTMENT") {
    return "Correction";
  }

  return "Activity";
}

function buildPulseItems(transactions: Transaction[], debts: Debt[]) {
  const activeTransactions = transactions.filter(
    (transaction) => !transaction.reversedByTransactionId,
  );
  const openCustomerDebts = debts.filter(
    (debt) =>
      debt.type === "customer_owes_business" &&
      debt.status === "open" &&
      debt.remainingAmount > 0,
  );
  const customerDebtTotal = openCustomerDebts.reduce(
    (sum, debt) => sum + debt.remainingAmount,
    0,
  );
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayExpenses = activeTransactions
    .filter((transaction) => transaction.type === "expense" && transaction.occurredAt.slice(0, 10) === todayKey)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const todaySales = activeTransactions
    .filter((transaction) => transaction.type === "sale" && transaction.occurredAt.slice(0, 10) === todayKey)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const strongestDay = getStrongestSalesDay(activeTransactions);

  return [
    openCustomerDebts.length > 0
      ? `${openCustomerDebts.length} customer${openCustomerDebts.length === 1 ? "" : "s"} owe you ${formatNaira(customerDebtTotal)}.`
      : null,
    todayExpenses > todaySales && todayExpenses > 0
      ? `Expenses are higher than sales today by ${formatNaira(todayExpenses - todaySales)}.`
      : null,
    strongestDay ? `${strongestDay} is your strongest sales day so far.` : null,
  ].filter((item): item is string => Boolean(item)).slice(0, 3);
}

function getStrongestSalesDay(transactions: Transaction[]) {
  const totals = new Map<string, number>();
  const formatter = new Intl.DateTimeFormat("en-NG", { weekday: "long" });

  for (const transaction of transactions) {
    if (transaction.type !== "sale") {
      continue;
    }

    const day = formatter.format(new Date(transaction.occurredAt));
    totals.set(day, (totals.get(day) ?? 0) + transaction.amount);
  }

  return Array.from(totals.entries()).sort((first, second) => second[1] - first[1])[0]?.[0];
}
