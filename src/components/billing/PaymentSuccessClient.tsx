"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type VerifyState =
  | { status: "checking"; message: string }
  | { status: "success"; message: string; plan?: string }
  | { status: "error"; message: string };

export function PaymentSuccessClient() {
  const [state, setState] = useState<VerifyState>({
    status: "checking",
    message: "Verifying your payment...",
  });

  useEffect(() => {
    const reference = new URLSearchParams(window.location.search).get("reference");

    if (!reference) {
      queueMicrotask(() => {
        setState({ status: "error", message: "Payment reference is missing." });
      });
      return;
    }

    fetch(`/api/paystack/verify?reference=${encodeURIComponent(reference)}`, {
      credentials: "include",
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
          error?: string;
          plan?: { name?: string };
        } | null;

        if (!response.ok) {
          throw new Error(payload?.error ?? "Payment verification failed.");
        }

        setState({
          status: "success",
          message: payload?.message ?? "Subscription activated.",
          plan: payload?.plan?.name,
        });
      })
      .catch((error: unknown) => {
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Payment verification failed.",
        });
      });
  }, []);

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-textPrimary">
      <section className="mx-auto max-w-md rounded-2xl border border-gray-100 bg-card p-6 shadow-sm">
        <p className="text-sm font-medium text-textSecondary">SME Moneybook billing</p>
        <h1 className="mt-2 text-2xl font-semibold">
          {state.status === "success" ? "Payment verified" : state.status === "error" ? "Verification needed" : "Checking payment"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-textSecondary">{state.message}</p>
        {state.status === "success" ? (
          <p className="mt-4 rounded-xl bg-success/10 px-4 py-3 text-sm font-semibold text-success">
            {state.plan ?? "Your plan"} is active for the next billing period.
          </p>
        ) : null}
        <Link
          className="mt-6 flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white transition-all duration-150 hover:bg-primaryHover active:scale-[0.98]"
          href="/money"
        >
          Return to dashboard
        </Link>
      </section>
    </main>
  );
}
