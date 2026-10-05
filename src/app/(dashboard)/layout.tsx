import { DashboardProvider } from "@/components/dashboard/DashboardProvider";
import { BusinessSwitcher } from "@/components/dashboard/BusinessSwitcher";
import { LocationSwitcher } from "@/components/dashboard/LocationSwitcher";
import { UniversalSearch } from "@/components/dashboard/UniversalSearch";
import { BottomNav } from "@/components/navigation/BottomNav";
import { HelpDrawer } from "@/components/help/HelpDrawer";
import { phase1FeatureFlags } from "@/lib/phase1/feature-flags";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background pb-[calc(7rem+env(safe-area-inset-bottom))] text-textPrimary md:pb-[calc(7.5rem+env(safe-area-inset-bottom))]">
      <DashboardProvider>
        <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-6 md:py-10 lg:max-w-6xl">
          <BusinessSwitcher />
          <LocationSwitcher />
          <UniversalSearch />
          {children}
        </div>
        {phase1FeatureFlags.help ? <HelpDrawer /> : null}
        <BottomNav />
      </DashboardProvider>
    </div>
  );
}
