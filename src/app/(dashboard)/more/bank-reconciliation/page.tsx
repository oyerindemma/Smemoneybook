import { FeatureUnavailablePanel } from "@/components/dashboard/FeatureUnavailablePanel";
import { BankReconciliationPanel } from "@/components/reconciliation/BankReconciliationPanel";
import { isBankReconciliationFeatureEnabledForServer } from "@/lib/bank-reconciliation/authorization";
import { phase3FeatureFlags } from "@/lib/phase3/feature-flags";

export default function BankReconciliationPage() {
  const enabled = phase3FeatureFlags.bankReconciliation && isBankReconciliationFeatureEnabledForServer();

  return (
    <main className="space-y-6 md:space-y-8">
      <header>
        <p className="text-sm font-semibold text-primary">Bank reconciliation</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">Review bank statement matches</h1>
        <p className="mt-1 text-sm text-textSecondary md:text-base">
          Import CSV statements and confirm suggested matches before locking.
        </p>
      </header>
      {enabled ? (
        <BankReconciliationPanel />
      ) : (
        <FeatureUnavailablePanel
          title="Bank Reconciliation is unavailable"
          description="This Preview module needs both public and server-side Bank Reconciliation flags before authorized users can open it."
          billingLink={false}
        />
      )}
    </main>
  );
}
