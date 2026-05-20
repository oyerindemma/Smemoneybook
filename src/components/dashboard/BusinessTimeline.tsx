import { Clock3 } from "lucide-react";
import type { MoneybookState } from "@/lib/bookkeeping/transaction-engine";
import { formatNaira } from "@/lib/bookkeeping/transaction-engine";

export function BusinessTimeline({ state }: { state: MoneybookState }) {
  const activities = [
    ...state.transactions.map((transaction) => ({
      id: transaction.id,
      createdAt: transaction.occurredAt,
      label:
        transaction.type === "sale"
          ? transaction.paymentStatus === "paid"
            ? "Invoice paid"
            : "Unpaid invoice recorded"
          : transaction.type === "expense"
            ? "Expense recorded"
            : transaction.type === "transfer"
              ? "Money moved"
              : "Activity corrected",
      helper: `${transaction.description} - ${formatNaira(transaction.amount)}`,
    })),
    ...state.items.flatMap((item) =>
      item.movements.map((movement) => ({
        id: movement.id,
        createdAt: movement.createdAt,
        label: movement.type === "stock_out" ? "Stock reduced" : "Stock updated",
        helper: `${item.name} - ${movement.quantity}`,
      })),
    ),
    ...state.debts.flatMap((debt) =>
      debt.events.map((event) => ({
        id: event.id,
        createdAt: event.createdAt,
        label: event.type === "reminder" ? "Reminder sent" : "Debt activity",
        helper: `${debt.partyName}${event.amount ? ` - ${formatNaira(event.amount)}` : ""}`,
      })),
    ),
  ]
    .sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt))
    .slice(0, 12);

  return (
    <section className="rounded-2xl border border-gray-100 bg-card p-5 shadow-sm md:p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Clock3 size={20} aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs font-medium text-textSecondary">Business timeline</p>
          <h2 className="text-lg font-semibold tracking-tight text-textPrimary">Latest activity</h2>
        </div>
      </div>

      <div className="mt-5 grid gap-3">
        {activities.length === 0 ? (
          <div className="rounded-2xl bg-background p-4 text-sm text-textSecondary">
            Your latest business activity will show here.
          </div>
        ) : (
          activities.map((activity) => (
            <div key={activity.id} className="rounded-2xl bg-background p-4">
              <p className="text-sm font-semibold text-textPrimary">{activity.label}</p>
              <p className="mt-1 text-sm text-textSecondary">{activity.helper}</p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
