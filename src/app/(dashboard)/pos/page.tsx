"use client";

import { FastPos } from "@/components/pos/FastPos";
import { useDashboard } from "@/components/dashboard/DashboardProvider";
import { phase1FeatureFlags } from "@/lib/phase1/feature-flags";

export default function PosPage() {
  const { state } = useDashboard();

  if (!phase1FeatureFlags.pos) {
    return (
      <main className="space-y-6 md:space-y-8">
        <header>
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">POS unavailable</h1>
          <p className="mt-1 text-sm text-textSecondary md:text-base">
            POS is turned off for this rollout.
          </p>
        </header>
      </main>
    );
  }

  return (
    <main className="space-y-8 md:space-y-10">
      <header>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">POS</h1>
        <p className="mt-1 text-sm text-textSecondary md:text-base">
          Search, scan, split payment, and print a receipt.
        </p>
      </header>
      <FastPos
        items={state.items}
        accounts={state.accounts}
        businessName={state.businessName}
        receiptConfig={state.receiptConfig}
      />
    </main>
  );
}
