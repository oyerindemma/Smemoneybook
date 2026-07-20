"use client";

import { AlertTriangle, RefreshCw, Save, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import type {
  CashflowForecast,
  CashflowForecastConfidence,
  CashflowForecastSummary,
} from "@/lib/phase3/cashflow-forecast";

export function CashflowForecastCard({
  businessId,
  locationId,
  onNotice,
}: {
  businessId: string;
  locationId?: string;
  onNotice: (message: string) => void;
}) {
  const [forecast, setForecast] = useState<CashflowForecastSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;

    void loadForecast().finally(() => {
      if (mounted) {
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
    };

    async function loadForecast() {
      const params = new URLSearchParams({ businessId });
      if (locationId) {
        params.set("locationId", locationId);
      }

      const response = await fetch(`/api/cashflow-forecast?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as
        | { forecast?: CashflowForecastSummary; error?: string }
        | null;

      if (!response.ok || !payload?.forecast) {
        if (mounted) {
          onNotice(payload?.error ?? "Could not load cashflow forecast.");
        }
        return;
      }

      if (mounted) {
        setForecast(payload.forecast);
      }
    }
  }, [businessId, locationId, onNotice]);

  async function saveSnapshots() {
    if (!forecast || saving) {
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/cashflow-forecast", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, locationId }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not save cashflow forecast.");
      }

      onNotice(payload?.message ?? "Cashflow forecast snapshot saved.");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Could not save cashflow forecast.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-gray-100 bg-card p-5 shadow-sm md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-textPrimary">
            <TrendingUp size={20} aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-medium text-textSecondary">Cashflow forecast</p>
            <h2 className="text-lg font-semibold tracking-tight text-textPrimary">
              {loading ? "Calculating..." : forecast ? `${formatCurrency(forecast.currentCash)} current cash` : "Unavailable"}
            </h2>
            {forecast ? (
              <p className="mt-1 text-xs text-textMuted">
                Recorded through {new Date(forecast.recordedThrough).toLocaleDateString()}
              </p>
            ) : null}
          </div>
        </div>
        <button
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-gray-200 px-4 text-sm font-semibold text-textPrimary transition hover:bg-background disabled:opacity-60"
          type="button"
          disabled={!forecast || saving}
          onClick={saveSnapshots}
        >
          {saving ? <RefreshCw className="animate-spin" size={16} aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
          Save
        </button>
      </div>

      {loading ? (
        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div className="h-44 animate-pulse rounded-2xl bg-background" key={item} />
          ))}
        </div>
      ) : forecast ? (
        <>
          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            {forecast.forecasts.map((item) => (
              <ForecastTile forecast={item} key={item.horizonDays} />
            ))}
          </div>
          {forecast.dataWarnings.length > 0 ? (
            <p className="mt-4 text-xs leading-5 text-textMuted">{forecast.dataWarnings[0]}</p>
          ) : null}
        </>
      ) : (
        <div className="mt-5 rounded-2xl bg-background p-4 text-sm font-medium text-textSecondary">
          Cashflow forecast is not available for this business yet.
        </div>
      )}
    </section>
  );
}

function ForecastTile({ forecast }: { forecast: CashflowForecast }) {
  const primaryAlert = forecast.alerts[0];

  return (
    <div className="rounded-2xl bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-textPrimary">{forecast.horizonDays} days</p>
          <p className="mt-1 text-xs text-textMuted">
            {new Date(forecast.forecastEnd).toLocaleDateString()}
          </p>
        </div>
        <ConfidencePill confidence={forecast.confidence} />
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium text-textSecondary">Forecast ending cash</p>
        <p className="mt-1 text-xl font-semibold tracking-tight text-textPrimary">
          {formatCurrency(forecast.forecastEndingCash)}
        </p>
        <p className="mt-1 text-xs text-textMuted">
          Range {formatCurrency(forecast.lowerBound)} to {formatCurrency(forecast.upperBound)}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <Metric label="Recorded inflow" value={formatCurrency(forecast.recordedMetrics.paidSales)} />
        <Metric label="Forecast inflow" value={formatCurrency(forecast.projectedInflows)} />
        <Metric label="Recorded outflow" value={formatCurrency(forecast.recordedMetrics.paidExpenses)} />
        <Metric label="Forecast outflow" value={formatCurrency(forecast.projectedOutflows)} />
      </div>

      {primaryAlert ? (
        <div className="mt-4 flex gap-2 rounded-xl bg-danger/10 p-3 text-xs leading-5 text-danger">
          <AlertTriangle className="mt-0.5 shrink-0" size={14} aria-hidden="true" />
          <span>{primaryAlert.message}</span>
        </div>
      ) : forecast.dataWarnings.length > 0 ? (
        <p className="mt-4 text-xs leading-5 text-textMuted">{forecast.dataWarnings[0]}</p>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-medium text-textMuted">{label}</p>
      <p className="mt-1 font-semibold text-textPrimary">{value}</p>
    </div>
  );
}

function ConfidencePill({ confidence }: { confidence: CashflowForecastConfidence }) {
  const className = {
    high: "bg-success/10 text-success",
    medium: "bg-primary/10 text-primary",
    low: "bg-accent/15 text-textPrimary",
    insufficient_data: "bg-gray-100 text-textMuted",
  }[confidence];

  const label = {
    high: "High",
    medium: "Medium",
    low: "Low",
    insufficient_data: "More data",
  }[confidence];

  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>
      {label}
    </span>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);
}
