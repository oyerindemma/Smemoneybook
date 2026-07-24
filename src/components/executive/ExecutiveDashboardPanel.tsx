"use client";

import {
  AlertTriangle,
  BarChart3,
  ClipboardList,
  Download,
  LineChart,
  RefreshCw,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardProvider";
import type {
  ExecutiveDashboardDrilldown,
  ExecutiveDashboardDrilldownType,
  ExecutiveDashboardMetric,
  ExecutiveDashboardPeriodPreset,
  ExecutiveDashboardSummary,
} from "@/lib/executive-dashboard/definitions";

const presets: Array<{ value: ExecutiveDashboardPeriodPreset; label: string }> = [
  { value: "today", label: "Today" },
  { value: "last_7_days", label: "Last 7 days" },
  { value: "this_month", label: "This month" },
  { value: "previous_month", label: "Previous month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
  { value: "custom", label: "Custom" },
];

export function ExecutiveDashboardPanel() {
  const { state, setNotice } = useDashboard();
  const [preset, setPreset] = useState<ExecutiveDashboardPeriodPreset>("this_month");
  const [from, setFrom] = useState(new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1)).toISOString().slice(0, 10));
  const [dashboard, setDashboard] = useState<ExecutiveDashboardSummary | null>(null);
  const [drilldown, setDrilldown] = useState<ExecutiveDashboardDrilldown | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  const canView = state.permissions?.canViewExecutiveDashboard !== false;
  const canExport = state.permissions?.canExportExecutiveDashboard !== false;

  const params = useMemo(() => {
    const next = new URLSearchParams({ preset });

    if (state.businessId) {
      next.set("businessId", state.businessId);
    }

    if (state.selectedLocationId) {
      next.set("locationId", state.selectedLocationId);
    }

    if (preset === "custom") {
      next.set("from", from);
      next.set("to", to);
    }

    return next;
  }, [from, preset, state.businessId, state.selectedLocationId, to]);

  const loadDashboard = useCallback(async () => {
    if (!state.businessId || !canView) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/executive-dashboard/summary?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as
        | { dashboard?: ExecutiveDashboardSummary; error?: string }
        | null;

      if (!response.ok || !payload?.dashboard) {
        throw new Error(payload?.error ?? "Could not load Executive Dashboard.");
      }

      setDashboard(payload.dashboard);
      setDrilldown(null);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Could not load Executive Dashboard.";
      setError(message);
      setNotice(message);
    } finally {
      setLoading(false);
    }
  }, [canView, params, setNotice, state.businessId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDashboard();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadDashboard]);

  async function refreshDashboard() {
    if (!state.businessId) {
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`/api/executive-dashboard/refresh?${params.toString()}`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as
        | { dashboard?: ExecutiveDashboardSummary; error?: string; message?: string }
        | null;

      if (!response.ok || !payload?.dashboard) {
        throw new Error(payload?.error ?? "Could not refresh Executive Dashboard.");
      }

      setDashboard(payload.dashboard);
      setDrilldown(null);
      setNotice(payload.message ?? "Executive Dashboard refreshed.");
    } catch (refreshError) {
      setNotice(refreshError instanceof Error ? refreshError.message : "Could not refresh Executive Dashboard.");
    } finally {
      setLoading(false);
    }
  }

  async function openDrilldown(type: ExecutiveDashboardDrilldownType) {
    if (!state.businessId) {
      return;
    }

    const nextParams = new URLSearchParams(params);
    nextParams.set("type", type);

    const response = await fetch(`/api/executive-dashboard/drilldown?${nextParams.toString()}`, {
      credentials: "include",
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as
      | { drilldown?: ExecutiveDashboardDrilldown; error?: string }
      | null;

    if (!response.ok || !payload?.drilldown) {
      setNotice(payload?.error ?? "Could not open Executive Dashboard drill-down.");
      return;
    }

    setDrilldown(payload.drilldown);
  }

  async function exportDashboard() {
    if (!state.businessId || !dashboard || exporting || !canExport) {
      return;
    }

    setExporting(true);

    try {
      const response = await fetch(`/api/executive-dashboard/export?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Could not export Executive Dashboard.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = getFilename(response.headers.get("Content-Disposition")) ?? "executive-dashboard.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice("Executive Dashboard exported.");
    } catch (exportError) {
      setNotice(exportError instanceof Error ? exportError.message : "Could not export Executive Dashboard.");
    } finally {
      setExporting(false);
    }
  }

  if (!canView) {
    return (
      <section className="rounded-lg border border-gray-100 bg-card p-5 shadow-sm">
        <p className="text-sm font-semibold text-textPrimary">Executive Dashboard unavailable</p>
        <p className="mt-2 text-sm leading-6 text-textSecondary">
          You do not have permission to view Executive Dashboard.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="rounded-lg border border-gray-100 bg-card p-4 shadow-sm md:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="text-xs font-semibold text-textSecondary">
              Period
              <select
                className="mt-1 min-h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-textPrimary"
                value={preset}
                onChange={(event) => setPreset(event.target.value as ExecutiveDashboardPeriodPreset)}
              >
                {presets.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
            {preset === "custom" ? (
              <>
                <label className="text-xs font-semibold text-textSecondary">
                  From
                  <input
                    className="mt-1 min-h-10 w-full rounded-lg border border-gray-200 px-3 text-sm font-medium text-textPrimary"
                    type="date"
                    value={from}
                    onChange={(event) => setFrom(event.target.value)}
                  />
                </label>
                <label className="text-xs font-semibold text-textSecondary">
                  To
                  <input
                    className="mt-1 min-h-10 w-full rounded-lg border border-gray-200 px-3 text-sm font-medium text-textPrimary"
                    type="date"
                    value={to}
                    onChange={(event) => setTo(event.target.value)}
                  />
                </label>
              </>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-textPrimary transition hover:bg-background disabled:opacity-60"
              type="button"
              disabled={loading}
              onClick={() => void refreshDashboard()}
              title="Refresh Executive Dashboard"
              aria-label="Refresh Executive Dashboard"
            >
              <RefreshCw className={loading ? "animate-spin" : ""} size={16} aria-hidden="true" />
              Refresh
            </button>
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
              type="button"
              disabled={!dashboard || !canExport || exporting}
              onClick={() => void exportDashboard()}
              title="Export Executive Dashboard"
              aria-label="Export Executive Dashboard"
            >
              {exporting ? <RefreshCw className="animate-spin" size={16} aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
              Export
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-700">
          {error}
        </div>
      ) : null}

      {loading && !dashboard ? (
        <div className="grid gap-3 md:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div className="h-28 animate-pulse rounded-lg bg-card shadow-sm" key={item} />
          ))}
        </div>
      ) : dashboard ? (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <MetricCard title="Sales" metric={dashboard.headline.sales} currency={dashboard.business.currency} onOpen={() => void openDrilldown("revenue")} />
            <MetricCard title="Expenses" metric={dashboard.headline.expenses} currency={dashboard.business.currency} onOpen={() => void openDrilldown("expenses")} />
            <MetricCard title="Profit" metric={dashboard.headline.profit} currency={dashboard.business.currency} />
            <MetricCard title="Customers owing" metric={dashboard.headline.customersOwing} currency={dashboard.business.currency} onOpen={() => void openDrilldown("receivables")} />
            <MetricCard title="Supplier bills" metric={dashboard.headline.supplierBills} currency={dashboard.business.currency} onOpen={() => void openDrilldown("payables")} />
            <MetricCard title="Stock value" metric={dashboard.headline.stockValue} currency={dashboard.business.currency} onOpen={() => void openDrilldown("stock")} />
            <MetricCard title="Bank entries to review" metric={dashboard.headline.bankEntriesToReview} currency={dashboard.business.currency} onOpen={() => void openDrilldown("reconciliation")} />
            <MetricCard title="Tax items to review" metric={dashboard.headline.taxItemsToReview} currency={dashboard.business.currency} onOpen={() => void openDrilldown("tax")} />
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-5">
              <section className="rounded-lg border border-gray-100 bg-card p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <LineChart size={18} aria-hidden="true" />
                  <h2 className="text-base font-semibold text-textPrimary">Revenue and expense trend</h2>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <CompactMetric label="Paid sales" metric={dashboard.revenue.paidSales} currency={dashboard.business.currency} />
                  <CompactMetric label="Credit sales" metric={dashboard.revenue.creditSales} currency={dashboard.business.currency} />
                  <CompactMetric label="Average sale" metric={dashboard.revenue.averageSaleValue} currency={dashboard.business.currency} />
                  <CompactMetric label="Gross profit" metric={dashboard.profit.recordedGrossProfit} currency={dashboard.business.currency} />
                  <CompactMetric label="Margin" metric={dashboard.profit.marginPercentage} currency={dashboard.business.currency} />
                  <CompactMetric label="Net movement" metric={dashboard.cash.netMovement} currency={dashboard.business.currency} />
                </div>
                <BreakdownList title="Expense categories" items={dashboard.expenses.categories} currency={dashboard.business.currency} />
              </section>

              <section className="rounded-lg border border-gray-100 bg-card p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <BarChart3 size={18} aria-hidden="true" />
                  <h2 className="text-base font-semibold text-textPrimary">Operations</h2>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <CompactMetric label="Bank matched" metric={dashboard.reconciliation.matchedAmount} currency={dashboard.business.currency} />
                  <CompactMetric label="Reconciliation rate" metric={dashboard.reconciliation.reconciliationRate} currency={dashboard.business.currency} />
                  <CompactMetric label="Low stock items" metric={dashboard.stock.lowStockItems} currency={dashboard.business.currency} />
                  <CompactMetric label="Warehouse count" metric={dashboard.stock.warehouseCount} currency={dashboard.business.currency} />
                  <CompactMetric label="Active staff" metric={dashboard.staff.activeStaff} currency={dashboard.business.currency} />
                  <CompactMetric label="Tax completeness" metric={dashboard.taxReadiness.dataCompleteness} currency={dashboard.business.currency} />
                </div>
                <p className="mt-4 rounded-lg bg-background p-3 text-sm leading-6 text-textSecondary">
                  {dashboard.cash.disclosure}
                </p>
              </section>

              {drilldown ? (
                <section className="rounded-lg border border-gray-100 bg-card p-5 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Search size={18} aria-hidden="true" />
                    <h2 className="text-base font-semibold text-textPrimary">Drill-down</h2>
                  </div>
                  <p className="mt-1 text-sm text-textSecondary">{drilldown.type} · {drilldown.total} records</p>
                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <tbody className="divide-y divide-gray-100">
                        {drilldown.rows.slice(0, 8).map((row, index) => (
                          <tr key={`${drilldown.type}-${index}`}>
                            <td className="py-2 pr-3 font-semibold text-textPrimary">{Object.values(row)[1] ?? Object.values(row)[0]}</td>
                            <td className="py-2 text-textSecondary">{Object.values(row).slice(2, 5).join(" · ")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : null}
            </div>

            <div className="space-y-5">
              <section className="rounded-lg border border-gray-100 bg-card p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={18} aria-hidden="true" />
                  <h2 className="text-base font-semibold text-textPrimary">Attention required</h2>
                </div>
                <div className="mt-4 space-y-2">
                  {dashboard.attentionQueue.length ? (
                    dashboard.attentionQueue.map((item) => (
                      <button
                        className="block w-full rounded-lg border border-gray-100 p-3 text-left transition hover:border-primary/30 hover:bg-background"
                        key={item.id}
                        type="button"
                        onClick={() => item.drilldownType ? void openDrilldown(item.drilldownType) : undefined}
                      >
                        <span className="text-xs font-semibold uppercase text-textMuted">{item.severity}</span>
                        <span className="mt-1 block text-sm font-semibold text-textPrimary">{item.title}</span>
                        <span className="mt-1 block text-sm leading-5 text-textSecondary">{item.detail}</span>
                      </button>
                    ))
                  ) : (
                    <p className="rounded-lg bg-background p-3 text-sm font-medium text-textSecondary">
                      No urgent review items for this period.
                    </p>
                  )}
                </div>
              </section>

              <section className="rounded-lg border border-gray-100 bg-card p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <ClipboardList size={18} aria-hidden="true" />
                  <h2 className="text-base font-semibold text-textPrimary">Data quality</h2>
                </div>
                <p className="mt-3 text-sm font-semibold text-textPrimary">{dashboard.dataQuality.status.replace(/_/g, " ")}</p>
                <div className="mt-3 space-y-2">
                  {dashboard.dataQuality.notes.length ? (
                    dashboard.dataQuality.notes.map((note) => (
                      <p className="rounded-lg bg-background p-3 text-sm leading-5 text-textSecondary" key={note}>{note}</p>
                    ))
                  ) : (
                    <p className="rounded-lg bg-background p-3 text-sm leading-5 text-textSecondary">
                      Core source checks are complete for this period.
                    </p>
                  )}
                </div>
                <div className="mt-4 space-y-2 text-xs leading-5 text-textMuted">
                  {dashboard.assumptions.slice(0, 4).map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-lg bg-card p-5 text-sm font-medium text-textSecondary shadow-sm">
          Executive Dashboard is not available for this period.
        </div>
      )}
    </section>
  );
}

function MetricCard({
  title,
  metric,
  currency,
  onOpen,
}: {
  title: string;
  metric: ExecutiveDashboardMetric;
  currency: string;
  onOpen?: () => void;
}) {
  return (
    <button
      className="min-h-28 rounded-lg border border-gray-100 bg-card p-4 text-left shadow-sm transition hover:border-primary/30 hover:shadow-md disabled:hover:border-gray-100 disabled:hover:shadow-sm"
      type="button"
      onClick={onOpen}
      disabled={!onOpen}
    >
      <p className="text-xs font-semibold text-textMuted">{title}</p>
      <p className="mt-2 text-lg font-semibold text-textPrimary">{formatMetric(metric, currency)}</p>
      <p className="mt-2 text-xs font-medium text-textSecondary">{changeText(metric)}</p>
    </button>
  );
}

function CompactMetric({ label, metric, currency }: { label: string; metric: ExecutiveDashboardMetric; currency: string }) {
  return (
    <div className="rounded-lg bg-background p-3">
      <p className="text-xs font-semibold text-textMuted">{label}</p>
      <p className="mt-1 text-sm font-semibold text-textPrimary">{formatMetric(metric, currency)}</p>
      <p className="mt-1 text-xs text-textSecondary">{metric.dataQualityStatus.replace(/_/g, " ")}</p>
    </div>
  );
}

function BreakdownList({ title, items, currency }: { title: string; items: Array<{ label: string; value: number; count?: number }>; currency: string }) {
  if (!items.length) {
    return null;
  }

  return (
    <div className="mt-4 rounded-lg bg-background p-3">
      <p className="text-xs font-semibold text-textMuted">{title}</p>
      <div className="mt-2 grid gap-2 md:grid-cols-2">
        {items.slice(0, 6).map((item) => (
          <div className="flex items-center justify-between gap-3 text-sm" key={item.label}>
            <span className="truncate text-textSecondary">{item.label}</span>
            <span className="font-semibold text-textPrimary">{formatCurrency(item.value, currency)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatMetric(metric: ExecutiveDashboardMetric, currency: string) {
  if (typeof metric.value === "string") {
    return metric.value;
  }

  if (metric.unit === "percent") {
    return `${metric.value}%`;
  }

  if (metric.unit === "count") {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(metric.value);
  }

  return formatCurrency(metric.value, currency);
}

function changeText(metric: ExecutiveDashboardMetric) {
  if (!metric.change) {
    return metric.dataQualityStatus.replace(/_/g, " ");
  }

  const percent = metric.change.percent === null ? "new" : `${metric.change.percent}%`;
  return `${metric.change.direction} ${percent} vs comparison`;
}

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function getFilename(disposition: string | null) {
  const match = disposition?.match(/filename="([^"]+)"/);
  return match?.[1];
}
