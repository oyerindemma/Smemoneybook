"use client";

import { ErrorMessage } from "@/components/dashboard/ErrorMessage";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4 text-textPrimary">
      <section className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-sm border border-gray-100 transition hover:shadow-md sm:p-7">
        <ErrorMessage />
        <button
          className="mt-5 w-full rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primaryHover"
          type="button"
          onClick={reset}
        >
          Reload
        </button>
      </section>
    </main>
  );
}
