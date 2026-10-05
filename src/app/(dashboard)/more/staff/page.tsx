"use client";

import { FeatureUnavailablePanel } from "@/components/dashboard/FeatureUnavailablePanel";
import { useDashboard } from "@/components/dashboard/DashboardProvider";
import { StaffManagementPanel } from "@/components/staff/StaffManagementPanel";
import { hasClientPermission, hasEntitlement } from "@/lib/phase2/client-access";

export default function StaffPage() {
  const { state, setNotice } = useDashboard();
  const canManageStaff = Boolean(
    hasClientPermission(state, "canManageStaff") && hasEntitlement(state, "team_management"),
  );

  return (
    <main className="space-y-8">
      <header>
        <p className="text-sm text-textSecondary">More</p>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Staff</h1>
      </header>
      {canManageStaff ? (
        <StaffManagementPanel businessId={state.businessId} onNotice={setNotice} />
      ) : (
        <FeatureUnavailablePanel
          title="Staff invitations are not available"
          description="This business needs owner access and a plan with team management."
        />
      )}
    </main>
  );
}
