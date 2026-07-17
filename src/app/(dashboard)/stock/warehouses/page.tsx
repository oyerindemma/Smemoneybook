"use client";

import { FeatureUnavailablePanel } from "@/components/dashboard/FeatureUnavailablePanel";
import { useDashboard } from "@/components/dashboard/DashboardProvider";
import { LocationManagementPanel } from "@/components/locations/LocationManagementPanel";
import { canShowPhase2Navigation } from "@/lib/phase2/client-access";

export default function WarehousesPage() {
  const { state, setNotice } = useDashboard();
  const canManageWarehouses = canShowPhase2Navigation({
    state,
    flag: "locations",
    entitlement: "multi_location",
    permission: "canManageLocations",
  });

  return (
    <main className="space-y-8">
      <header>
        <p className="text-sm text-textSecondary">Stock</p>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Warehouses</h1>
      </header>
      {canManageWarehouses ? (
        <LocationManagementPanel
          businessId={state.businessId}
          initialLocations={state.locations}
          mode="warehouses"
          onNotice={setNotice}
        />
      ) : (
        <FeatureUnavailablePanel
          title="Warehouses are not available"
          description="This business needs the Locations flag, owner access, and a plan with multiple locations."
        />
      )}
    </main>
  );
}
