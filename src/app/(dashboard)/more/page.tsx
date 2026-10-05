"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  BadgeDollarSign,
  BarChart3,
  BellRing,
  Building2,
  CreditCard,
  FileChartColumn,
  HandCoins,
  Landmark,
  Megaphone,
  Microscope,
  ReceiptText,
  Settings,
  ShieldCheck,
  Target,
  UserPlus,
} from "lucide-react";
import { OperationsPanel } from "@/components/dashboard/OperationsPanel";
import { PaidTierPanel } from "@/components/dashboard/PaidTierPanel";
import { Phase2SettingsPanel } from "@/components/dashboard/Phase2SettingsPanel";
import { useDashboard } from "@/components/dashboard/DashboardProvider";
import { OfflineSyncReviewPanel } from "@/components/offline/OfflineSyncReviewPanel";
import { ReceiptSettingsPanel } from "@/components/receipts/ReceiptSettingsPanel";
import type { MoneybookState } from "@/lib/bookkeeping/transaction-engine";
import {
  canShowBillingNavigation,
  getPhase2NavigationAccess,
  hasClientPermission,
  hasEntitlement,
  type Phase2NavigationAccess,
} from "@/lib/phase2/client-access";
import { phase3FeatureFlags } from "@/lib/phase3/feature-flags";
import { getPhase3NavigationStatus } from "@/lib/phase3/navigation-status";

export default function MorePage() {
  const { state, setNotice, saveReceiptConfig } = useDashboard();
  const router = useRouter();
  const [billingLive, setBillingLive] = useState(false);
  const locationsAccess = getPhase2NavigationAccess({
    state,
    flag: "locations",
    entitlement: "multi_location",
    permission: "canManageLocations",
  });
  const taxAccess = getPhase2NavigationAccess({
    state,
    flag: "tax",
    entitlement: "tax_management",
    permission: "canManageTax",
  });
  const reportsAccess = getPhase2NavigationAccess({
    state,
    flag: "reportingCentre",
    entitlement: "advanced_reports",
    permission: "canSaveReports",
  });
  const canManageBusinessSettings = locationsAccess.enabled || taxAccess.enabled;
  const canManageStaff = Boolean(
    hasClientPermission(state, "canManageStaff") && hasEntitlement(state, "team_management"),
  );
  const canManageBilling = canShowBillingNavigation(state);

  useEffect(() => {
    let mounted = true;

    fetch("/api/billing/status", { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as {
          billingLive?: boolean;
        } | null;

        if (mounted) {
          setBillingLive(Boolean(response.ok && payload?.billingLive));
        }
      })
      .catch(() => {
        if (mounted) {
          setBillingLive(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  async function signOut() {
    const response = await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });

    localStorage.removeItem("selectedBusinessId");

    if (!response.ok) {
      setNotice("Could not sign out right now.");
      return;
    }

    router.replace("/");
  }

  return (
    <main className="space-y-8 md:space-y-10">
      <header>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">More</h1>
        <p className="mt-1 text-sm text-textSecondary md:text-base">Advanced tools stay out of your daily flow.</p>
      </header>
      <section className="rounded-2xl border border-gray-100 bg-card p-6 shadow-sm">
        <p className="text-xs font-medium text-textSecondary">Staff access</p>
        <h2 className="mt-1 text-base font-semibold text-textPrimary">
          {roleLabel(state.businessRole)}
        </h2>
        <p className="mt-2 text-sm text-textSecondary">{roleDescription(state.businessRole)}</p>
      </section>
      <section className="grid gap-3 md:grid-cols-2">
        <MoreLink
          href="/more/business-settings"
          icon={<Settings size={18} aria-hidden="true" />}
          label="Business Settings"
          meta={canManageBusinessSettings ? "Locations · Tax" : combinedPhase2Meta([locationsAccess, taxAccess])}
        />
        <MoreLink
          href="/reports"
          icon={<FileChartColumn size={18} aria-hidden="true" />}
          label="Reports"
          meta={reportsAccess.enabled ? "Advanced" : reportsAccess.reason === "flag-disabled" ? "Basic" : phase2Meta(reportsAccess)}
        />
        <MoreLink
          href="/more/staff"
          icon={<UserPlus size={18} aria-hidden="true" />}
          label="Staff"
          meta={canManageStaff ? "Invite Staff" : staffMeta(state)}
        />
        {canManageBilling ? (
          <MoreLink
            href="/more/billing"
            icon={<CreditCard size={18} aria-hidden="true" />}
            label="Billing"
            meta={billingLive ? "Upgrade Plan" : "Setup"}
          />
        ) : null}
        <MoreLink
          href="/stock/warehouses"
          icon={<Building2 size={18} aria-hidden="true" />}
          label="Warehouses"
          meta={locationsAccess.enabled ? "Stock" : phase2Meta(locationsAccess)}
        />
        <MoreLink
          href="/more/bank-reconciliation"
          icon={<Landmark size={18} aria-hidden="true" />}
          label="Bank Reconciliation"
          meta={getPhase3NavigationStatus("bankReconciliation", phase3FeatureFlags.bankReconciliation)}
        />
        <MoreLink
          href="/more/loan-readiness"
          icon={<BadgeDollarSign size={18} aria-hidden="true" />}
          label="Loan Readiness"
          meta={getPhase3NavigationStatus("loanReadiness", phase3FeatureFlags.loanReadiness)}
        />
        <MoreLink
          href="/more/tax-assistant"
          icon={<ReceiptText size={18} aria-hidden="true" />}
          label="Tax Assistant"
          meta={getPhase3NavigationStatus("taxAssistant", phase3FeatureFlags.taxAssistant)}
        />
        <MoreLink
          href="/more/cooperatives"
          icon={<HandCoins size={18} aria-hidden="true" />}
          label="Cooperatives"
          meta={getPhase3NavigationStatus("cooperativeGroups", phase3FeatureFlags.cooperativeGroups)}
        />
        <MoreLink
          href="/more/payroll"
          icon={<ShieldCheck size={18} aria-hidden="true" />}
          label="Payroll"
          meta={getPhase3NavigationStatus("payroll", phase3FeatureFlags.payroll)}
        />
        <MoreLink
          href="/more/staff-performance"
          icon={<Target size={18} aria-hidden="true" />}
          label="Staff Performance"
          meta={getPhase3NavigationStatus("staffPerformance", phase3FeatureFlags.staffPerformance)}
        />
        <MoreLink
          href="/more/ai-marketing"
          icon={<Megaphone size={18} aria-hidden="true" />}
          label="AI Marketing"
          meta={getPhase3NavigationStatus("aiMarketing", phase3FeatureFlags.aiMarketing)}
        />
        <MoreLink
          href="/more/executive-dashboard"
          icon={<BarChart3 size={18} aria-hidden="true" />}
          label="Executive Dashboard"
          meta={getPhase3NavigationStatus("executiveDashboard", phase3FeatureFlags.executiveDashboard)}
        />
        <MoreLink
          href="/more/predictive-alerts"
          icon={<BellRing size={18} aria-hidden="true" />}
          label="Predictive Alerts"
          meta={getPhase3NavigationStatus("predictiveAlerts", phase3FeatureFlags.predictiveAlerts)}
        />
        <MoreLink
          href="/more/ai-evaluation"
          icon={<Microscope size={18} aria-hidden="true" />}
          label="AI Evaluation"
          meta={getPhase3NavigationStatus("aiEvaluation", phase3FeatureFlags.aiEvaluation)}
        />
      </section>
      <Link
        className="flex min-h-14 items-center justify-between rounded-2xl bg-card px-6 py-5 text-base font-semibold shadow-sm border border-gray-100 transition-all duration-150 hover:shadow-md active:scale-[0.99]"
        href="/assistant"
      >
        AI Assistant
        <span className={`text-sm ${phase3FeatureFlags.aiAdvisor ? "text-success" : "text-textMuted"}`}>
          {getPhase3NavigationStatus("aiAdvisor", phase3FeatureFlags.aiAdvisor)}
        </span>
      </Link>
      <Link
        className="flex min-h-14 items-center justify-between rounded-2xl bg-card px-6 py-5 text-base font-semibold shadow-sm border border-gray-100 transition-all duration-150 hover:shadow-md active:scale-[0.99]"
        href="/more/automation"
      >
        Automations
        <span className="text-sm text-textMuted">
          {getPhase3NavigationStatus("whatsappAutomation", phase3FeatureFlags.whatsappAutomation)}
        </span>
      </Link>
      <Link
        className="flex min-h-14 items-center justify-between rounded-2xl bg-card px-6 py-5 text-base font-semibold shadow-sm border border-gray-100 transition-all duration-150 hover:shadow-md active:scale-[0.99]"
        href="/legal"
      >
        Legal
        <span className="text-sm text-textMuted">Policies</span>
      </Link>
      <section className="rounded-2xl border border-gray-100 bg-card p-6 shadow-sm">
        <h2 className="text-base font-semibold">Legal & account</h2>
        <div className="mt-4 grid gap-3 text-sm font-medium text-textPrimary">
          <Link className="flex min-h-11 items-center justify-between rounded-xl bg-background px-4 py-3 transition hover:shadow-sm active:scale-[0.99]" href="/legal/privacy-policy">
            Privacy Policy
            <span className="text-xs text-textMuted">Open</span>
          </Link>
          <Link className="flex min-h-11 items-center justify-between rounded-xl bg-background px-4 py-3 transition hover:shadow-sm active:scale-[0.99]" href="/legal/terms-of-service">
            Terms of Service
            <span className="text-xs text-textMuted">Open</span>
          </Link>
          <Link className="flex min-h-11 items-center justify-between rounded-xl bg-background px-4 py-3 transition hover:shadow-sm active:scale-[0.99]" href="/legal/financial-disclaimer">
            Financial Disclaimer
            <span className="text-xs text-textMuted">Open</span>
          </Link>
          <Link className="flex min-h-11 items-center justify-between rounded-xl bg-background px-4 py-3 transition hover:shadow-sm active:scale-[0.99]" href="/legal/data-security">
            Data Security
            <span className="text-xs text-textMuted">Open</span>
          </Link>
          <Link className="flex min-h-11 items-center justify-between rounded-xl bg-background px-4 py-3 transition hover:shadow-sm active:scale-[0.99]" href="/more/delete-account">
            Delete account
            <span className="text-xs text-textMuted">Request</span>
          </Link>
        </div>
      </section>
      <ReceiptSettingsPanel config={state.receiptConfig} onSave={saveReceiptConfig} />
      <Phase2SettingsPanel businessId={state.businessId} onNotice={setNotice} />
      <OfflineSyncReviewPanel businessId={state.businessId} onNotice={setNotice} />
      <PaidTierPanel businessId={state.businessId} onNotice={setNotice} />
      <OperationsPanel businessId={state.businessId} onNotice={setNotice} />
      <button
        className="min-h-14 w-full rounded-2xl border border-danger/20 bg-card px-6 py-4 text-left text-sm font-semibold text-danger shadow-sm transition-all duration-150 hover:shadow-md active:scale-[0.99]"
        type="button"
        onClick={signOut}
      >
        Sign out
      </button>
    </main>
  );
}

function MoreLink({
  href,
  icon,
  label,
  meta,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  meta: string;
}) {
  return (
    <Link
      className="flex min-h-14 items-center justify-between rounded-2xl border border-gray-100 bg-card px-5 py-4 text-sm font-semibold shadow-sm transition-all duration-150 hover:shadow-md active:scale-[0.99]"
      href={href}
    >
      <span className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-background text-primary">
          {icon}
        </span>
        {label}
      </span>
      <span className="text-xs text-textMuted">{meta}</span>
    </Link>
  );
}

function phase2Meta(access: Phase2NavigationAccess) {
  return {
    available: "Available",
    "flag-disabled": "Unavailable",
    upgrade: "Upgrade",
    permission: "No access",
  }[access.reason];
}

function combinedPhase2Meta(accesses: Phase2NavigationAccess[]) {
  if (accesses.some((access) => access.reason === "upgrade")) {
    return "Upgrade";
  }

  if (accesses.some((access) => access.reason === "permission")) {
    return "No access";
  }

  return "Unavailable";
}

function staffMeta(state: MoneybookState) {
  if (!hasEntitlement(state, "team_management")) {
    return "Upgrade";
  }

  return hasClientPermission(state, "canManageStaff") ? "Available" : "No access";
}

function roleLabel(role?: "owner" | "accountant" | "staff") {
  return {
    owner: "Owner",
    staff: "Staff",
    accountant: "Accountant",
  }[role ?? "owner"];
}

function roleDescription(role?: "owner" | "accountant" | "staff") {
  return {
    owner: "Full access to money, stock, people, and reports.",
    staff: "Sales access only.",
    accountant: "Reports access only.",
  }[role ?? "owner"];
}
