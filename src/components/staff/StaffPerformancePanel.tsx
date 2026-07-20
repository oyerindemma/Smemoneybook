"use client";

import { RefreshCw, Save, Target } from "lucide-react";
import { useEffect, useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardProvider";
import type { StaffPerformanceSummary } from "@/lib/phase3/staff-performance";

export function StaffPerformancePanel() {
  const { state, setNotice } = useDashboard();
  const [summary, setSummary] = useState<StaffPerformanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function fetchSummary() {
    if (!state.businessId) {
      return null;
    }

    const params = new URLSearchParams({ businessId: state.businessId });
    if (state.selectedLocationId) {
      params.set("locationId", state.selectedLocationId);
    }

    const response = await fetch(`/api/staff-performance?${params.toString()}`, {
      credentials: "include",
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as
      | { summary?: StaffPerformanceSummary; error?: string }
      | null;

    if (!response.ok || !payload?.summary) {
      throw new Error(payload?.error ?? "Could not load staff performance.");
    }

    return payload.summary;
  }

  useEffect(() => {
    let mounted = true;

    async function loadSummary() {
      try {
        const nextSummary = await fetchSummary();

        if (mounted) {
          setSummary(nextSummary);
        }
      } catch (error) {
        if (mounted) {
          setNotice(error instanceof Error ? error.message : "Could not load staff performance.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadSummary();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.businessId, state.selectedLocationId]);

  async function refreshSummary() {
    setLoading(true);
    try {
      setSummary(await fetchSummary());
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load staff performance.");
    } finally {
      setLoading(false);
    }
  }

  async function saveSnapshot() {
    if (!state.businessId || !summary || saving) {
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/staff-performance", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_snapshot",
          businessId: state.businessId,
          locationId: state.selectedLocationId,
          periodStart: summary.periodStart,
          periodEnd: summary.periodEnd,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not save staff performance snapshot.");
      }

      setNotice(payload?.message ?? "Staff performance snapshot saved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save staff performance snapshot.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-gray-100 bg-card p-5 shadow-sm md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Target size={20} aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-medium text-textSecondary">Staff performance</p>
            <h2 className="text-lg font-semibold tracking-tight text-textPrimary">
              {loading ? "Loading..." : `${summary?.rows.length ?? 0} people reviewed`}
            </h2>
            <p className="mt-1 text-xs text-textMuted">Transparent business activity only</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-gray-200 px-4 text-sm font-semibold text-textPrimary transition hover:bg-background disabled:opacity-60"
            type="button"
            disabled={loading}
            onClick={refreshSummary}
          >
            <RefreshCw size={16} aria-hidden="true" />
            Refresh
          </button>
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-gray-200 px-4 text-sm font-semibold text-textPrimary transition hover:bg-background disabled:opacity-60"
            type="button"
            disabled={!summary || saving}
            onClick={saveSnapshot}
          >
            {saving ? <RefreshCw className="animate-spin" size={16} aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
            Save
          </button>
        </div>
      </div>

      {loading ? (
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div className="h-28 animate-pulse rounded-2xl bg-background" key={item} />
          ))}
        </div>
      ) : summary && summary.rows.length > 0 ? (
        <>
          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            {summary.rows.map((row) => (
              <div className="rounded-2xl bg-background p-4" key={row.userId}>
                <p className="font-semibold text-textPrimary">{row.name}</p>
                <p className="mt-1 text-xs text-textMuted">{row.role.toLowerCase()}</p>
                <div className="mt-4 grid gap-2 text-sm text-textSecondary">
                  <Line label="Sales" value={String(row.salesRecorded)} />
                  <Line label="Transactions" value={String(row.transactionsProcessed)} />
                  <Line label="Returns" value={String(row.returnsProcessed)} />
                  <Line label="Debt actions" value={String(row.debtActions)} />
                  <Line
                    label="Revenue"
                    value={row.revenueHandled === null ? "Unavailable" : formatCurrency(row.revenueHandled)}
                  />
                </div>
              </div>
            ))}
          </div>
          {summary.warnings[0] ? (
            <p className="mt-4 text-xs leading-5 text-textMuted">{summary.warnings[0]}</p>
          ) : null}
        </>
      ) : (
        <div className="mt-5 rounded-2xl bg-background p-4 text-sm font-medium text-textSecondary">
          No staff activity is available for this period.
        </div>
      )}
    </section>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <span className="font-semibold text-textPrimary">{value}</span>
    </p>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);
}
