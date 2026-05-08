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
    <section className="rounded-2xl bg-card p-6 shadow-sm border border-gray-100 transition hover:shadow-md sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-textSecondary">Your setup progress</p>
          <h2 className="mt-1 text-lg font-semibold">
            Record 3 money activities to understand your business better.
          </h2>
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
        className="mt-5 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primaryHover"
        type="button"
        onClick={onRecord}
      >
        Record money
      </button>
    </section>
  );
}
