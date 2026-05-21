"use client";

import { EmptyState } from "@/components/dashboard/EmptyState";
import { ListSkeleton } from "@/components/dashboard/Skeleton";
import { useEffect, useState } from "react";
import type { MonthlyReport } from "@/components/dashboard/types";
import { formatNaira } from "@/lib/bookkeeping/transaction-engine";
import { trackProductEvent } from "@/lib/analytics/product-analytics";
import {
  buildReportShareText,
  getReferralLink,
  getWhatsAppShareUrl,
} from "@/lib/viral/referral-engine";

type ReportPeriod = "day" | "week" | "month";

export function ReportsPanel({
  businessId,
  onNotice,
  onUpgradePrompt,
}: {
  businessId?: string;
  onNotice: (message: string) => void;
  onUpgradePrompt?: (prompt: { title: string; description: string }) => void;
}) {
  const now = new Date();
  const [period, setPeriod] = useState<ReportPeriod>("month");
  const [date, setDate] = useState(now.toISOString().slice(0, 10));
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const query = buildReportQuery({ period, date, month, year, businessId });

  useEffect(() => {
    let isActive = true;

    async function loadReport() {
      setIsLoading(true);
      setReport(null);
      let response: Response;
      try {
        response = await fetch(`/api/reports/monthly?${query}`, {
          credentials: "include",
          cache: "no-store",
        });
      } catch {
        if (isActive) {
          setIsLoading(false);
          onNotice("Something went wrong. Check your internet and try again");
        }
        return;
      }
      const payload = (await response.json().catch(() => null)) as {
        report?: MonthlyReport;
        error?: string;
      } | null;

      if (!isActive) {
        return;
      }

      if (response.ok && payload?.report) {
        setReport(payload.report);
        setIsLoading(false);
        return;
      }

      setReport(null);
      setIsLoading(false);
      onNotice(payload?.error ?? "Something went wrong. Check your internet and try again");
    }

    void loadReport();

    return () => {
      isActive = false;
    };
  }, [onNotice, query]);

  async function saveVatSummary() {
    const response = await fetch(
      `/api/tax/summary?month=${month}&year=${year}${businessId ? `&businessId=${encodeURIComponent(businessId)}` : ""}`,
      {
      method: "POST",
      credentials: "include",
      },
    );
    const payload = (await response.json().catch(() => null)) as {
      message?: string;
      error?: string;
    } | null;

    onNotice(
      response.ok
        ? payload?.message ?? "VAT summary saved."
        : "Couldn’t save. Try again",
    );
  }

  async function saveSnapshot() {
    const response = await fetch(`/api/reports/snapshots?${query}`, {
      method: "POST",
      credentials: "include",
    });
    const payload = (await response.json().catch(() => null)) as {
      message?: string;
      error?: string;
    } | null;

    onNotice(
      response.ok
        ? payload?.message ?? "Report snapshot saved."
        : "Couldn’t save. Try again",
    );
  }

  const showExportPrompt = () =>
    onUpgradePrompt?.({
      title: "Unlock reports export",
      description: "Download CSV/PDF reports and share them with your accountant.",
    });

  function shareReport() {
    if (!report) {
      return;
    }

    const referralLink = getReferralLink({
      origin: typeof window === "undefined" ? undefined : window.location.origin,
      businessId,
      businessName: report.businessName,
    });
    trackProductEvent("viral_share_clicked", {
      kind: "report",
      channel: "whatsapp",
      period: report.period,
    });
    window.open(getWhatsAppShareUrl(buildReportShareText(report, referralLink)), "_blank", "noopener,noreferrer");
  }

  return (
    <section className="rounded-2xl bg-card p-6 shadow-sm border border-gray-100 transition hover:shadow-md sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-textSecondary">Reports</p>
          <h2 className="text-lg font-semibold">Business summary</h2>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <select
            className="h-10 rounded-xl border border-gray-200 bg-card px-3 text-sm"
            value={period}
            onChange={(event) => setPeriod(event.target.value as ReportPeriod)}
          >
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </select>
          {period === "month" ? (
            <>
              <select
                className="h-10 rounded-xl border border-gray-200 bg-card px-3 text-sm"
                value={month}
                onChange={(event) => setMonth(Number(event.target.value))}
              >
                {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => (
                  <option key={value} value={value}>
                    {String(value).padStart(2, "0")}
                  </option>
                ))}
              </select>
              <input
                className="h-10 rounded-xl border border-gray-200 px-3 text-sm"
                max="2100"
                min="2000"
                type="number"
                value={year}
                onChange={(event) => setYear(Number(event.target.value))}
              />
            </>
          ) : (
            <input
              className="h-10 rounded-xl border border-gray-200 px-3 text-sm sm:col-span-2"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          )}
        </div>
      </div>

      {report ? (
        <>
          <p className="mt-5 text-sm font-semibold text-textSecondary">{report.periodLabel}</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ReportTile label="Money in" value={formatNaira(report.salesTotal)} />
            <ReportTile label="Cash received" value={formatNaira(report.cashReceivedTotal)} />
            <ReportTile label="Pay later sales" value={formatNaira(report.creditSalesTotal)} />
            <ReportTile label="Profit" value={formatNaira(report.profitTotal)} />
            <ReportTile label="Money out" value={formatNaira(report.expensesTotal)} />
            <ReportTile
              label={`VAT estimate (${report.vatRate}%)`}
              value={formatNaira(report.vatTotal)}
            />
            <ReportTile label="VAT sales" value={formatNaira(report.taxableSalesTotal)} />
            <ReportTile
              label="No VAT sales"
              value={formatNaira(report.nonTaxableSalesTotal)}
            />
          </div>
          <p className="mt-4 rounded-2xl bg-background p-4 text-xs leading-5 text-textSecondary">
            VAT and tax estimates may not reflect official obligations. Consult a qualified tax professional before filing.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <AgingPanel title="Receivables aging" aging={report.receivablesAging} />
            <AgingPanel title="Payables aging" aging={report.payablesAging} />
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <p className="rounded-2xl bg-background p-5 text-sm text-textSecondary">
              Customers owing: <strong>{formatNaira(report.customerDebtTotal)}</strong>
            </p>
            <p className="rounded-2xl bg-background p-5 text-sm text-textSecondary">
              Supplier bills: <strong>{formatNaira(report.supplierDebtTotal)}</strong>
            </p>
            <p className="rounded-2xl bg-background p-5 text-sm text-textSecondary">
              Activity: <strong>{report.transactionCount}</strong>
            </p>
          </div>

          {report.topProduct ? (
            <p className="mt-5 rounded-2xl bg-background p-5 text-sm text-textSecondary">
              Top product: <strong>{report.topProduct.name}</strong> ·{" "}
              {report.topProduct.quantity} sold ·{" "}
              {formatNaira(report.topProduct.profitTotal)} profit
            </p>
          ) : null}

          <div className="mt-5 rounded-2xl bg-background p-5">
            <p className="text-sm font-semibold">Plain notes</p>
            <div className="mt-2 grid gap-2">
              {report.insights.map((insight) => (
                <p key={insight} className="text-sm text-textSecondary">
                  {insight}
                </p>
              ))}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <button
              className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primaryHover"
              type="button"
              onClick={saveVatSummary}
            >
              Save VAT summary
            </button>
            <button
              className="rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-textPrimary hover:bg-background"
              type="button"
              onClick={saveSnapshot}
            >
              Save snapshot
            </button>
            <button
              className="rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-textPrimary hover:bg-background"
              type="button"
              onClick={showExportPrompt}
            >
              Export CSV
            </button>
            <button
              className="rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-textPrimary hover:bg-background"
              type="button"
              onClick={showExportPrompt}
            >
              Export PDF
            </button>
            <button
              className="rounded-xl bg-success px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-success/90"
              type="button"
              onClick={shareReport}
            >
              Share on WhatsApp
            </button>
          </div>
          <p className="mt-4 text-xs leading-5 text-textMuted">
            Reports and exports are automatically generated from recorded business data. Please verify before official submission or filing.
          </p>
        </>
      ) : isLoading ? (
        <div className="mt-4 rounded-xl bg-background p-4">
          <ListSkeleton rows={3} />
        </div>
      ) : (
        <EmptyState
          title="No report yet"
          description="Reports appear after you record money activities."
        />
      )}
    </section>
  );
}

function ReportTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-background p-5">
      <p className="text-xs text-textMuted">{label}</p>
      <p className="mt-1 break-words text-lg font-semibold">{value}</p>
    </div>
  );
}

function AgingPanel({
  title,
  aging,
}: {
  title: string;
  aging: MonthlyReport["receivablesAging"];
}) {
  return (
    <div className="rounded-2xl bg-background p-5">
      <p className="text-sm font-semibold">{title}</p>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-textSecondary">
        <span>0-30: {formatNaira(aging.current)}</span>
        <span>31-60: {formatNaira(aging.days31To60)}</span>
        <span>61-90: {formatNaira(aging.days61To90)}</span>
        <span>90+: {formatNaira(aging.over90)}</span>
      </div>
    </div>
  );
}

function buildReportQuery({
  period,
  date,
  month,
  year,
  businessId,
}: {
  period: ReportPeriod;
  date: string;
  month: number;
  year: number;
  businessId?: string;
}) {
  const params = new URLSearchParams({ period });
  if (businessId) {
    params.set("businessId", businessId);
  }

  if (period === "month") {
    params.set("month", String(month));
    params.set("year", String(year));
  } else {
    params.set("date", date);
  }

  return params.toString();
}
