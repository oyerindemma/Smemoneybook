"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { OperationsPanel } from "@/components/dashboard/OperationsPanel";
import { PaidTierPanel } from "@/components/dashboard/PaidTierPanel";
import { useDashboard } from "@/components/dashboard/DashboardProvider";

export default function MorePage() {
  const { state, setNotice } = useDashboard();
  const router = useRouter();
  const [billingLive, setBillingLive] = useState(false);

  useEffect(() => {
    let mounted = true;

    fetch("/api/billing/status", { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as {
          billingLive?: boolean;
        } | null;

        if (mounted) {
          setBillingLive(Boolean(response.ok && payload?.billingLive));
        }
      })
      .catch(() => {
        if (mounted) {
          setBillingLive(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  async function signOut() {
    const response = await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });

    localStorage.removeItem("selectedBusinessId");

    if (!response.ok) {
      setNotice("Could not sign out right now.");
      return;
    }

    router.replace("/");
  }

  return (
    <main className="space-y-8 md:space-y-10">
      <header>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">More</h1>
        <p className="mt-1 text-sm text-textSecondary md:text-base">Advanced tools stay out of your daily flow.</p>
      </header>
      <section className="rounded-2xl border border-gray-100 bg-card p-6 shadow-sm">
        <p className="text-xs font-medium text-textSecondary">Staff access</p>
        <h2 className="mt-1 text-base font-semibold text-textPrimary">
          {roleLabel(state.businessRole)}
        </h2>
        <p className="mt-2 text-sm text-textSecondary">{roleDescription(state.businessRole)}</p>
      </section>
      <Link
        className="flex min-h-14 items-center justify-between rounded-2xl bg-card px-6 py-5 text-base font-semibold shadow-sm border border-gray-100 transition-all duration-150 hover:shadow-md active:scale-[0.99]"
        href="/reports"
      >
        Reports
        <span className="text-sm text-textMuted">View</span>
      </Link>
      <Link
        className="flex min-h-14 items-center justify-between rounded-2xl bg-card px-6 py-5 text-base font-semibold shadow-sm border border-gray-100 transition-all duration-150 hover:shadow-md active:scale-[0.99]"
        href="/assistant"
      >
        AI Assistant
        <span className="text-sm text-success">Enabled</span>
      </Link>
      <Link
        className="flex min-h-14 items-center justify-between rounded-2xl bg-card px-6 py-5 text-base font-semibold shadow-sm border border-gray-100 transition-all duration-150 hover:shadow-md active:scale-[0.99]"
        href="/more/automation"
      >
        Automations
        <span className="text-sm text-textMuted">Disabled</span>
      </Link>
      <Link
        className="flex min-h-14 items-center justify-between rounded-2xl bg-card px-6 py-5 text-base font-semibold shadow-sm border border-gray-100 transition-all duration-150 hover:shadow-md active:scale-[0.99]"
        href="/legal"
      >
        Legal
        <span className="text-sm text-textMuted">Policies</span>
      </Link>
      <section className="rounded-2xl border border-gray-100 bg-card p-6 shadow-sm">
        <h2 className="text-base font-semibold">Legal & account</h2>
        <div className="mt-4 grid gap-3 text-sm font-medium text-textPrimary">
          <Link className="flex min-h-11 items-center justify-between rounded-xl bg-background px-4 py-3 transition hover:shadow-sm active:scale-[0.99]" href="/legal/privacy-policy">
            Privacy Policy
            <span className="text-xs text-textMuted">Open</span>
          </Link>
          <Link className="flex min-h-11 items-center justify-between rounded-xl bg-background px-4 py-3 transition hover:shadow-sm active:scale-[0.99]" href="/legal/terms-of-service">
            Terms of Service
            <span className="text-xs text-textMuted">Open</span>
          </Link>
          <Link className="flex min-h-11 items-center justify-between rounded-xl bg-background px-4 py-3 transition hover:shadow-sm active:scale-[0.99]" href="/legal/financial-disclaimer">
            Financial Disclaimer
            <span className="text-xs text-textMuted">Open</span>
          </Link>
          <Link className="flex min-h-11 items-center justify-between rounded-xl bg-background px-4 py-3 transition hover:shadow-sm active:scale-[0.99]" href="/legal/data-security">
            Data Security
            <span className="text-xs text-textMuted">Open</span>
          </Link>
          <Link className="flex min-h-11 items-center justify-between rounded-xl bg-background px-4 py-3 transition hover:shadow-sm active:scale-[0.99]" href="/more/delete-account">
            Delete account
            <span className="text-xs text-textMuted">Request</span>
          </Link>
        </div>
      </section>
      {billingLive ? (
        <Link
          className="flex min-h-14 items-center justify-between rounded-2xl bg-card px-6 py-5 text-base font-semibold shadow-sm border border-gray-100 transition-all duration-150 hover:shadow-md active:scale-[0.99]"
          href="/more/billing"
        >
          Billing settings
          <span className="text-sm text-textMuted">Manage</span>
        </Link>
      ) : null}
      <PaidTierPanel businessId={state.businessId} onNotice={setNotice} />
      <OperationsPanel businessId={state.businessId} onNotice={setNotice} />
      <button
        className="min-h-14 w-full rounded-2xl border border-danger/20 bg-card px-6 py-4 text-left text-sm font-semibold text-danger shadow-sm transition-all duration-150 hover:shadow-md active:scale-[0.99]"
        type="button"
        onClick={signOut}
      >
        Sign out
      </button>
    </main>
  );
}

function roleLabel(role?: "owner" | "accountant" | "staff") {
  return {
    owner: "Owner",
    staff: "Staff",
    accountant: "Accountant",
  }[role ?? "owner"];
}

function roleDescription(role?: "owner" | "accountant" | "staff") {
  return {
    owner: "Full access to money, stock, people, and reports.",
    staff: "Sales access only.",
    accountant: "Reports access only.",
  }[role ?? "owner"];
}
