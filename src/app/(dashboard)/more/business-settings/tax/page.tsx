"use client";

import { FeatureUnavailablePanel } from "@/components/dashboard/FeatureUnavailablePanel";
import { useDashboard } from "@/components/dashboard/DashboardProvider";
import { TaxManagementPanel } from "@/components/tax/TaxManagementPanel";
import { canShowPhase2Navigation } from "@/lib/phase2/client-access";

export default function TaxPage() {
  const { state, setNotice } = useDashboard();
  const canManageTax = canShowPhase2Navigation({
    state,
    flag: "tax",
    entitlement: "tax_management",
    permission: "canManageTax",
  });

  return (
    <main className="space-y-8">
      <header>
        <p className="text-sm text-textSecondary">Business settings</p>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Tax</h1>
      </header>
      {canManageTax ? (
        <TaxManagementPanel businessId={state.businessId} onNotice={setNotice} />
      ) : (
        <FeatureUnavailablePanel
          title="Tax management is not available"
          description="This business needs the Tax flag, owner access, and a plan with tax management."
        />
      )}
    </main>
  );
}
