"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, CircleEllipsis, HandCoins, Home, Plus, ScanBarcode } from "lucide-react";
import { useDashboard } from "@/components/dashboard/DashboardProvider";
import { phase1FeatureFlags } from "@/lib/phase1/feature-flags";

const tabs = [
  { href: "/money", label: "Money", icon: Home },
  { href: "/people", label: "People", icon: HandCoins },
  ...(phase1FeatureFlags.pos ? [{ href: "/pos", label: "POS", icon: ScanBarcode }] : []),
  { href: "/stock", label: "Stock", icon: Boxes },
  { href: "/more", label: "More", icon: CircleEllipsis },
];

export function BottomNav() {
  const pathname = usePathname();
  const { openRecordModal } = useDashboard();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-card/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 shadow-lg backdrop-blur md:bottom-4 md:mx-auto md:max-w-md md:rounded-2xl md:border md:px-3"
    >
      <div
        className={`mx-auto grid items-end gap-1 ${
          phase1FeatureFlags.pos ? "max-w-lg grid-cols-6" : "max-w-md grid-cols-5"
        }`}
      >
        {tabs.slice(0, 2).map((tab) => (
          <NavLink
            key={tab.href}
            href={tab.href}
            label={tab.label}
            icon={tab.icon}
            active={pathname === tab.href}
          />
        ))}

        <button
          aria-label="Record money"
          className="flex min-h-14 flex-col items-center justify-center rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white shadow-lg transition-all duration-150 hover:bg-primaryHover hover:shadow-xl active:scale-[0.96]"
          type="button"
          onClick={() => openRecordModal("money")}
        >
          <Plus size={20} aria-hidden="true" />
          Record
        </button>

        {tabs.slice(2).map((tab) => (
          <NavLink
            key={tab.href}
            href={tab.href}
            label={tab.label}
            icon={tab.icon}
            active={pathname === tab.href}
          />
        ))}
      </div>
    </nav>
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: typeof Home;
  active: boolean;
}) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={`flex min-h-14 flex-col items-center justify-center rounded-xl px-2 text-xs font-semibold transition-all duration-150 hover:bg-background active:scale-[0.96] ${
        active ? "bg-primary/10 text-primary" : "text-textMuted"
      }`}
      href={href}
    >
      <Icon size={20} aria-hidden="true" />
      {label}
    </Link>
  );
}
