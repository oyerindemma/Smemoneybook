"use client";

import { FeatureUnavailablePanel } from "@/components/dashboard/FeatureUnavailablePanel";
import { useDashboard } from "@/components/dashboard/DashboardProvider";
import { LocationManagementPanel } from "@/components/locations/LocationManagementPanel";
import { canShowPhase2Navigation } from "@/lib/phase2/client-access";

export default function LocationsPage() {
  const { state, setNotice } = useDashboard();
  const canManageLocations = canShowPhase2Navigation({
    state,
    flag: "locations",
    entitlement: "multi_location",
    permission: "canManageLocations",
  });

  return (
    <main className="space-y-8">
      <header>
        <p className="text-sm text-textSecondary">Business settings</p>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Locations</h1>
      </header>
      {canManageLocations ? (
        <LocationManagementPanel
          businessId={state.businessId}
          initialLocations={state.locations}
          onNotice={setNotice}
        />
      ) : (
        <FeatureUnavailablePanel
          title="Locations are not available"
          description="This business needs the Locations flag, owner access, and a plan with multiple locations."
        />
      )}
    </main>
  );
}
