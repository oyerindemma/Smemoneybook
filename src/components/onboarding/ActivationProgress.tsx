export function ActivationProgress({
  activityCount,
  onRecord,
}: {
  activityCount: number;
  onRecord: () => void;
}) {
  const progress = Math.min(activityCount, 3);

  if (progress >= 3) {
    return null;
  }

  return (
    <section className="rounded-2xl bg-card p-4 shadow-sm border border-gray-100 transition hover:shadow-md sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-textSecondary">Activation path</p>
          <h2 className="mt-1 text-base font-semibold leading-6">
            Record 3 money activities to unlock your first business pattern.
          </h2>
          <p className="mt-1 text-sm leading-5 text-textSecondary">
            First sale, first expense, then one more record. That is enough to start seeing useful signals.
          </p>
        </div>
        <strong className="rounded-full bg-background px-3 py-1 text-sm">
          {progress}/3
        </strong>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-background">
        <div
          className="h-full rounded-full bg-success"
          style={{ width: `${(progress / 3) * 100}%` }}
        />
      </div>
      <button
        className="mt-4 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primaryHover"
        type="button"
        onClick={onRecord}
      >
        Add next record
      </button>
    </section>
  );
}
