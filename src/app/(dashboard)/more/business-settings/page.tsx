"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Building2, MapPin, Percent } from "lucide-react";
import { useDashboard } from "@/components/dashboard/DashboardProvider";
import { FeatureUnavailablePanel } from "@/components/dashboard/FeatureUnavailablePanel";
import {
  getPhase2NavigationAccess,
  type Phase2NavigationAccess,
} from "@/lib/phase2/client-access";

export default function BusinessSettingsPage() {
  const { state } = useDashboard();
  const locationsAccess = getPhase2NavigationAccess({
    state,
    flag: "locations",
    entitlement: "multi_location",
    permission: "canManageLocations",
  });
  const taxAccess = getPhase2NavigationAccess({
    state,
    flag: "tax",
    entitlement: "tax_management",
    permission: "canManageTax",
  });
  const canManageAnySettings = locationsAccess.enabled || taxAccess.enabled;

  return (
    <main className="space-y-8">
      <header>
        <p className="text-sm text-textSecondary">More</p>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Business settings</h1>
      </header>

      {!canManageAnySettings ? (
        <FeatureUnavailablePanel
          title="Business OS settings are not available"
          description="This business needs the Preview flags, owner access, and a plan with Phase 2 settings enabled."
        />
      ) : null}

      <section className="grid gap-3 md:grid-cols-2">
        <SettingsLink
          href="/more/business-settings/locations"
          icon={<MapPin size={18} aria-hidden="true" />}
          title="Locations"
          meta={locationsAccess.enabled ? `${state.locations?.length ?? 0} active` : phase2Meta(locationsAccess)}
        />
        <SettingsLink
          href="/stock/warehouses"
          icon={<Building2 size={18} aria-hidden="true" />}
          title="Warehouses"
          meta={locationsAccess.enabled ? "Stock" : phase2Meta(locationsAccess)}
        />
        <SettingsLink
          href="/more/business-settings/tax"
          icon={<Percent size={18} aria-hidden="true" />}
          title="Tax"
          meta={taxAccess.enabled ? "Optional" : phase2Meta(taxAccess)}
        />
      </section>
    </main>
  );
}

function SettingsLink({
  href,
  icon,
  title,
  meta,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  meta: string;
}) {
  return (
    <Link
      className="flex min-h-16 items-center justify-between rounded-2xl border border-gray-100 bg-card px-5 py-4 text-sm font-semibold shadow-sm transition hover:shadow-md active:scale-[0.99]"
      href={href}
    >
      <span className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-background text-primary">
          {icon}
        </span>
        {title}
      </span>
      <span className="text-xs text-textMuted">{meta}</span>
    </Link>
  );
}

function phase2Meta(access: Phase2NavigationAccess) {
  return {
    available: "Available",
    "flag-disabled": "Unavailable",
    upgrade: "Upgrade",
    permission: "No access",
  }[access.reason];
}
