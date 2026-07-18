import { FeatureUnavailablePanel } from "@/components/dashboard/FeatureUnavailablePanel";
import { LocationManagementRouteClient } from "@/components/locations/LocationManagementRouteClient";
import { getPhase2PageAccess } from "@/lib/phase2/page-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function LocationsPage() {
  const access = await getPhase2PageAccess({
    routePath: "/more/business-settings/locations",
    feature: "locations",
    featureLabel: "Locations",
    entitlement: "multi_location",
    requiredPlan: "pro",
    permission: "locations:create",
  });

  return (
    <main className="space-y-8">
      <header>
        <p className="text-sm text-textSecondary">Business settings</p>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Locations</h1>
      </header>
      {access.allowed ? (
        <LocationManagementRouteClient />
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
