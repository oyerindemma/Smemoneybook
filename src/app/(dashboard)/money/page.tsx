"use client";

import { useDashboard } from "@/components/dashboard/DashboardProvider";
import { CoreMoneyDashboard } from "@/components/dashboard/CoreMoneyDashboard";
import { ActivityFeed } from "@/components/money/ActivityFeed";
import { ActivationProgress } from "@/components/onboarding/ActivationProgress";
import { RetentionEnginePanel } from "@/components/dashboard/RetentionEnginePanel";
import { ViralGrowthPanel } from "@/components/dashboard/ViralGrowthPanel";

export default function MoneyPage() {
  const {
    state,
    todayActivityCount,
    openRecordModal,
    openVoiceDraft,
    reverseActivity,
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
