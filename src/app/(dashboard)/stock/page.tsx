"use client";

import { ProductList } from "@/components/stock/ProductList";
import { useDashboard } from "@/components/dashboard/DashboardProvider";

export default function StockPage() {
  const { state, createInventoryItem, moveInventory, sendStockAlert } = useDashboard();

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
      />
    </main>
  );
}
