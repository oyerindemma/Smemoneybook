"use client";

import {
  AlertCircle,
  BarChart3,
  CalendarDays,
  Download,
  RefreshCw,
  Search,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardProvider";
import {
  staffPerformanceDisclaimer,
  type StaffPerformanceDatePreset,
  type StaffPerformanceRow,
  type StaffPerformanceSummary,
} from "@/lib/staff-performance/definitions";

const rangeOptions: Array<{ value: StaffPerformanceDatePreset; label: string }> = [
  { value: "today", label: "Today" },
  { value: "last_7_days", label: "Last 7 days" },
  { value: "this_month", label: "This month" },
  { value: "previous_month", label: "Previous month" },
  { value: "custom", label: "Custom" },
];

export function StaffPerformancePanel() {
  const { state, setNotice } = useDashboard();
  const [summary, setSummary] = useState<StaffPerformanceSummary | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [detailRow, setDetailRow] = useState<StaffPerformanceRow | null>(null);
  const [range, setRange] = useState<StaffPerformanceDatePreset>("this_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [locationId, setLocationId] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currency = state.currency ?? "NGN";

  const queryString = useMemo(() => {
    if (!state.businessId) {
      return "";
    }

    const params = new URLSearchParams({
      businessId: state.businessId,
      range,
    });

    if (locationId) {
      params.set("locationId", locationId);
    }

    if (range === "custom") {
      if (!customFrom || !customTo) {
        return "";
      }

      params.set("from", customFrom);
      params.set("to", customTo);
    }

    return params.toString();
  }, [customFrom, customTo, locationId, range, state.businessId]);

  useEffect(() => {
    let mounted = true;

    async function loadSummary() {
      if (!queryString) {
        setSummary(null);
        setSelectedStaffId(null);
        setDetailRow(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/staff-performance/summary?${queryString}`, {
          credentials: "include",
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as
          | { summary?: StaffPerformanceSummary; error?: string }
          | null;

        if (!response.ok || !payload?.summary) {
          throw new Error(payload?.error ?? "Could not load staff performance.");
        }

        if (mounted) {
          setSummary(payload.summary);
          setSelectedStaffId(payload.summary.rows[0]?.staff.userId ?? null);
          setDetailRow(payload.summary.rows[0] ?? null);
        }
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : "Could not load staff performance.";

        if (mounted) {
          setError(message);
          setSummary(null);
          setSelectedStaffId(null);
          setDetailRow(null);
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
  }, [queryString]);

  async function refreshSummary() {
    if (!queryString) {
      setError("Choose a complete date range.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/staff-performance/summary?${queryString}`, {
        credentials: "include",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as
        | { summary?: StaffPerformanceSummary; error?: string }
        | null;

      if (!response.ok || !payload?.summary) {
        throw new Error(payload?.error ?? "Could not refresh staff performance.");
      }

      setSummary(payload.summary);
      const nextSelected = selectedStaffId && payload.summary.rows.some((row) => row.staff.userId === selectedStaffId)
        ? selectedStaffId
        : payload.summary.rows[0]?.staff.userId ?? null;
      setSelectedStaffId(nextSelected);
      setDetailRow(payload.summary.rows.find((row) => row.staff.userId === nextSelected) ?? null);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Could not refresh staff performance.");
    } finally {
      setLoading(false);
    }
  }

  async function selectStaff(staffId: string) {
    setSelectedStaffId(staffId);
    setDetailLoading(true);

    try {
      const response = await fetch(`/api/staff-performance/${staffId}?${queryString}`, {
        credentials: "include",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as
        | { row?: StaffPerformanceRow | null; error?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not load staff detail.");
      }

      setDetailRow(payload?.row ?? summary?.rows.find((row) => row.staff.userId === staffId) ?? null);
    } catch (detailError) {
      setNotice(detailError instanceof Error ? detailError.message : "Could not load staff detail.");
      setDetailRow(summary?.rows.find((row) => row.staff.userId === staffId) ?? null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function exportCsv() {
    if (!queryString || exporting) {
      return;
    }

    setExporting(true);

    try {
      const response = await fetch(`/api/staff-performance/export?${queryString}`, {
        credentials: "include",
        cache: "no-store",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Could not export staff performance.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const disposition = response.headers.get("Content-Disposition") ?? "";
      link.href = url;
      link.download = getFilename(disposition) ?? "staff-performance.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice("Staff performance CSV export started.");
    } catch (exportError) {
      setNotice(exportError instanceof Error ? exportError.message : "Could not export staff performance.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-gray-100 bg-card p-4 shadow-sm md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <BarChart3 size={19} aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-medium text-textSecondary">Staff performance</p>
              <h2 className="mt-1 text-base font-semibold text-textPrimary">
                {summary ? `${summary.rows.length} staff members` : "Operational activity"}
              </h2>
              <p className="mt-1 text-xs text-textMuted">{staffPerformanceDisclaimer}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-textPrimary transition hover:bg-background disabled:opacity-60"
              type="button"
              disabled={loading}
              onClick={refreshSummary}
            >
              <RefreshCw className={loading ? "animate-spin" : ""} size={16} aria-hidden="true" />
              Refresh
            </button>
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-white transition hover:bg-primaryHover disabled:opacity-60"
              type="button"
              disabled={!summary || exporting}
              onClick={exportCsv}
            >
              {exporting ? <RefreshCw className="animate-spin" size={16} aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
              Export
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[1.2fr_1fr] lg:grid-cols-[1fr_1fr_1fr]">
          <label className="text-xs font-semibold text-textSecondary">
            Date range
            <select
              className="mt-2 min-h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-textPrimary outline-none"
              value={range}
              onChange={(event) => setRange(event.target.value as StaffPerformanceDatePreset)}
            >
              {rangeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-semibold text-textSecondary">
            Location
            <select
              className="mt-2 min-h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-textPrimary outline-none"
              value={locationId}
              onChange={(event) => setLocationId(event.target.value)}
            >
              <option value="">All locations</option>
              {(state.locations ?? []).map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>

          {range === "custom" ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:col-span-1">
              <DateInput label="From" value={customFrom} onChange={setCustomFrom} />
              <DateInput label="To" value={customTo} onChange={setCustomTo} />
            </div>
          ) : (
            <div className="hidden items-end gap-2 text-xs text-textMuted lg:flex">
              <CalendarDays size={16} aria-hidden="true" />
              <span>{summary?.period.label ?? "Current period"}</span>
            </div>
          )}
        </div>
      </div>

      {error ? <Notice tone="error" message={error} /> : null}
      {!queryString && range === "custom" ? <Notice tone="info" message="Choose both custom dates to load the report." /> : null}

      {loading ? (
        <LoadingState />
      ) : summary && summary.rows.length > 0 ? (
        <>
          <SummaryCards summary={summary} currency={currency} />
          {summary.summaryCards.unattributedRecords > 0 ? (
            <Notice
              tone="info"
              message={`${summary.summaryCards.unattributedRecords} records are reported separately because staff or location attribution is incomplete.`}
            />
          ) : null}
          {summary.dataQualityNotes.length > 0 ? (
            <Notice tone="info" message={summary.dataQualityNotes.join(" ")} />
          ) : null}
          <StaffTable
            rows={summary.rows}
            currency={currency}
            selectedStaffId={selectedStaffId}
            onSelectStaff={selectStaff}
          />
          <StaffDetail row={detailRow} loading={detailLoading} currency={currency} />
        </>
      ) : summary ? (
        <EmptyState />
      ) : null}
    </section>
  );
}

function SummaryCards({ summary, currency }: { summary: StaffPerformanceSummary; currency: string }) {
  const cards = [
    {
      label: "Attributed sales",
      value: formatCurrency(summary.summaryCards.attributedSalesAmount, currency),
    },
    {
      label: "Sales transactions",
      value: String(summary.summaryCards.salesTransactions),
    },
    {
      label: "Average sale",
      value: formatCurrency(summary.summaryCards.averageTransactionValue, currency),
    },
    {
      label: "Active staff",
      value: String(summary.summaryCards.activeStaff),
    },
    {
      label: "Unattributed",
      value: String(summary.summaryCards.unattributedRecords),
    },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => (
        <div className="rounded-lg border border-gray-100 bg-card p-4 shadow-sm" key={card.label}>
          <p className="text-xs font-medium text-textMuted">{card.label}</p>
          <p className="mt-2 text-lg font-semibold text-textPrimary">{card.value}</p>
        </div>
      ))}
    </div>
  );
}

function StaffTable({
  rows,
  currency,
  selectedStaffId,
  onSelectStaff,
}: {
  rows: StaffPerformanceRow[];
  currency: string;
  selectedStaffId: string | null;
  onSelectStaff: (staffId: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-100 bg-card shadow-sm">
      <div className="max-w-full overflow-x-auto">
        <table className="min-w-[980px] w-full border-collapse text-left text-sm">
          <thead className="bg-background text-xs font-semibold uppercase text-textMuted">
            <tr>
              <th className="px-4 py-3">Staff</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Sales recorded</th>
              <th className="px-4 py-3">Transactions</th>
              <th className="px-4 py-3">Average sale</th>
              <th className="px-4 py-3">Expenses recorded</th>
              <th className="px-4 py-3">Stock actions</th>
              <th className="px-4 py-3">Reversals</th>
              <th className="px-4 py-3">Active days</th>
              <th className="px-4 py-3">Last activity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => {
              const selected = row.staff.userId === selectedStaffId;
              const stockActions = row.metrics.stockInOperations + row.metrics.stockOutOperations;

              return (
                <tr className={selected ? "bg-primary/5" : "bg-card"} key={row.staff.userId}>
                  <td className="px-4 py-3">
                    <button
                      className="inline-flex items-center gap-2 text-left font-semibold text-primary"
                      type="button"
                      onClick={() => onSelectStaff(row.staff.userId)}
                    >
                      <UserRound size={16} aria-hidden="true" />
                      {row.staff.name}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-textSecondary">{formatRole(row.staff.role)}</td>
                  <td className="px-4 py-3 font-medium text-textPrimary">
                    {formatCurrency(row.metrics.salesAmountRecorded, currency)}
                  </td>
                  <td className="px-4 py-3 text-textSecondary">{row.metrics.salesTransactions}</td>
                  <td className="px-4 py-3 text-textSecondary">
                    {formatCurrency(row.metrics.averageTransactionValue, currency)}
                  </td>
                  <td className="px-4 py-3 text-textSecondary">{row.metrics.expensesRecorded}</td>
                  <td className="px-4 py-3 text-textSecondary">{stockActions}</td>
                  <td className="px-4 py-3 text-textSecondary">{row.metrics.reversalsCorrections}</td>
                  <td className="px-4 py-3 text-textSecondary">{row.metrics.activeDays}</td>
                  <td className="px-4 py-3 text-textSecondary">
                    {row.metrics.lastRecordedActivity ? formatDateTime(row.metrics.lastRecordedActivity) : "No activity"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StaffDetail({
  row,
  loading,
  currency,
}: {
  row: StaffPerformanceRow | null;
  loading: boolean;
  currency: string;
}) {
  if (!row) {
    return null;
  }

  const salesDelta = row.metrics.salesAmountRecorded - row.comparison.salesAmountRecorded;
  const transactionDelta = row.metrics.salesTransactions - row.comparison.salesTransactions;

  return (
    <aside className="rounded-lg border border-gray-100 bg-card p-4 shadow-sm md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-textSecondary">Staff detail</p>
          <h3 className="mt-1 text-base font-semibold text-textPrimary">{row.staff.name}</h3>
          <p className="mt-1 text-xs text-textMuted">{formatRole(row.staff.role)}</p>
        </div>
        {loading ? <RefreshCw className="animate-spin text-textMuted" size={18} aria-hidden="true" /> : null}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <DetailMetric label="Sales recorded" value={formatCurrency(row.metrics.salesAmountRecorded, currency)} />
        <DetailMetric label="Transactions" value={String(row.metrics.salesTransactions)} />
        <DetailMetric label="Sales contribution" value={`${row.metrics.salesContributionPercent}%`} />
        <DetailMetric label="Debt collections" value={String(row.metrics.debtCollectionsRecorded)} />
        <DetailMetric label="Supplier settlements" value={String(row.metrics.supplierSettlementsRecorded)} />
        <DetailMetric label="Transfer actions" value={String(row.metrics.warehouseTransferActions)} />
      </div>

      <div className="mt-4 rounded-lg bg-background p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-textPrimary">
          <Search size={16} aria-hidden="true" />
          Trend comparison
        </div>
        <div className="mt-3 grid gap-2 text-sm text-textSecondary md:grid-cols-3">
          <TrendLine label="Sales" value={formatSignedCurrency(salesDelta, currency)} />
          <TrendLine label="Transactions" value={formatSignedNumber(transactionDelta)} />
          <TrendLine label="Active days" value={formatSignedNumber(row.metrics.activeDays - row.comparison.activeDays)} />
        </div>
      </div>

      {row.dataQualityNotes.length > 0 ? (
        <p className="mt-4 text-xs leading-5 text-textMuted">{row.dataQualityNotes.join(" ")}</p>
      ) : null}
    </aside>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-background p-3">
      <p className="text-xs font-medium text-textMuted">{label}</p>
      <p className="mt-1 text-sm font-semibold text-textPrimary">{value}</p>
    </div>
  );
}

function TrendLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <span className="font-semibold text-textPrimary">{value}</span>
    </p>
  );
}

function DateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs font-semibold text-textSecondary">
      {label}
      <input
        className="mt-2 min-h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-textPrimary outline-none"
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Notice({ tone, message }: { tone: "error" | "info"; message: string }) {
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
        tone === "error"
          ? "border-red-100 bg-red-50 text-red-700"
          : "border-blue-100 bg-blue-50 text-blue-800"
      }`}
    >
      <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {[0, 1, 2].map((item) => (
        <div className="h-28 animate-pulse rounded-lg bg-card shadow-sm" key={item} />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-gray-100 bg-card p-6 text-sm font-medium text-textSecondary shadow-sm">
      No attributed staff activity is available for this period.
    </div>
  );
}

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatSignedCurrency(value: number, currency: string) {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatCurrency(value, currency)}`;
}

function formatSignedNumber(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatRole(role: string) {
  return role.toLowerCase().replace(/^./, (value) => value.toUpperCase());
}

function getFilename(contentDisposition: string) {
  const match = /filename="?([^"]+)"?/i.exec(contentDisposition);
  return match?.[1] ?? null;
}
