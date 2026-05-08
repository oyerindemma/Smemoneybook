import { DashboardProvider } from "@/components/dashboard/DashboardProvider";
import { BottomNav } from "@/components/navigation/BottomNav";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background pb-[calc(7rem+env(safe-area-inset-bottom))] text-textPrimary md:pb-[calc(7.5rem+env(safe-area-inset-bottom))]">
      <DashboardProvider>
        <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-6 md:py-10 lg:max-w-6xl">{children}</div>
        <BottomNav />
      </DashboardProvider>
    </div>
  );
}
