"use client";

import { ProductList } from "@/components/stock/ProductList";
import { useDashboard } from "@/components/dashboard/DashboardProvider";
import { SupplierReturnPanel } from "@/components/returns/SupplierReturnPanel";
import { StockTransferPanel } from "@/components/stock/StockTransferPanel";
import { phase1FeatureFlags } from "@/lib/phase1/feature-flags";
import { phase2FeatureFlags } from "@/lib/phase2/feature-flags";

export default function StockPage() {
  const {
    state,
    createInventoryItem,
    moveInventory,
    sendStockAlert,
    openRecordModal,
    submitSupplierReturn,
    setNotice,
  } = useDashboard();

  return (
    <main className="space-y-8 md:space-y-10">
      <header>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Stock</h1>
        <p className="mt-1 text-sm text-textSecondary md:text-base">Products and stock levels.</p>
      </header>
      <ProductList
        items={state.items}
        onCreate={createInventoryItem}
        onMove={moveInventory}
        onNotifyOwner={sendStockAlert}
        onCreateInvoice={() => openRecordModal("invoice")}
      />
      {phase1FeatureFlags.returns ? (
        <SupplierReturnPanel
          items={state.items}
          accounts={state.accounts}
          onSubmit={submitSupplierReturn}
        />
      ) : null}
      {phase2FeatureFlags.transfers ? (
        <StockTransferPanel
          businessId={state.businessId}
          locations={state.locations ?? []}
          items={state.items}
          onNotice={setNotice}
        />
      ) : null}
    </main>
  );
}
