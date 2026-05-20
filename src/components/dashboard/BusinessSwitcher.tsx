"use client";

import { Building2 } from "lucide-react";
import { useDashboard } from "@/components/dashboard/DashboardProvider";

export function BusinessSwitcher() {
  const { state, setNotice } = useDashboard();
  const businesses = state.businesses ?? [];

  if (businesses.length <= 1) {
    return null;
  }

  return (
    <label className="mb-4 flex min-h-14 items-center gap-3 rounded-2xl border border-gray-100 bg-card px-4 py-3 shadow-sm">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Building2 size={18} aria-hidden="true" />
      </span>
      <span className="sr-only">Switch business</span>
      <select
        className="min-h-10 flex-1 bg-transparent text-sm font-semibold text-textPrimary outline-none"
        value={state.businessId ?? ""}
        onChange={(event) => {
          localStorage.setItem("selectedBusinessId", event.target.value);
          setNotice("Switching business...");
          window.location.reload();
        }}
      >
        {businesses.map((business) => (
          <option key={business.id} value={business.id}>
            {business.name}
          </option>
        ))}
      </select>
    </label>
  );
}
