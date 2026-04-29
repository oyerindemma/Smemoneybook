"use client";

import { useEffect, useState } from "react";
import type { MonthlyReport } from "@/components/dashboard/types";
import { formatNaira } from "@/lib/bookkeeping/transaction-engine";

type ReportPeriod = "day" | "week" | "month";

export function ReportsPanel({
  onNotice,
}: {
  onNotice: (message: string) => void;
}) {
  const now = new Date();
  const [period, setPeriod] = useState<ReportPeriod>("month");
  const [date, setDate] = useState(now.toISOString().slice(0, 10));
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [report, setReport] = useState<MonthlyReport | null>(null);

  const query = buildReportQuery({ period, date, month, year });

  useEffect(() => {
    let isActive = true;

    async function loadReport() {
      const response = await fetch(`/api/reports/monthly?${query}`, {
        credentials: "include",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as {
        report?: MonthlyReport;
        error?: string;
      } | null;

      if (!isActive) {
        return;
      }

      if (response.ok && payload?.report) {
        setReport(payload.report);
        return;
      }

      onNotice(payload?.error ?? "Could not load report.");
    }

    void loadReport();

    return () => {
      isActive = false;
    };
  }, [onNotice, query]);

  async function saveVatSummary() {
    const response = await fetch(`/api/tax/summary?month=${month}&year=${year}`, {
      method: "POST",
      credentials: "include",
    });
    const payload = (await response.json().catch(() => null)) as {
      message?: string;
      error?: string;
    } | null;

    onNotice(
      response.ok
        ? payload?.message ?? "VAT summary saved."
        : payload?.error ?? "Could not save VAT summary.",
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
        : payload?.error ?? "Could not save report snapshot.",
    );
  }

  const exportCsvUrl = `/api/reports/monthly/export?${query}`;
  const exportPdfUrl = `/api/reports/monthly/export?${query}&format=pdf`;

  return (
    <section className="rounded-xl bg-white p-4 shadow-soft sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-black/55">Reports</p>
          <h2 className="text-xl font-semibold">Business summary</h2>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <select
            className="h-10 rounded-xl border border-black/10 bg-white px-3 text-sm"
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
                className="h-10 rounded-xl border border-black/10 bg-white px-3 text-sm"
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
                className="h-10 rounded-xl border border-black/10 px-3 text-sm"
                max="2100"
                min="2000"
                type="number"
                value={year}
                onChange={(event) => setYear(Number(event.target.value))}
              />
            </>
          ) : (
            <input
              className="h-10 rounded-xl border border-black/10 px-3 text-sm sm:col-span-2"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          )}
        </div>
      </div>

      {report ? (
        <>
          <p className="mt-3 text-sm font-semibold text-black/55">{report.periodLabel}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ReportTile label="Sales" value={formatNaira(report.salesTotal)} />
            <ReportTile label="Cash received" value={formatNaira(report.cashReceivedTotal)} />
            <ReportTile label="Credit sales" value={formatNaira(report.creditSalesTotal)} />
            <ReportTile label="Profit" value={formatNaira(report.profitTotal)} />
            <ReportTile label="Expenses" value={formatNaira(report.expensesTotal)} />
            <ReportTile
              label={`VAT estimate (${report.vatRate}%)`}
              value={formatNaira(report.vatTotal)}
            />
            <ReportTile label="Taxable sales" value={formatNaira(report.taxableSalesTotal)} />
            <ReportTile
              label="Non-taxable sales"
              value={formatNaira(report.nonTaxableSalesTotal)}
            />
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <AgingPanel title="Receivables aging" aging={report.receivablesAging} />
            <AgingPanel title="Payables aging" aging={report.payablesAging} />
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <p className="rounded-xl bg-[#F5F3EF] p-3 text-sm text-black/65">
              Customers owing: <strong>{formatNaira(report.customerDebtTotal)}</strong>
            </p>
            <p className="rounded-xl bg-[#F5F3EF] p-3 text-sm text-black/65">
              Supplier bills: <strong>{formatNaira(report.supplierDebtTotal)}</strong>
            </p>
            <p className="rounded-xl bg-[#F5F3EF] p-3 text-sm text-black/65">
              Entries: <strong>{report.transactionCount}</strong>
            </p>
          </div>

          {report.topProduct ? (
            <p className="mt-3 rounded-xl bg-[#F5F3EF] p-3 text-sm text-black/65">
              Top product: <strong>{report.topProduct.name}</strong> ·{" "}
              {report.topProduct.quantity} sold ·{" "}
              {formatNaira(report.topProduct.profitTotal)} profit
            </p>
          ) : null}

          <div className="mt-3 rounded-xl bg-[#F5F3EF] p-3">
            <p className="text-sm font-semibold">Plain notes</p>
            <div className="mt-2 grid gap-2">
              {report.insights.map((insight) => (
                <p key={insight} className="text-sm text-black/65">
                  {insight}
                </p>
              ))}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className="h-11 rounded-xl bg-ink px-4 text-sm font-semibold text-white"
              type="button"
              onClick={saveVatSummary}
            >
              Save VAT summary
            </button>
            <button
              className="h-11 rounded-xl bg-lagoon px-4 text-sm font-semibold text-white"
              type="button"
              onClick={saveSnapshot}
            >
              Save snapshot
            </button>
            <a
              className="inline-flex h-11 items-center rounded-xl bg-[#F5F3EF] px-4 text-sm font-semibold text-black/70"
              href={exportCsvUrl}
            >
              Export CSV
            </a>
            <a
              className="inline-flex h-11 items-center rounded-xl bg-[#F5F3EF] px-4 text-sm font-semibold text-black/70"
              href={exportPdfUrl}
            >
              Export PDF
            </a>
          </div>
        </>
      ) : (
        <p className="mt-4 rounded-xl bg-[#F5F3EF] p-4 text-sm text-black/60">
          Loading report...
        </p>
      )}
    </section>
  );
}

function ReportTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[#F5F3EF] p-3">
      <p className="text-xs text-black/50">{label}</p>
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
    <div className="rounded-xl bg-[#F5F3EF] p-3">
      <p className="text-sm font-semibold">{title}</p>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-black/65">
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
}: {
  period: ReportPeriod;
  date: string;
  month: number;
  year: number;
}) {
  const params = new URLSearchParams({ period });

  if (period === "month") {
    params.set("month", String(month));
    params.set("year", String(year));
  } else {
    params.set("date", date);
  }

  return params.toString();
}
