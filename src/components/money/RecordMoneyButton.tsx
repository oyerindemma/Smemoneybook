"use client";

import { useDashboard } from "@/components/dashboard/DashboardProvider";

export function RecordMoneyButton() {
  const { openRecordModal } = useDashboard();

  return (
    <button
      className="min-h-14 w-full rounded-xl border border-gray-100 bg-primary px-5 py-4 text-base font-semibold text-white shadow-sm transition-all duration-150 hover:bg-primaryHover hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
      type="button"
      onClick={openRecordModal}
    >
      + Record money
    </button>
  );
}
