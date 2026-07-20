"use client";

import { AlertTriangle, CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardProvider";
import type { PredictiveAlertRecord } from "@/lib/phase3/predictive-alerts-service";

export function PredictiveAlertsPanel() {
  const { state, setNotice } = useDashboard();
  const [alerts, setAlerts] = useState<PredictiveAlertRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function fetchAlerts() {
    if (!state.businessId) {
      return [];
    }

    const params = new URLSearchParams({ businessId: state.businessId });
    if (state.selectedLocationId) {
      params.set("locationId", state.selectedLocationId);
    }

    const response = await fetch(`/api/predictive-alerts?${params.toString()}`, {
      credentials: "include",
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as
      | { alerts?: PredictiveAlertRecord[]; error?: string }
      | null;

    if (!response.ok || !payload?.alerts) {
      throw new Error(payload?.error ?? "Could not load predictive alerts.");
    }

    return payload.alerts;
  }

  useEffect(() => {
    let mounted = true;

    async function loadAlerts() {
      try {
        const nextAlerts = await fetchAlerts();

        if (mounted) {
          setAlerts(nextAlerts);
        }
      } catch (error) {
        if (mounted) {
          setNotice(error instanceof Error ? error.message : "Could not load predictive alerts.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadAlerts();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.businessId, state.selectedLocationId]);

  async function scanAlerts() {
    if (!state.businessId || scanning) {
      return;
    }

    setScanning(true);
    try {
      const response = await fetch("/api/predictive-alerts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "scan",
          businessId: state.businessId,
          locationId: state.selectedLocationId,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { alerts?: PredictiveAlertRecord[]; message?: string; error?: string }
        | null;

      if (!response.ok || !payload?.alerts) {
        throw new Error(payload?.error ?? "Could not refresh predictive alerts.");
      }

      setAlerts(payload.alerts);
      setNotice(payload.message ?? "Predictive alerts refreshed.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not refresh predictive alerts.");
    } finally {
      setScanning(false);
    }
  }

  async function updateAlert(alertId: string, action: "confirmed" | "dismissed" | "incorrect" | "resolved") {
    if (!state.businessId || updatingId) {
      return;
    }

    setUpdatingId(alertId);
    try {
      const response = await fetch("/api/predictive-alerts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          businessId: state.businessId,
          alertId,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { alert?: PredictiveAlertRecord; message?: string; error?: string }
        | null;

      if (!response.ok || !payload?.alert) {
        throw new Error(payload?.error ?? "Could not update this alert.");
      }

      setAlerts((current) =>
        current
          .map((alert) => (alert.id === alertId ? payload.alert! : alert))
          .filter((alert) => ["active", "confirmed"].includes(alert.status)),
      );
      setNotice(payload.message ?? "Alert feedback recorded.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not update this alert.");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <section className="rounded-2xl border border-gray-100 bg-card p-5 shadow-sm md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-warning/10 text-warning">
            <AlertTriangle size={20} aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-medium text-textSecondary">Predictive alerts</p>
            <h2 className="text-lg font-semibold tracking-tight text-textPrimary">
              {loading ? "Loading..." : `${alerts.length} active`}
            </h2>
            <p className="mt-1 text-xs text-textMuted">Impact-prioritized business review signals</p>
          </div>
        </div>
        <button
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-gray-200 px-4 text-sm font-semibold text-textPrimary transition hover:bg-background disabled:opacity-60"
          type="button"
          disabled={scanning}
          onClick={scanAlerts}
        >
          <RefreshCw className={scanning ? "animate-spin" : ""} size={16} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="mt-5 grid gap-3">
          <div className="h-24 animate-pulse rounded-2xl bg-background" />
          <div className="h-24 animate-pulse rounded-2xl bg-background" />
        </div>
      ) : alerts.length > 0 ? (
        <div className="mt-5 grid gap-3">
          {alerts.map((alert) => (
            <article key={alert.id} className="rounded-2xl bg-background p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-1 text-[11px] font-bold uppercase ${severityClass(alert.severity)}`}>
                      {alert.severity}
                    </span>
                    <span className="text-xs font-semibold text-textMuted">
                      {Math.round(alert.confidence * 100)}% confidence
                    </span>
                  </div>
                  <h3 className="mt-2 text-sm font-semibold text-textPrimary">{alert.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-textSecondary">{alert.explanation}</p>
                </div>
                {alert.impactAmount > 0 ? (
                  <span className="text-sm font-semibold text-textPrimary">{formatCurrency(alert.impactAmount)}</span>
                ) : null}
              </div>
              {alert.recommendedAction ? (
                <p className="mt-3 rounded-xl bg-card px-3 py-2 text-xs font-medium leading-5 text-textSecondary">
                  {alert.recommendedAction}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-success/20 px-3 text-xs font-semibold text-success disabled:opacity-60"
                  type="button"
                  disabled={updatingId === alert.id}
                  onClick={() => updateAlert(alert.id, "confirmed")}
                >
                  <CheckCircle2 size={14} aria-hidden="true" />
                  Confirm
                </button>
                <button
                  className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-gray-200 px-3 text-xs font-semibold text-textPrimary disabled:opacity-60"
                  type="button"
                  disabled={updatingId === alert.id}
                  onClick={() => updateAlert(alert.id, "dismissed")}
                >
                  Dismiss
                </button>
                <button
                  className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-danger/20 px-3 text-xs font-semibold text-danger disabled:opacity-60"
                  type="button"
                  disabled={updatingId === alert.id}
                  onClick={() => updateAlert(alert.id, "incorrect")}
                >
                  <XCircle size={14} aria-hidden="true" />
                  Incorrect
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl bg-background p-4 text-sm font-medium text-textSecondary">
          No active predictive alerts for the selected scope.
        </div>
      )}
    </section>
  );
}

function severityClass(severity: string) {
  if (severity === "critical") {
    return "bg-danger/10 text-danger";
  }

  if (severity === "warning") {
    return "bg-warning/10 text-warning";
  }

  return "bg-primary/10 text-primary";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);
}
