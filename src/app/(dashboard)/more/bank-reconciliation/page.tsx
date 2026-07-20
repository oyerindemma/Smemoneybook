import { FeatureUnavailablePanel } from "@/components/dashboard/FeatureUnavailablePanel";
import { BankReconciliationPanel } from "@/components/reconciliation/BankReconciliationPanel";
import { phase3FeatureFlags } from "@/lib/phase3/feature-flags";

export default function BankReconciliationPage() {
  return (
    <main className="space-y-6 md:space-y-8">
      <header>
        <p className="text-sm font-semibold text-primary">Bank reconciliation</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">Review bank statement matches</h1>
        <p className="mt-1 text-sm text-textSecondary md:text-base">
          Import CSV statements and confirm suggested matches before locking.
        </p>
      </header>
      {phase3FeatureFlags.bankReconciliation ? (
        <BankReconciliationPanel />
      ) : (
        <FeatureUnavailablePanel
          title="Bank Reconciliation is not available"
          description="Phase 3F is behind a rollout flag while import parsing, matching accuracy, locking, and audit controls are validated."
          billingLink={false}
        />
      )}
    </main>
  );
}
