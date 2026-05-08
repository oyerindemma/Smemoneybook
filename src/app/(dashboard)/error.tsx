"use client";

export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-[60vh] items-center justify-center">
      <section className="w-full max-w-md rounded-2xl border border-gray-100 bg-card p-6 text-center shadow-sm">
        <p className="text-sm text-textSecondary">SME Moneybook</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight md:text-2xl">Something went wrong.</h1>
        <p className="mt-3 text-sm leading-6 text-textSecondary">
          Check your internet and try again.
        </p>
        <button
          className="mt-6 min-h-11 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-primaryHover hover:shadow-md active:scale-[0.98]"
          type="button"
          onClick={reset}
        >
          Reload
        </button>
      </section>
    </main>
  );
}
