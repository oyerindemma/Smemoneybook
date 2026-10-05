"use client";

import { RefreshCw, Save, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import type { BusinessHealthScore, HealthScoreComponent, HealthScoreStatus } from "@/lib/phase3/health-score";

export function BusinessHealthCard({
  businessId,
  locationId,
  onNotice,
}: {
  businessId: string;
  locationId?: string;
  onNotice: (message: string) => void;
}) {
  const [score, setScore] = useState<BusinessHealthScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;

    void loadScore().finally(() => {
      if (mounted) {
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
    };

    async function loadScore() {
      const params = new URLSearchParams({ businessId });
      if (locationId) {
        params.set("locationId", locationId);
      }

      const response = await fetch(`/api/health-score?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as { score?: BusinessHealthScore; error?: string } | null;

      if (!response.ok || !payload?.score) {
        if (mounted) {
          onNotice(payload?.error ?? "Could not load business health score.");
        }
        return;
      }

      if (mounted) {
        setScore(payload.score);
      }
    }
  }, [businessId, locationId, onNotice]);

  async function saveSnapshot() {
    if (!score || saving) {
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/health-score", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, locationId }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not save score snapshot.");
      }

      onNotice(payload?.message ?? "Business Health Score snapshot saved.");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Could not save score snapshot.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-gray-100 bg-card p-5 shadow-sm md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck size={20} aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-medium text-textSecondary">Business health</p>
            <h2 className="text-lg font-semibold tracking-tight text-textPrimary">
              {loading ? "Calculating..." : score ? `${score.score}/100 · ${score.rating}` : "Unavailable"}
            </h2>
            {score ? (
              <p className="mt-1 text-xs text-textMuted">
                {score.confidence} confidence · {new Date(score.generatedAt).toLocaleString()}
              </p>
            ) : null}
          </div>
        </div>
        <button
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-gray-200 px-4 text-sm font-semibold text-textPrimary transition hover:bg-background disabled:opacity-60"
          type="button"
          disabled={!score || saving}
          onClick={saveSnapshot}
        >
          {saving ? <RefreshCw className="animate-spin" size={16} aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
          Save
        </button>
      </div>

      {loading ? (
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div className="h-24 animate-pulse rounded-2xl bg-background" key={item} />
          ))}
        </div>
      ) : score ? (
        <>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {score.components.map((component) => (
              <ComponentTile component={component} key={component.id} />
            ))}
          </div>
          {score.recommendations.length > 0 ? (
            <div className="mt-5 rounded-2xl bg-primary/5 p-4">
              <p className="text-xs font-semibold text-primary">Recommended action</p>
              <p className="mt-2 text-sm font-medium leading-6 text-textPrimary">
                {score.recommendations[0]}
              </p>
            </div>
          ) : null}
          {score.dataWarnings.length > 0 ? (
            <p className="mt-4 text-xs leading-5 text-textMuted">
              {score.dataWarnings[0]}
            </p>
          ) : null}
        </>
      ) : (
        <div className="mt-5 rounded-2xl bg-background p-4 text-sm font-medium text-textSecondary">
          Health score is not available for this business yet.
        </div>
      )}
    </section>
  );
}

function ComponentTile({ component }: { component: HealthScoreComponent }) {
  return (
    <div className="rounded-2xl bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-textPrimary">{component.label}</p>
          <p className="mt-1 text-xs text-textMuted">
            {component.score}/{component.weight}
          </p>
        </div>
        <StatusPill status={component.status} />
      </div>
      <p className="mt-3 text-sm leading-5 text-textSecondary">{component.explanation}</p>
    </div>
  );
}

function StatusPill({ status }: { status: HealthScoreStatus }) {
  const className = {
    good: "bg-success/10 text-success",
    watch: "bg-accent/15 text-textPrimary",
    attention: "bg-danger/10 text-danger",
    insufficient_data: "bg-gray-100 text-textMuted",
  }[status];

  const label = {
    good: "Good",
    watch: "Watch",
    attention: "Attention",
    insufficient_data: "More data",
  }[status];

  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>
      {label}
    </span>
  );
}
