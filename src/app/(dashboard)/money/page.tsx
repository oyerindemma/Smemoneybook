"use client";

import { useDashboard } from "@/components/dashboard/DashboardProvider";
import { CoreMoneyDashboard } from "@/components/dashboard/CoreMoneyDashboard";
import { ActivityFeed } from "@/components/money/ActivityFeed";
import { ActivationProgress } from "@/components/onboarding/ActivationProgress";
import { RetentionEnginePanel } from "@/components/dashboard/RetentionEnginePanel";
import { ViralGrowthPanel } from "@/components/dashboard/ViralGrowthPanel";
import { CustomerReturnPanel } from "@/components/returns/CustomerReturnPanel";
import { phase1FeatureFlags } from "@/lib/phase1/feature-flags";

export default function MoneyPage() {
  const {
    state,
    todayActivityCount,
    openRecordModal,
    openVoiceDraft,
    reverseActivity,
    submitCustomerReturn,
  } = useDashboard();

  return (
    <main className="space-y-7 md:space-y-8">
      <CoreMoneyDashboard
        state={state}
        todayActivityCount={todayActivityCount}
        onAction={openRecordModal}
        onVoiceDraft={openVoiceDraft}
      />
      <ActivationProgress
        activityCount={state.transactions.filter((transaction) => !transaction.reversedByTransactionId).length}
        onRecord={() => openRecordModal("sale")}
      />
      <RetentionEnginePanel state={state} />
      <ViralGrowthPanel state={state} />
      {phase1FeatureFlags.returns ? (
        <CustomerReturnPanel
          transactions={state.transactions}
          accounts={state.accounts}
          onSubmit={submitCustomerReturn}
        />
      ) : null}
      <ActivityFeed
        transactions={state.transactions}
        debts={state.debts}
        onReverse={reverseActivity}
        canReverse={state.permissions?.canManageAccounts ?? false}
        onRecord={openRecordModal}
      />
    </main>
  );
}
