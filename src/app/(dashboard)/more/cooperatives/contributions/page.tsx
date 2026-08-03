import { CooperativeGroupsPanel } from "@/components/cooperatives/CooperativeGroupsPanel";
import { FeatureUnavailablePanel } from "@/components/dashboard/FeatureUnavailablePanel";
import { phase3FeatureFlags } from "@/lib/phase3/feature-flags";

export default function CooperativesContributionsPage() {
  return (
    <main className="space-y-6 md:space-y-8">
      <header>
        <p className="text-sm font-semibold text-primary">Cooperatives</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">Contributions</h1>
      </header>
      {phase3FeatureFlags.cooperativeGroups ? (
        <CooperativeGroupsPanel initialView="contributions" />
      ) : (
        <FeatureUnavailablePanel
          title="Cooperative groups are not available"
          description="Phase 3J is behind rollout flags while Preview-only ledger, permission, and workflow validation is completed."
          billingLink={false}
        />
      )}
    </main>
  );
}
