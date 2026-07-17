"use client";

import Link from "next/link";

export function FeatureUnavailablePanel({
  title,
  description,
  billingLink = true,
}: {
  title: string;
  description: string;
  billingLink?: boolean;
}) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-card p-6 shadow-sm">
      <p className="text-xs font-medium text-textSecondary">Unavailable</p>
      <h2 className="mt-1 text-base font-semibold text-textPrimary">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-textSecondary">{description}</p>
      {billingLink ? (
        <Link
          className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-primary px-5 text-sm font-semibold text-white"
          href="/more/billing"
        >
          Upgrade plan
        </Link>
      ) : null}
    </section>
  );
}
