import { FeatureUnavailablePanel } from "@/components/dashboard/FeatureUnavailablePanel";
import { StockTransfersRouteClient } from "@/components/stock/StockTransfersRouteClient";
import { getPhase2PageAccess } from "@/lib/phase2/page-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function TransfersPage() {
  const access = await getPhase2PageAccess({
    routePath: "/stock/transfers",
    feature: "transfers",
    featureLabel: "Warehouse transfers",
    entitlement: "warehouse_transfers",
    requiredPlan: "pro",
    permission: "transfers:create",
  });

  return (
    <main className="space-y-8">
      <header>
        <p className="text-sm text-textSecondary">Stock</p>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Transfers</h1>
      </header>
      {access.allowed ? (
        <StockTransfersRouteClient />
      ) : (
        <FeatureUnavailablePanel
          title={access.title}
          description={access.description}
          billingLink={access.billingLink}
        />
      )}
    </main>
  );
}
