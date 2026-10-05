import { FeatureUnavailablePanel } from "@/components/dashboard/FeatureUnavailablePanel";
import { StaffPerformancePanel } from "@/components/staff/StaffPerformancePanel";
import { phase3FeatureFlags } from "@/lib/phase3/feature-flags";
import { isStaffPerformanceFeatureEnabledForServer } from "@/lib/staff-performance/authorization";

export default function StaffPerformancePage() {
  const enabled = phase3FeatureFlags.staffPerformance && isStaffPerformanceFeatureEnabledForServer();

  return (
    <main className="space-y-6 md:space-y-8">
      <header>
        <p className="text-sm font-semibold text-primary">Staff performance</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">Team operational activity</h1>
        <p className="mt-1 text-sm text-textSecondary md:text-base">
          Review attributed business records with clear data-quality notes.
        </p>
      </header>
      {enabled ? (
        <StaffPerformancePanel />
      ) : (
        <FeatureUnavailablePanel
          title="Staff Performance is unavailable"
          description="This Preview module needs both public and server-side Staff Performance flags before authorized users can open it."
          billingLink={false}
        />
      )}
    </main>
  );
}
