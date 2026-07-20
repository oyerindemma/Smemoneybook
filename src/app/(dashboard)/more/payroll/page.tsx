import { FeatureUnavailablePanel } from "@/components/dashboard/FeatureUnavailablePanel";
import { PayrollPanel } from "@/components/payroll/PayrollPanel";
import { phase3FeatureFlags } from "@/lib/phase3/feature-flags";

export default function PayrollPage() {
  return (
    <main className="space-y-6 md:space-y-8">
      <header>
        <p className="text-sm font-semibold text-primary">Payroll</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">Employees and payroll runs</h1>
        <p className="mt-1 text-sm text-textSecondary md:text-base">
          Draft, approve, lock, and reverse payroll snapshots with admin-only access.
        </p>
      </header>
      {phase3FeatureFlags.payroll ? (
        <PayrollPanel />
      ) : (
        <FeatureUnavailablePanel
          title="Payroll is not available"
          description="Phase 3J is behind a rollout flag while locked runs, payslip access controls, and payroll integrity tests are validated."
          billingLink={false}
        />
      )}
    </main>
  );
}
