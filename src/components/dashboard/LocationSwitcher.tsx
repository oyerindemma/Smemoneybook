"use client";

import { MapPin } from "lucide-react";
import { useDashboard } from "@/components/dashboard/DashboardProvider";
import { phase2FeatureFlags } from "@/lib/phase2/feature-flags";

export function LocationSwitcher() {
  const { state, setNotice } = useDashboard();
  const locations = state.locations ?? [];

  if (
    !phase2FeatureFlags.locations ||
    state.businessRole !== "owner" ||
    locations.length <= 1 ||
    !state.businessId
  ) {
    return null;
  }

  return (
    <label className="mb-4 flex min-h-14 items-center gap-3 rounded-2xl border border-gray-100 bg-card px-4 py-3 shadow-sm">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/20 text-textPrimary">
        <MapPin size={18} aria-hidden="true" />
      </span>
      <span className="sr-only">Switch location</span>
      <select
        className="min-h-10 flex-1 bg-transparent text-sm font-semibold text-textPrimary outline-none"
        value={state.selectedLocationId ?? ""}
        onChange={(event) => {
          localStorage.setItem(
            `selectedLocationId:${state.businessId}`,
            event.target.value,
          );
          setNotice("Switching location...");
          window.location.reload();
        }}
      >
        {locations.map((location) => (
          <option key={location.id} value={location.id}>
            {location.name}
          </option>
        ))}
      </select>
    </label>
  );
}
