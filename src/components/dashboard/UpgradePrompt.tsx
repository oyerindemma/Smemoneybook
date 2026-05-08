"use client";

export function UpgradePrompt({
  title,
  description,
  onClose,
  onUpgrade,
}: {
  title: string;
  description: string;
  onClose: () => void;
  onUpgrade: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-textPrimary/40 p-4 sm:items-center sm:justify-center">
      <section className="w-full rounded-2xl bg-card p-6 shadow-lg border border-gray-100 transition hover:shadow-xl sm:max-w-sm sm:p-7">
        <p className="text-sm font-semibold text-success">₦3,000/month</p>
        <h2 className="mt-2 text-lg font-semibold">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-textSecondary">{description}</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            className="rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-textPrimary hover:bg-background"
            type="button"
            onClick={onClose}
          >
            Not now
          </button>
          <button
            className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primaryHover"
            type="button"
            onClick={onUpgrade}
          >
            Upgrade
          </button>
        </div>
      </section>
    </div>
  );
}
