import { FeatureUnavailablePanel } from "@/components/dashboard/FeatureUnavailablePanel";
import { StaffPerformancePanel } from "@/components/staff/StaffPerformancePanel";
import { phase3FeatureFlags } from "@/lib/phase3/feature-flags";

export default function StaffPerformancePage() {
  return (
    <main className="space-y-6 md:space-y-8">
      <header>
        <p className="text-sm font-semibold text-primary">Staff performance</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">Team activity and goals</h1>
        <p className="mt-1 text-sm text-textSecondary md:text-base">
          Review transparent business activity without hidden surveillance or sensitive profiling.
        </p>
      </header>
      {phase3FeatureFlags.staffPerformance ? (
        <StaffPerformancePanel />
      ) : (
        <FeatureUnavailablePanel
          title="Staff Performance is not available"
          description="Phase 3K is behind a rollout flag while metric definitions, role visibility, and coaching language are validated."
          billingLink={false}
        />
      )}
    </main>
  );
}
