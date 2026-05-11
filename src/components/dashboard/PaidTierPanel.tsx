"use client";

import { FileText, Sparkles, Upload } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { billingPlans, getPlanFeatureDetails, type BillingPlanId } from "@/lib/billing/plans";

export function PaidTierPanel({
  businessId,
  onNotice,
}: {
  businessId?: string;
  onNotice: (message: string) => void;
}) {
  const [receiptResult, setReceiptResult] = useState("");
  const [suggestion, setSuggestion] = useState("");
  const [loadingPlan, setLoadingPlan] = useState<BillingPlanId | null>(null);
  const [billingLive, setBillingLive] = useState(false);
  const [isCheckingBilling, setIsCheckingBilling] = useState(true);

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
      })
      .finally(() => {
        if (mounted) {
          setIsCheckingBilling(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  async function suggestCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/assist/categorize", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessId,
        description: form.get("description"),
        type: form.get("type"),
      }),
    });
    const payload = (await response.json().catch(() => null)) as {
      suggestion?: { category: string; confidence: number; reason: string };
      error?: string;
    } | null;

    if (response.ok && payload?.suggestion) {
      setSuggestion(`${payload.suggestion.category} (${Math.round(payload.suggestion.confidence * 100)}%)`);
      onNotice(payload.suggestion.reason);
      return;
    }

    onNotice(payload?.error ?? "Could not suggest a category.");
  }

  async function extractReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/receipts", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessId,
        fileName: form.get("fileName"),
        text: form.get("text"),
      }),
    });
    const payload = (await response.json().catch(() => null)) as {
      receipt?: { vendor?: string; amount?: number; category?: string };
      error?: string;
    } | null;

    if (response.ok && payload?.receipt) {
      setReceiptResult(
        `${payload.receipt.vendor ?? "Receipt"} · ${payload.receipt.category ?? "Uncategorized"} · ₦${payload.receipt.amount ?? 0}`,
      );
      onNotice("Receipt extracted and saved for review.");
      return;
    }

    onNotice(payload?.error ?? "Could not extract this receipt.");
  }

  async function startBilling(plan: BillingPlanId) {
    if (!businessId || loadingPlan) {
      return;
    }

    setLoadingPlan(plan);
    onNotice("Redirecting to secure payment...");

    try {
      const response = await fetch("/api/paystack/initialize", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, plan }),
      });
      const payload = (await response.json().catch(() => null)) as {
        authorization_url?: string;
        message?: string;
        error?: string;
      } | null;

      if (!response.ok || !payload?.authorization_url) {
        throw new Error(payload?.error ?? "Could not start secure payment.");
      }

      window.location.assign(payload.authorization_url);
    } catch (error) {
      setLoadingPlan(null);
      onNotice(error instanceof Error ? error.message : "Could not start secure payment.");
    }
  }

  return (
    <section className="rounded-2xl bg-card p-6 shadow-sm border border-gray-100 transition hover:shadow-md sm:p-7">
      <div>
        <p className="text-sm text-textSecondary">Paid tier toolkit</p>
        <h2 className="text-lg font-semibold">Growth features</h2>
      </div>

      {!billingLive ? (
        <div className="mt-6 rounded-2xl border border-gray-200 bg-background p-5">
          <p className="text-sm font-semibold text-textPrimary">
            {isCheckingBilling ? "Checking billing availability..." : "Paid features are not available yet."}
          </p>
          <p className="mt-2 text-sm leading-6 text-textSecondary">
            Upgrade and paid tools will appear here once secure payment is fully configured.
          </p>
        </div>
      ) : (
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <form className="rounded-2xl border border-gray-200 p-5" onSubmit={suggestCategory}>
          <div className="flex items-center gap-2">
            <Sparkles size={18} aria-hidden="true" />
            <h3 className="font-semibold">AI category assist</h3>
          </div>
          <input
            className="mt-3 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm"
            name="description"
            placeholder="fuel for delivery"
            required
          />
          <select className="mt-2 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" name="type" defaultValue="expense">
            <option value="expense">Money out</option>
            <option value="sale">Sale</option>
            <option value="transfer">Transfer</option>
          </select>
          <button className="mt-4 w-full rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primaryHover" type="submit">
            Suggest
          </button>
          {suggestion ? <p className="mt-2 text-sm text-textSecondary">{suggestion}</p> : null}
        </form>

        <form className="rounded-2xl border border-gray-200 p-5" onSubmit={extractReceipt}>
          <div className="flex items-center gap-2">
            <Upload size={18} aria-hidden="true" />
            <h3 className="font-semibold">Receipt extraction</h3>
          </div>
          <input className="mt-3 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" name="fileName" placeholder="receipt.txt" required />
          <textarea className="mt-2 min-h-24 w-full rounded-xl border border-gray-200 p-3 text-sm" name="text" placeholder="Paste receipt text for extraction" />
          <button className="mt-4 w-full rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primaryHover" type="submit">
            Extract
          </button>
          {receiptResult ? <p className="mt-2 text-sm text-textSecondary">{receiptResult}</p> : null}
        </form>

        <div className="rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center gap-2">
            <FileText size={18} aria-hidden="true" />
            <h3 className="font-semibold">Plans and exports</h3>
          </div>
          <div className="mt-4 grid gap-3">
            {billingPlans.map((plan) => (
              <button
                className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-left text-sm transition-all duration-150 hover:bg-background active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
                disabled={Boolean(loadingPlan)}
                key={plan.id}
                type="button"
                onClick={() => startBilling(plan.id)}
              >
                <span className="flex items-start justify-between gap-3">
                  <span>
                    <span className="block font-semibold text-textPrimary">{plan.name}</span>
                    <span className="mt-1 block text-xs leading-5 text-textSecondary">{plan.tagline}</span>
                  </span>
                  <span className="shrink-0 font-semibold text-primary">
                    {loadingPlan === plan.id ? "..." : `₦${plan.amount.toLocaleString()}`}
                  </span>
                </span>
                <span className="mt-3 block text-xs leading-5 text-textMuted">
                  {getPlanFeatureDetails(plan).map((feature) => feature.name).join(" · ")}
                </span>
              </button>
            ))}
            <a
              className="flex items-center justify-center rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-textPrimary hover:bg-background"
              href={`/api/accountant/export${businessId ? `?businessId=${encodeURIComponent(businessId)}` : ""}`}
            >
              Accountant export
            </a>
          </div>
        </div>
      </div>
      )}
    </section>
  );
}
