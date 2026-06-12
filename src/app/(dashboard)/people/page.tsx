"use client";

import { useDashboard } from "@/components/dashboard/DashboardProvider";
import { DebtList } from "@/components/dashboard/DebtList";
import { ReceivablesSummary } from "@/components/dashboard/ReceivablesSummary";

export default function PeoplePage() {
  const {
    state,
    collectDebt,
    settleSupplierDebt,
    remindDebt,
    sendPaymentConfirmation,
    openRecordModal,
    showUpgradePrompt,
  } = useDashboard();

  return (
    <main className="space-y-8 md:space-y-10">
      <PageHeader
        title="People"
        subtitle="See people owing you and bills you will pay later."
      />
      <ReceivablesSummary debts={state.debts} />
      <DebtList
        businessId={state.businessId}
        accounts={state.accounts}
        debts={state.debts}
        onCollect={collectDebt}
        onSettleSupplier={settleSupplierDebt}
        onRemind={remindDebt}
        onSendPaymentConfirmation={sendPaymentConfirmation}
        onRecord={openRecordModal}
        onUpgradePrompt={showUpgradePrompt}
      />
    </main>
  );
}

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header>
      <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
      <p className="mt-1 text-sm text-textSecondary md:text-base">{subtitle}</p>
    </header>
  );
}
