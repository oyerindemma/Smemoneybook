"use client";

import { useEffect, useState } from "react";
import { billingPlans, type BillingPlanId } from "@/lib/billing/plans";
import { useDashboard } from "@/components/dashboard/DashboardProvider";

type BillingOverview = {
  currentPlan: null | {
    id: string;
    name: string;
    status: string;
    paidAt: string | null;
    currentPeriodEnd: string | null;
  };
  history: {
    id: string;
    reference: string | null;
    plan: string;
    status: string;
    amount: number;
    paidAt: string | null;
    createdAt: string;
  }[];
};

export function BillingSettings() {
  const { state, setNotice } = useDashboard();
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingPlan, setLoadingPlan] = useState<BillingPlanId | null>(null);
  const [billingLive, setBillingLive] = useState(false);

  useEffect(() => {
    if (!state.businessId) {
      return;
    }

    const businessId = state.businessId;

    fetch("/api/billing/status", { credentials: "include", cache: "no-store" })
      .then(async (statusResponse) => {
        const statusPayload = (await statusResponse.json().catch(() => null)) as {
          billingLive?: boolean;
        } | null;
        const isLive = Boolean(statusResponse.ok && statusPayload?.billingLive);

        setBillingLive(isLive);

        if (!isLive) {
          return null;
        }

        const response = await fetch(`/api/paystack/subscription?businessId=${encodeURIComponent(businessId)}`, {
          credentials: "include",
        });
        const payload = (await response.json().catch(() => null)) as BillingOverview | { error?: string } | null;

        if (!response.ok) {
          throw new Error((payload as { error?: string } | null)?.error ?? "Could not load billing.");
        }

        return payload as BillingOverview;
      })
      .then((payload) => {
        if (payload) {
          setOverview(payload);
        }
      })
      .catch((error: unknown) => setNotice(error instanceof Error ? error.message : "Could not load billing."))
      .finally(() => setLoading(false));
  }, [setNotice, state.businessId]);

  async function upgrade(plan: BillingPlanId) {
    if (!state.businessId || loadingPlan) {
      return;
    }

    setLoadingPlan(plan);
    setNotice("Redirecting to secure payment...");

    try {
      const response = await fetch("/api/paystack/initialize", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: state.businessId, plan }),
      });
      const payload = (await response.json().catch(() => null)) as { authorization_url?: string; error?: string } | null;

      if (!response.ok || !payload?.authorization_url) {
        throw new Error(payload?.error ?? "Could not start payment.");
      }

      window.location.assign(payload.authorization_url);
    } catch (error) {
      setLoadingPlan(null);
      setNotice(error instanceof Error ? error.message : "Could not start payment.");
    }
  }

  return (
    <main className="space-y-8">
      <header>
        <p className="text-sm text-textSecondary">Billing</p>
        <h1 className="text-2xl font-semibold">Plan and payments</h1>
      </header>

      <section className="rounded-2xl border border-gray-100 bg-card p-6 shadow-sm">
        <p className="text-sm text-textSecondary">Current plan</p>
        {loading ? (
          <div className="mt-4 h-20 animate-pulse rounded-xl bg-textMuted/20" />
        ) : overview?.currentPlan ? (
          <div className="mt-3">
            <h2 className="text-2xl font-bold">{overview.currentPlan.name}</h2>
            <p className="mt-1 text-sm text-textSecondary">
              {overview.currentPlan.status} · renews{" "}
              {overview.currentPlan.currentPeriodEnd
                ? new Date(overview.currentPlan.currentPeriodEnd).toLocaleDateString()
                : "after this period"}
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-textSecondary">No active paid plan yet.</p>
        )}
        <p className="mt-4 text-xs leading-5 text-textMuted">
          Payments are securely processed by third-party payment processors. Payments may be processed by Paystack. SME MoneyBook does not store full card details.
        </p>
      </section>

      {!billingLive && !loading ? (
        <section className="rounded-2xl border border-gray-100 bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Billing is not available yet</h2>
          <p className="mt-2 text-sm leading-6 text-textSecondary">
            Upgrade buttons are hidden until secure payment is fully configured.
          </p>
        </section>
      ) : null}

      {billingLive ? (
      <section className="grid gap-3">
        {billingPlans.map((plan) => (
          <button
            className="flex min-h-11 items-center justify-between rounded-2xl border border-gray-100 bg-card p-5 text-left shadow-sm transition-all duration-150 hover:shadow-md active:scale-[0.99] disabled:opacity-70"
            disabled={Boolean(loadingPlan)}
            key={plan.id}
            type="button"
            onClick={() => upgrade(plan.id)}
          >
            <span>
              <span className="block font-semibold">{plan.name}</span>
              <span className="text-sm text-textSecondary">₦{plan.amount.toLocaleString()} monthly</span>
            </span>
            <span className="text-sm font-semibold text-primary">
              {loadingPlan === plan.id ? "Redirecting..." : "Upgrade"}
            </span>
          </button>
        ))}
      </section>
      ) : null}

      <section className="rounded-2xl border border-gray-100 bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Billing history</h2>
        <div className="mt-4 space-y-3">
          {overview?.history.length ? (
            overview.history.map((item) => (
              <div className="rounded-xl bg-background p-4" key={item.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{item.plan}</p>
                  <p className="text-sm font-semibold text-success">₦{item.amount.toLocaleString()}</p>
                </div>
                <p className="mt-1 text-xs text-textMuted">
                  {item.status} · {item.paidAt ? new Date(item.paidAt).toLocaleDateString() : "not paid yet"}
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm text-textSecondary">Payments will appear here after Paystack confirms them.</p>
          )}
        </div>
      </section>
    </main>
  );
}
