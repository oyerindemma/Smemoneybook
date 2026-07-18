"use client";

import { useDashboard } from "@/components/dashboard/DashboardProvider";
import { LocationManagementPanel } from "@/components/locations/LocationManagementPanel";

export function LocationManagementRouteClient({
  mode = "all",
}: {
  mode?: "all" | "warehouses";
}) {
  const { state, setNotice } = useDashboard();

  return (
    <LocationManagementPanel
      businessId={state.businessId}
      initialLocations={state.locations}
      mode={mode}
      onNotice={setNotice}
    />
  );
}
