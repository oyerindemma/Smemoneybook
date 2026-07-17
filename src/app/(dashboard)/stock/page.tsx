"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Building2, Repeat2 } from "lucide-react";
import { ProductList } from "@/components/stock/ProductList";
import { useDashboard } from "@/components/dashboard/DashboardProvider";
import { SupplierReturnPanel } from "@/components/returns/SupplierReturnPanel";
import { StockTransferPanel } from "@/components/stock/StockTransferPanel";
import { phase1FeatureFlags } from "@/lib/phase1/feature-flags";
import { canShowPhase2Navigation } from "@/lib/phase2/client-access";

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
  const canManageWarehouses = canShowPhase2Navigation({
    state,
    flag: "locations",
    entitlement: "multi_location",
    permission: "canManageLocations",
  });
  const canManageTransfers = canShowPhase2Navigation({
    state,
    flag: "transfers",
    entitlement: "warehouse_transfers",
    permission: "canManageTransfers",
  });

  return (
    <main className="space-y-8 md:space-y-10">
      <header>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Stock</h1>
        <p className="mt-1 text-sm text-textSecondary md:text-base">Products and stock levels.</p>
      </header>
      {(canManageWarehouses || canManageTransfers) ? (
        <section className="grid gap-3 md:grid-cols-2">
          {canManageWarehouses ? (
            <StockLink
              href="/stock/warehouses"
              icon={<Building2 size={18} aria-hidden="true" />}
              label="Warehouses"
              meta={`${state.locations?.filter((location) => location.type === "warehouse").length ?? 0} active`}
            />
          ) : null}
          {canManageTransfers ? (
            <StockLink
              href="/stock/transfers"
              icon={<Repeat2 size={18} aria-hidden="true" />}
              label="Transfers"
              meta="Move stock"
            />
          ) : null}
        </section>
      ) : null}
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
      {canManageTransfers ? (
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

function StockLink({
  href,
  icon,
  label,
  meta,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  meta: string;
}) {
  return (
    <Link
      className="flex min-h-14 items-center justify-between rounded-2xl border border-gray-100 bg-card px-5 py-4 text-sm font-semibold shadow-sm transition-all duration-150 hover:shadow-md active:scale-[0.99]"
      href={href}
    >
      <span className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-background text-primary">
          {icon}
        </span>
        {label}
      </span>
      <span className="text-xs text-textMuted">{meta}</span>
    </Link>
  );
}
