import type { MoneybookState } from "@/lib/bookkeeping/transaction-engine";

export type OnboardingStatus =
  | "setup"
  | "first_activity"
  | "dashboard";

export function getOnboardingStatus(state: MoneybookState | null): OnboardingStatus {
  if (!state?.businessId || !state.onboardingCompleted) {
    return "setup";
  }

  if (state.transactions.length === 0) {
    return "first_activity";
  }

  return "dashboard";
}
