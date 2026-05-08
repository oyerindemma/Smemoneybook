import type { Debt } from "@/components/dashboard/types";

export function RetentionNudge({
  hasActivityToday,
  debts,
  onRecord,
  onViewDebts,
}: {
  hasActivityToday: boolean;
  debts: Debt[];
  onRecord: () => void;
  onViewDebts: () => void;
}) {
  const hasCustomerDebt = debts.some((debt) => debt.type === "customer_owes_business");

  if (!hasActivityToday) {
    return (
      <NudgeCard
        text="You haven’t recorded today’s money yet."
        actionLabel="Record now"
        onAction={onRecord}
      />
    );
  }

  if (hasCustomerDebt) {
    return (
      <NudgeCard
        text="Someone still owes you money."
        actionLabel="View people to collect from"
        onAction={onViewDebts}
      />
    );
  }

  return <NudgeCard text="You’re up to date for today." />;
}

function NudgeCard({
  text,
  actionLabel,
  onAction,
}: {
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <section className="rounded-2xl bg-card p-6 shadow-sm border border-gray-100 transition hover:shadow-md sm:p-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold text-textSecondary">{text}</p>
        {actionLabel && onAction ? (
          <button
            className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primaryHover"
            type="button"
            onClick={onAction}
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </section>
  );
}
