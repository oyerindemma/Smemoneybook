"use client";

import { FeatureUnavailablePanel } from "@/components/dashboard/FeatureUnavailablePanel";
import { useDashboard } from "@/components/dashboard/DashboardProvider";
import { StockTransferPanel } from "@/components/stock/StockTransferPanel";
import { canShowPhase2Navigation } from "@/lib/phase2/client-access";

export default function TransfersPage() {
  const { state, setNotice } = useDashboard();
  const canManageTransfers = canShowPhase2Navigation({
    state,
    flag: "transfers",
    entitlement: "warehouse_transfers",
    permission: "canManageTransfers",
  });

  return (
    <main className="space-y-8">
      <header>
        <p className="text-sm text-textSecondary">Stock</p>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Transfers</h1>
      </header>
      {canManageTransfers ? (
        <StockTransferPanel
          businessId={state.businessId}
          locations={state.locations ?? []}
          items={state.items}
          onNotice={setNotice}
        />
      ) : (
        <FeatureUnavailablePanel
          title="Warehouse transfers are not available"
          description="This business needs the Transfers flag, transfer permission, and a plan with warehouse transfers."
        />
      )}
    </main>
  );
}
