"use client";

import { useDashboard } from "@/components/dashboard/DashboardProvider";
import { StockTransferPanel } from "@/components/stock/StockTransferPanel";

export function StockTransfersRouteClient() {
  const { state, setNotice } = useDashboard();

  return (
    <StockTransferPanel
      businessId={state.businessId}
      locations={state.locations ?? []}
      items={state.items}
      onNotice={setNotice}
    />
  );
}
