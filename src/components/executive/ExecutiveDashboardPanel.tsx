"use client";

import { BarChart3, RefreshCw, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardProvider";
import type { ExecutiveDashboardSummary } from "@/lib/phase3/executive-dashboard";

export function ExecutiveDashboardPanel() {
  const { state, setNotice } = useDashboard();
  const [dashboard, setDashboard] = useState<ExecutiveDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function fetchDashboard() {
    if (!state.businessId) {
      return null;
    }

    const params = new URLSearchParams({ businessId: state.businessId });
    if (state.selectedLocationId) {
      params.set("locationId", state.selectedLocationId);
    }

    const response = await fetch(`/api/executive-dashboard?${params.toString()}`, {
      credentials: "include",
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as
      | { dashboard?: ExecutiveDashboardSummary; error?: string }
      | null;

    if (!response.ok || !payload?.dashboard) {
      throw new Error(payload?.error ?? "Could not load executive dashboard.");
    }

    return payload.dashboard;
  }

  useEffect(() => {
    let mounted = true;

    async function loadDashboard() {
      try {
        const nextDashboard = await fetchDashboard();

        if (mounted) {
          setDashboard(nextDashboard);
        }
      } catch (error) {
        if (mounted) {
          setNotice(error instanceof Error ? error.message : "Could not load executive dashboard.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.businessId, state.selectedLocationId]);

  async function refreshDashboard() {
    setLoading(true);
    try {
      setDashboard(await fetchDashboard());
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load executive dashboard.");
    } finally {
      setLoading(false);
    }
  }

  async function saveSnapshot() {
    if (!state.businessId || !dashboard || saving) {
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/executive-dashboard", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: state.businessId,
          locationId: state.selectedLocationId,
          periodStart: dashboard.periodStart,
          periodEnd: dashboard.periodEnd,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not save executive dashboard snapshot.");
      }

      setNotice(payload?.message ?? "Executive dashboard snapshot saved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save executive dashboard snapshot.");
    } finally {
      setSaving(false);
    }
  }

  const summary = dashboard?.summary;

  return (
    <section className="rounded-2xl border border-gray-100 bg-card p-5 shadow-sm md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <BarChart3 size={20} aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-medium text-textSecondary">Executive dashboard</p>
            <h2 className="text-lg font-semibold tracking-tight text-textPrimary">
              {loading ? "Loading..." : summary ? formatCurrency(summary.profit) : "Unavailable"}
            </h2>
            <p className="mt-1 text-xs text-textMuted">Profit, cash, debt, stock, and actions</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-gray-200 px-4 text-sm font-semibold text-textPrimary transition hover:bg-background disabled:opacity-60"
            type="button"
            disabled={loading}
            onClick={refreshDashboard}
          >
            <RefreshCw size={16} aria-hidden="true" />
            Refresh
          </button>
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-gray-200 px-4 text-sm font-semibold text-textPrimary transition hover:bg-background disabled:opacity-60"
            type="button"
            disabled={!dashboard || saving}
            onClick={saveSnapshot}
          >
            {saving ? <RefreshCw className="animate-spin" size={16} aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
            Save
          </button>
        </div>
      </div>

      {summary ? (
        <>
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <Metric label="Revenue" value={formatCurrency(summary.revenue)} />
            <Metric label="Expenses" value={formatCurrency(summary.expenses)} />
            <Metric label="Cash" value={formatCurrency(summary.cashAvailable)} />
            <Metric label="Debt owed" value={formatCurrency(summary.outstandingCustomerDebt)} />
          </div>
          {dashboard.recommendedActions[0] ? (
            <div className="mt-5 rounded-2xl bg-background p-4">
              <p className="text-xs font-semibold text-textMuted">Recommended action</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-textPrimary">{dashboard.recommendedActions[0]}</p>
            </div>
          ) : null}
        </>
      ) : loading ? (
        <div className="mt-5 h-28 animate-pulse rounded-2xl bg-background" />
      ) : (
        <div className="mt-5 rounded-2xl bg-background p-4 text-sm font-medium text-textSecondary">
          Executive dashboard is not available for this period.
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-background p-3">
      <p className="text-xs font-medium text-textMuted">{label}</p>
      <p className="mt-2 text-sm font-semibold text-textPrimary">{value}</p>
    </div>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);
}
