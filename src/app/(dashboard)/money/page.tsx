"use client";

import { useDashboard } from "@/components/dashboard/DashboardProvider";
import { CoreMoneyDashboard } from "@/components/dashboard/CoreMoneyDashboard";
import { BusinessHealthCard } from "@/components/dashboard/BusinessHealthCard";
import { CashflowForecastCard } from "@/components/dashboard/CashflowForecastCard";
import { ActivityFeed } from "@/components/money/ActivityFeed";
import { ActivationProgress } from "@/components/onboarding/ActivationProgress";
import { RetentionEnginePanel } from "@/components/dashboard/RetentionEnginePanel";
import { ViralGrowthPanel } from "@/components/dashboard/ViralGrowthPanel";
import { CustomerReturnPanel } from "@/components/returns/CustomerReturnPanel";
import { phase1FeatureFlags } from "@/lib/phase1/feature-flags";
import { phase3FeatureFlags } from "@/lib/phase3/feature-flags";

export default function MoneyPage() {
  const {
    state,
    todayActivityCount,
    openRecordModal,
    openVoiceDraft,
    reverseActivity,
    submitCustomerReturn,
    setNotice,
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
      {phase3FeatureFlags.healthScore && state.businessId ? (
        <BusinessHealthCard
          businessId={state.businessId}
          locationId={state.selectedLocationId}
          onNotice={setNotice}
        />
      ) : null}
      {phase3FeatureFlags.cashflowForecasts && state.businessId ? (
        <CashflowForecastCard
          businessId={state.businessId}
          locationId={state.selectedLocationId}
          onNotice={setNotice}
        />
      ) : null}
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
