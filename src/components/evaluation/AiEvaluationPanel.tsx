"use client";

import { Activity, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardProvider";
import type { AiEvaluationOverview } from "@/lib/phase3/ai-evaluation-service";

export function AiEvaluationPanel() {
  const { state, setNotice } = useDashboard();
  const [overview, setOverview] = useState<AiEvaluationOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadEvaluation() {
      if (!state.businessId) {
        setLoading(false);
        return;
      }

      try {
        const params = new URLSearchParams({ businessId: state.businessId });
        const response = await fetch(`/api/ai-evaluation?${params.toString()}`, {
          credentials: "include",
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as
          | { overview?: AiEvaluationOverview; error?: string }
          | null;

        if (!response.ok || !payload?.overview) {
          throw new Error(payload?.error ?? "Could not load AI evaluation.");
        }

        if (mounted) {
          setOverview(payload.overview);
        }
      } catch (error) {
        if (mounted) {
          setNotice(error instanceof Error ? error.message : "Could not load AI evaluation.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadEvaluation();

    return () => {
      mounted = false;
    };
  }, [state.businessId, setNotice]);

  const summary = overview?.summary;

  return (
    <section className="rounded-2xl border border-gray-100 bg-card p-5 shadow-sm md:p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ShieldCheck size={20} aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs font-medium text-textSecondary">AI evaluation</p>
          <h2 className="text-lg font-semibold tracking-tight text-textPrimary">
            {loading ? "Loading..." : `${summary?.eventCount ?? 0} events`}
          </h2>
          <p className="mt-1 text-xs text-textMuted">Quality, safety, latency, and cost telemetry</p>
        </div>
      </div>

      {summary ? (
        <>
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <Metric label="Helpful rate" value={formatRate(summary.helpfulRate)} />
            <Metric label="Acceptance" value={formatRate(summary.recommendationAcceptanceRate)} />
            <Metric label="Correctness" value={formatRate(summary.categorizationAccuracy)} />
            <Metric label="Tool failures" value={formatRate(summary.toolFailureRate)} />
            <Metric label="Requests" value={formatCount(summary.requestVolume)} />
            <Metric label="Avg latency" value={summary.averageLatencyMs === null ? "N/A" : `${summary.averageLatencyMs} ms`} />
            <Metric label="Cost" value={formatKobo(summary.totalCostKobo)} />
            <Metric label="Safety events" value={formatCount(summary.safetyEventCount)} />
          </div>

          <div className="mt-5 rounded-2xl bg-background p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-textMuted">
              <Activity size={14} aria-hidden="true" />
              Feature telemetry
            </div>
            <div className="mt-3 grid gap-2">
              {summary.byFeature.length > 0 ? (
                summary.byFeature.slice(0, 5).map((feature) => (
                  <div key={feature.feature} className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-textPrimary">{feature.feature}</span>
                    <span className="text-textMuted">
                      {formatCount(feature.eventCount)} events · {formatKobo(feature.totalCostKobo)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm font-medium text-textSecondary">No evaluation events have been recorded.</p>
              )}
            </div>
          </div>
        </>
      ) : loading ? (
        <div className="mt-5 h-32 animate-pulse rounded-2xl bg-background" />
      ) : (
        <div className="mt-5 rounded-2xl bg-background p-4 text-sm font-medium text-textSecondary">
          AI evaluation is not available for this business.
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

function formatRate(value: number | null) {
  return value === null ? "N/A" : `${value.toFixed(1)}%`;
}

function formatCount(value: number) {
  return new Intl.NumberFormat().format(value);
}

function formatKobo(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value / 100);
}
