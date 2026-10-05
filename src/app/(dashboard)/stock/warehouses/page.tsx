import { FeatureUnavailablePanel } from "@/components/dashboard/FeatureUnavailablePanel";
import { LocationManagementRouteClient } from "@/components/locations/LocationManagementRouteClient";
import { getPhase2PageAccess } from "@/lib/phase2/page-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function WarehousesPage() {
  const access = await getPhase2PageAccess({
    routePath: "/stock/warehouses",
    feature: "locations",
    featureLabel: "Warehouses",
    entitlement: "multi_location",
    requiredPlan: "pro",
    permission: "locations:create",
  });

  return (
    <main className="space-y-8">
      <header>
        <p className="text-sm text-textSecondary">Stock</p>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Warehouses</h1>
      </header>
      {access.allowed ? (
        <LocationManagementRouteClient mode="warehouses" />
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
