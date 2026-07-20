import { CooperativeGroupsPanel } from "@/components/cooperatives/CooperativeGroupsPanel";
import { FeatureUnavailablePanel } from "@/components/dashboard/FeatureUnavailablePanel";
import { phase3FeatureFlags } from "@/lib/phase3/feature-flags";

export default function CooperativesPage() {
  return (
    <main className="space-y-6 md:space-y-8">
      <header>
        <p className="text-sm font-semibold text-primary">Cooperatives</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">Savings groups and member ledgers</h1>
        <p className="mt-1 text-sm text-textSecondary md:text-base">
          Track group savings, member contributions, loans, arrears, and distributions separately.
        </p>
      </header>
      {phase3FeatureFlags.cooperativeGroups ? (
        <CooperativeGroupsPanel />
      ) : (
        <FeatureUnavailablePanel
          title="Cooperative groups are not available"
          description="Phase 3I is behind a rollout flag while ledger separation, permissions, and financial integrity tests are validated."
          billingLink={false}
        />
      )}
    </main>
  );
}
