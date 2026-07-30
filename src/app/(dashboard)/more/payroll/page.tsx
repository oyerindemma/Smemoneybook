import { FeatureUnavailablePanel } from "@/components/dashboard/FeatureUnavailablePanel";
import { PayrollPanel } from "@/components/payroll/PayrollPanel";
import { isPayrollFeatureEnabledForServer } from "@/lib/payroll/authorization";
import { phase3FeatureFlags } from "@/lib/phase3/feature-flags";

export default function PayrollPage() {
  const enabled = phase3FeatureFlags.payroll && isPayrollFeatureEnabledForServer();

  return (
    <main className="space-y-6 md:space-y-8">
      <header>
        <p className="text-sm font-semibold text-primary">Payroll</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">Controlled payroll workflow</h1>
        <p className="mt-1 text-sm text-textSecondary md:text-base">
          Prepare employees, calculate payroll, approve snapshots, generate payslips, and post expenses explicitly.
        </p>
      </header>
      {enabled ? (
        <PayrollPanel />
      ) : (
        <FeatureUnavailablePanel
          title="Payroll is not available"
          description="Phase 3I needs both public and server-side Payroll flags before Preview QA can run."
          billingLink={false}
        />
      )}
    </main>
  );
}
