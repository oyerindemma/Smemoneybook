import { FeatureUnavailablePanel } from "@/components/dashboard/FeatureUnavailablePanel";
import { LoanReadinessPanel } from "@/components/loan-readiness/LoanReadinessPanel";
import { phase3FeatureFlags } from "@/lib/phase3/feature-flags";

export default function LoanReadinessPage() {
  return (
    <main className="space-y-6 md:space-y-8">
      <header>
        <p className="text-sm font-semibold text-primary">Loan readiness</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">Prepare your business records</h1>
        <p className="mt-1 text-sm text-textSecondary md:text-base">
          Review readiness evidence before speaking with a financing partner.
        </p>
      </header>
      {phase3FeatureFlags.loanReadiness ? (
        <LoanReadinessPanel />
      ) : (
        <FeatureUnavailablePanel
          title="Loan Readiness is not available"
          description="Phase 3G is behind a rollout flag while scoring, disclaimers, and consent logging are validated."
          billingLink={false}
        />
      )}
    </main>
  );
}
