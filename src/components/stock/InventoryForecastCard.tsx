"use client";

import { AlertTriangle, Package, RefreshCw, Save, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import type {
  InventoryForecastClassification,
  InventoryForecastConfidence,
  InventoryForecastSummary,
  InventoryItemForecast,
} from "@/lib/phase3/inventory-forecast";

export function InventoryForecastCard({
  businessId,
  locationId,
  onNotice,
}: {
  businessId: string;
  locationId?: string;
  onNotice: (message: string) => void;
}) {
  const [forecast, setForecast] = useState<InventoryForecastSummary | null>(null);
  const [leadTimeDays, setLeadTimeDays] = useState("14");
  const [safetyStockDays, setSafetyStockDays] = useState("7");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function requestForecast() {
    const params = new URLSearchParams({ businessId });
    if (locationId) {
      params.set("locationId", locationId);
    }
    params.set("supplierLeadTimeDays", leadTimeDays || "14");
    params.set("safetyStockDays", safetyStockDays || "7");

    const response = await fetch(`/api/inventory-forecast?${params.toString()}`, {
      credentials: "include",
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as
      | { forecast?: InventoryForecastSummary; error?: string }
      | null;

    if (!response.ok || !payload?.forecast) {
      throw new Error(payload?.error ?? "Could not load inventory forecast.");
    }

    return payload.forecast;
  }

  useEffect(() => {
    let mounted = true;

    async function loadInitialForecast() {
      try {
        const nextForecast = await requestForecast();

        if (mounted) {
          setForecast(nextForecast);
        }
      } catch (error) {
        if (mounted) {
          onNotice(error instanceof Error ? error.message : "Could not load inventory forecast.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadInitialForecast();

    return () => {
      mounted = false;
    };
    // Initial load follows business/location. Manual overrides apply through the refresh button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, locationId]);

  async function refreshForecast() {
    setLoading(true);
    try {
      setForecast(await requestForecast());
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Could not load inventory forecast.");
    } finally {
      setLoading(false);
    }
  }

  async function saveSnapshots() {
    if (!forecast || saving) {
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/inventory-forecast", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId,
          locationId,
          supplierLeadTimeDays: Number(leadTimeDays || 14),
          safetyStockDays: Number(safetyStockDays || 7),
        }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not save inventory forecast.");
      }

      onNotice(payload?.message ?? "Inventory forecast snapshot saved.");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Could not save inventory forecast.");
    } finally {
      setSaving(false);
    }
  }

  const topForecasts = forecast?.forecasts.slice(0, 5) ?? [];

  return (
    <section className="rounded-2xl border border-gray-100 bg-card p-5 shadow-sm md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Package size={20} aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-medium text-textSecondary">Inventory forecast</p>
            <h2 className="text-lg font-semibold tracking-tight text-textPrimary">
              {loading ? "Calculating..." : forecast ? `${forecast.forecasts.length} products checked` : "Unavailable"}
            </h2>
            {forecast ? (
              <p className="mt-1 text-xs text-textMuted">
                Recorded through {new Date(forecast.recordedThrough).toLocaleDateString()}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-gray-200 px-4 text-sm font-semibold text-textPrimary transition hover:bg-background disabled:opacity-60"
            type="button"
            disabled={loading}
            onClick={refreshForecast}
          >
            <RefreshCw size={16} aria-hidden="true" />
            Refresh
          </button>
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
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <label className="text-xs font-semibold text-textSecondary">
          Supplier lead time
          <input
            className="mt-2 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-textPrimary outline-none focus:border-primary"
            min="1"
            inputMode="numeric"
            type="number"
            value={leadTimeDays}
            onChange={(event) => setLeadTimeDays(event.target.value)}
          />
        </label>
        <label className="text-xs font-semibold text-textSecondary">
          Safety stock days
          <input
            className="mt-2 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-textPrimary outline-none focus:border-primary"
            min="1"
            inputMode="numeric"
            type="number"
            value={safetyStockDays}
            onChange={(event) => setSafetyStockDays(event.target.value)}
          />
        </label>
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-xl bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
          type="button"
          disabled={loading}
          onClick={refreshForecast}
        >
          <SlidersHorizontal size={16} aria-hidden="true" />
          Apply
        </button>
      </div>

      {loading ? (
        <div className="mt-5 grid gap-3 lg:grid-cols-5">
          {[0, 1, 2, 3, 4].map((item) => (
            <div className="h-40 animate-pulse rounded-2xl bg-background" key={item} />
          ))}
        </div>
      ) : forecast && topForecasts.length > 0 ? (
        <>
          <div className="mt-5 grid gap-3 lg:grid-cols-5">
            {topForecasts.map((item) => (
              <InventoryForecastTile forecast={item} key={item.itemId} />
            ))}
          </div>
          {forecast.dataWarnings.length > 0 ? (
            <p className="mt-4 text-xs leading-5 text-textMuted">{forecast.dataWarnings[0]}</p>
          ) : null}
        </>
      ) : (
        <div className="mt-5 rounded-2xl bg-background p-4 text-sm font-medium text-textSecondary">
          Inventory forecast is not available for this business yet.
        </div>
      )}
    </section>
  );
}

function InventoryForecastTile({ forecast }: { forecast: InventoryItemForecast }) {
  const needsAttention = ["out_of_stock", "likely_stockout"].includes(forecast.classification);

  return (
    <div className="rounded-2xl bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-textPrimary">{forecast.itemName}</p>
          <p className="mt-1 text-xs text-textMuted">{classificationLabel(forecast.classification)}</p>
        </div>
        <ConfidencePill confidence={forecast.confidence} />
      </div>

      <div className="mt-4 grid gap-2 text-xs">
        <Metric label="On hand" value={formatQuantity(forecast.currentQuantity)} />
        <Metric
          label="Days left"
          value={forecast.daysOfStockRemaining === null ? "No demand" : formatQuantity(forecast.daysOfStockRemaining)}
        />
        <Metric label="Suggested reorder" value={formatQuantity(forecast.suggestedReorderQuantity)} />
      </div>

      {forecast.restockByDate ? (
        <p className="mt-3 text-xs font-medium text-textSecondary">
          Restock by {new Date(forecast.restockByDate).toLocaleDateString()}
        </p>
      ) : null}

      {needsAttention ? (
        <div className="mt-4 flex gap-2 rounded-xl bg-danger/10 p-3 text-xs leading-5 text-danger">
          <AlertTriangle className="mt-0.5 shrink-0" size={14} aria-hidden="true" />
          <span>{forecast.recommendation.message}</span>
        </div>
      ) : (
        <p className="mt-4 text-xs leading-5 text-textMuted">{forecast.recommendation.message}</p>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-textMuted">{label}</span>
      <span className="font-semibold text-textPrimary">{value}</span>
    </div>
  );
}

function ConfidencePill({ confidence }: { confidence: InventoryForecastConfidence }) {
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

function classificationLabel(classification: InventoryForecastClassification) {
  return {
    out_of_stock: "Out of stock",
    likely_stockout: "Likely stockout",
    fast_moving: "Fast moving",
    steady: "Steady",
    slow_moving: "Slow moving",
    dead_stock: "Dead stock",
    excess_inventory: "Excess",
  }[classification];
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
  }).format(value);
}
