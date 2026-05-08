"use client";

import dynamic from "next/dynamic";
import Link from "next/link";

const AuthHomeClientOnly = dynamic(
  () => import("@/components/auth/AuthHome").then((mod) => mod.AuthHome),
  {
    ssr: false,
    loading: () => <AuthHomeFallback />,
  },
);

export function AuthHomeNoSsr() {
  return <AuthHomeClientOnly />;
}

function AuthHomeFallback() {
  return (
    <main className="flex min-h-screen items-center bg-background p-4 text-textPrimary">
      <section className="mx-auto w-full max-w-md rounded-2xl border border-gray-100 bg-card p-6 shadow-sm sm:p-7">
        <div className="mb-5">
          <p className="text-sm text-textSecondary">SME Moneybook</p>
          <h1 className="mt-2 text-2xl font-semibold">Track your money daily</h1>
          <p className="mt-2 text-sm leading-6 text-textSecondary">Opening sign-in...</p>
        </div>

        <div className="rounded-2xl bg-background p-5 text-sm font-medium text-textSecondary">
          Loading...
        </div>

        <PolicyLinks />
      </section>
    </main>
  );
}

function PolicyLinks() {
  return (
    <div className="mt-7 border-t border-gray-100 pt-5 text-sm text-textSecondary">
      <p>By continuing, you agree to SME MoneyBook policies.</p>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-3 font-semibold text-primary">
        <Link href="/legal/privacy-policy">Privacy Policy</Link>
        <Link href="/legal/terms-of-service">Terms</Link>
        <Link href="/legal/data-security">Data Security</Link>
        <Link href="/legal/refund-policy">Refund Policy</Link>
        <Link href="/legal/financial-disclaimer">Financial Disclaimer</Link>
      </div>
    </div>
  );
}
