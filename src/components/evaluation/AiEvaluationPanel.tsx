"use client";

import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Download,
  Gauge,
  GitCompare,
  Play,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardProvider";

type ProviderSetup = {
  configured: boolean;
  model: string | null;
  deterministicProviderAvailable: boolean;
};

type Capabilities = {
  canRun: boolean;
  canManageCases: boolean;
  canExport: boolean;
  canCompareModels: boolean;
};

type Suite = {
  id: string;
  name: string;
  description?: string;
  targetFeature: string;
  status: string;
  datasetVersion: string;
  caseCount: number;
  runCount: number;
  latestRun?: Run | null;
};

type RunSummary = {
  status: string;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  needsReviewCases: number;
  criticalFailures: number;
  passRate: number;
  aggregateScore: number;
  totalCostKobo: number;
  totalTokens: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  acceptableAsBaseline: boolean;
  scoreBreakdown: Record<string, number>;
};

type RunResult = {
  id: string;
  caseKey: string;
  category: string;
  prompt: string;
  status: "passed" | "failed" | "needs_review" | "critical_failure";
  response: string;
  evaluatorResults: Array<{
    id: string;
    label: string;
    passed: boolean;
    score: number;
    critical: boolean;
    detail: string;
  }>;
  score: number;
  criticalFailure: boolean;
  latencyMs: number;
  tokenUsage: { totalTokens?: number };
  estimatedCostKobo: number;
  failureReason?: string;
};

type Run = {
  id: string;
  status: string;
  model: string;
  promptVersion: string;
  toolVersion: string;
  datasetVersion: string;
  summary: RunSummary | null;
  totalCostKobo: number;
  totalTokens: number;
  startedAt: string;
  completedAt?: string;
  cancelledAt?: string;
  suite?: { id: string; name: string; targetFeature: string } | null;
  baseline?: boolean;
  results?: RunResult[];
};

type ComparePayload = {
  comparison: {
    comparison: {
      scoreDelta: number;
      passRateDelta: number;
      costDeltaKobo: number;
      latencyDeltaMs: number;
      regression: boolean;
    };
  };
};

const statusTone = {
  passed: "text-success",
  failed: "text-danger",
  critical_failure: "text-danger",
  needs_review: "text-warning",
} as const;

export function AiEvaluationPanel() {
  const { state, setNotice } = useDashboard();
  const [suites, setSuites] = useState<Suite[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedSuiteId, setSelectedSuiteId] = useState("");
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [providerSetup, setProviderSetup] = useState<ProviderSetup | null>(null);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [comparison, setComparison] = useState<ComparePayload["comparison"]["comparison"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadRun = useCallback(async (runId: string, showError = true) => {
    if (!state.businessId) {
      return;
    }

    try {
      const params = new URLSearchParams({ businessId: state.businessId });
      const response = await fetch(`/api/ai-evaluation/runs/${runId}?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as { run?: Run; error?: string } | null;

      if (!response.ok || !payload?.run) {
        throw new Error(payload?.error ?? "Could not load AI evaluation run.");
      }

      setSelectedRun(payload.run);
      setSelectedCaseId(payload.run.results?.find((result) => result.status !== "passed")?.id ?? payload.run.results?.[0]?.id ?? "");
    } catch (error) {
      if (showError) {
        setNotice(error instanceof Error ? error.message : "Could not load AI evaluation run.");
      }
    }
  }, [state.businessId, setNotice]);

  const load = useCallback(async () => {
    if (!state.businessId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({ businessId: state.businessId });
      const [suiteResponse, runResponse] = await Promise.all([
        fetch(`/api/ai-evaluation/suites?${params.toString()}`, {
          credentials: "include",
          cache: "no-store",
        }),
        fetch(`/api/ai-evaluation/runs?${params.toString()}`, {
          credentials: "include",
          cache: "no-store",
        }),
      ]);
      const suitePayload = (await suiteResponse.json().catch(() => null)) as
        | { suites?: Suite[]; capabilities?: Capabilities; providerSetup?: ProviderSetup; error?: string }
        | null;
      const runPayload = (await runResponse.json().catch(() => null)) as
        | { runs?: Run[]; capabilities?: Capabilities; error?: string }
        | null;

      if (!suiteResponse.ok || !suitePayload?.suites) {
        throw new Error(suitePayload?.error ?? "Could not load AI evaluation suites.");
      }

      if (!runResponse.ok || !runPayload?.runs) {
        throw new Error(runPayload?.error ?? "Could not load AI evaluation runs.");
      }

      setSuites(suitePayload.suites);
      setRuns(runPayload.runs);
      setCapabilities(suitePayload.capabilities ?? runPayload.capabilities ?? null);
      setProviderSetup(suitePayload.providerSetup ?? null);
      const nextSuiteId = selectedSuiteId || suitePayload.suites[0]?.id || "";
      setSelectedSuiteId(nextSuiteId);

      if (runPayload.runs[0]) {
        await loadRun(runPayload.runs[0].id, false);
      } else {
        setSelectedRun(null);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load AI Evaluation.");
    } finally {
      setLoading(false);
    }
  }, [loadRun, selectedSuiteId, state.businessId, setNotice]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [load]);

  const selectedSuite = useMemo(
    () => suites.find((suite) => suite.id === selectedSuiteId) ?? suites[0] ?? null,
    [selectedSuiteId, suites],
  );
  const summary = selectedRun?.summary;
  const failedCases = selectedRun?.results?.filter((result) => result.status !== "passed") ?? [];
  const selectedCase = selectedRun?.results?.find((result) => result.id === selectedCaseId) ?? failedCases[0] ?? selectedRun?.results?.[0] ?? null;

  async function createSuite() {
    if (!state.businessId) {
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/ai-evaluation/suites", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: state.businessId, targetFeature: "all_ai_surfaces" }),
      });
      const payload = (await response.json().catch(() => null)) as { suite?: Suite; error?: string } | null;

      if (!response.ok || !payload?.suite) {
        throw new Error(payload?.error ?? "Could not create AI evaluation suite.");
      }

      setNotice("AI evaluation suite created.");
      setSelectedSuiteId(payload.suite.id);
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not create AI evaluation suite.");
    } finally {
      setBusy(false);
    }
  }

  async function runSuite() {
    if (!state.businessId || !selectedSuite) {
      return;
    }

    setBusy(true);
    setComparison(null);
    try {
      const response = await fetch(`/api/ai-evaluation/suites/${selectedSuite.id}/run`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: state.businessId }),
      });
      const payload = (await response.json().catch(() => null)) as { run?: Run; error?: string } | null;

      if (!response.ok || !payload?.run) {
        throw new Error(payload?.error ?? "Could not run AI evaluation.");
      }

      setNotice("AI evaluation run completed.");
      setSelectedRun(payload.run);
      setSelectedCaseId(payload.run.results?.find((result) => result.status !== "passed")?.id ?? payload.run.results?.[0]?.id ?? "");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not run AI evaluation.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelRun() {
    if (!state.businessId || !selectedRun) {
      return;
    }

    setBusy(true);
    try {
      const params = new URLSearchParams({ businessId: state.businessId });
      const response = await fetch(`/api/ai-evaluation/runs/${selectedRun.id}/cancel?${params.toString()}`, {
        method: "POST",
        credentials: "include",
      });
      const payload = (await response.json().catch(() => null)) as { run?: Run; error?: string } | null;

      if (!response.ok || !payload?.run) {
        throw new Error(payload?.error ?? "Could not cancel AI evaluation run.");
      }

      setNotice("AI evaluation run cancelled.");
      setSelectedRun(payload.run);
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not cancel AI evaluation run.");
    } finally {
      setBusy(false);
    }
  }

  async function acceptBaseline() {
    if (!state.businessId || !selectedRun) {
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`/api/ai-evaluation/runs/${selectedRun.id}/accept-baseline`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: state.businessId, notes: "Preview QA baseline." }),
      });
      const payload = (await response.json().catch(() => null)) as { baseline?: { id: string }; error?: string } | null;

      if (!response.ok || !payload?.baseline) {
        throw new Error(payload?.error ?? "Could not accept baseline.");
      }

      setNotice("Baseline accepted.");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not accept baseline.");
    } finally {
      setBusy(false);
    }
  }

  async function compareRuns() {
    if (!state.businessId || runs.length === 0) {
      return;
    }

    setBusy(true);
    try {
      const left = runs[1]?.id ?? runs[0].id;
      const right = selectedRun?.id ?? runs[0].id;
      const params = new URLSearchParams({ businessId: state.businessId, leftRunId: left, rightRunId: right });
      const response = await fetch(`/api/ai-evaluation/compare?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as ComparePayload | { error?: string } | null;

      if (!response.ok || !payload || !("comparison" in payload)) {
        throw new Error((payload as { error?: string } | null)?.error ?? "Could not compare AI evaluation runs.");
      }

      setComparison(payload.comparison.comparison);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not compare AI evaluation runs.");
    } finally {
      setBusy(false);
    }
  }

  const exportHref =
    state.businessId && selectedRun
      ? `/api/ai-evaluation/export?${new URLSearchParams({ businessId: state.businessId, runId: selectedRun.id }).toString()}`
      : "#";

  return (
    <section className="space-y-5">
      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Pass rate" value={summary ? `${summary.passRate.toFixed(1)}%` : "N/A"} icon={<CheckCircle2 size={16} aria-hidden="true" />} />
        <Metric label="Critical failures" value={summary ? formatCount(summary.criticalFailures) : "N/A"} icon={<AlertTriangle size={16} aria-hidden="true" />} tone={summary?.criticalFailures ? "danger" : "neutral"} />
        <Metric label="Cost" value={summary ? formatKobo(summary.totalCostKobo) : "N/A"} icon={<Gauge size={16} aria-hidden="true" />} />
        <Metric label="Latency" value={summary ? `${summary.averageLatencyMs} ms` : "N/A"} icon={<Activity size={16} aria-hidden="true" />} />
      </div>

      <section className="rounded-lg border border-gray-100 bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-medium text-textMuted">Evaluation suites</p>
            <h2 className="text-base font-semibold text-textPrimary">
              {loading ? "Loading..." : selectedSuite?.name ?? "No suites yet"}
            </h2>
            <p className="mt-1 text-xs text-textMuted">
              {selectedSuite ? `${selectedSuite.caseCount} cases · ${selectedSuite.datasetVersion}` : "Create the synthetic Phase 3F suite."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-background px-3 text-sm font-semibold text-textPrimary disabled:opacity-50"
              type="button"
              disabled={busy || !capabilities?.canManageCases}
              onClick={createSuite}
            >
              <ShieldCheck size={16} aria-hidden="true" />
              Create suite
            </button>
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-white disabled:opacity-50"
              type="button"
              disabled={busy || !selectedSuite || !capabilities?.canRun}
              onClick={runSuite}
            >
              <Play size={16} aria-hidden="true" />
              Run evaluation
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(220px,320px)]">
          <label className="grid gap-1 text-xs font-medium text-textMuted">
            Suite
            <select
              className="min-h-10 rounded-lg border border-gray-200 bg-background px-3 text-sm text-textPrimary"
              value={selectedSuiteId}
              onChange={(event) => setSelectedSuiteId(event.target.value)}
            >
              {suites.length ? (
                suites.map((suite) => (
                  <option key={suite.id} value={suite.id}>
                    {suite.name}
                  </option>
                ))
              ) : (
                <option value="">No suites</option>
              )}
            </select>
          </label>
          <div className="rounded-lg bg-background p-3 text-xs text-textSecondary">
            <span className="font-semibold text-textPrimary">
              {providerSetup?.configured ? "Provider configured" : "Provider setup required"}
            </span>
            <span className="block pt-1">
              Deterministic Preview provider: {providerSetup?.deterministicProviderAvailable ? "Passed" : "Failed"}
            </span>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-gray-100 bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-medium text-textMuted">Latest run status</p>
            <h2 className="text-base font-semibold capitalize text-textPrimary">
              {selectedRun ? statusLabel(selectedRun.status) : "No run"}
            </h2>
            <p className="mt-1 text-xs text-textMuted">
              {selectedRun ? `${selectedRun.model} · ${selectedRun.promptVersion} · ${selectedRun.toolVersion}` : "Run a suite to see results."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-background px-3 text-sm font-semibold text-textPrimary disabled:opacity-50"
              type="button"
              disabled={busy || !selectedRun || !capabilities?.canRun}
              onClick={cancelRun}
            >
              <XCircle size={16} aria-hidden="true" />
              Cancel run
            </button>
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-background px-3 text-sm font-semibold text-textPrimary disabled:opacity-50"
              type="button"
              disabled={busy || !selectedRun || !capabilities?.canCompareModels}
              onClick={compareRuns}
            >
              <GitCompare size={16} aria-hidden="true" />
              Compare runs
            </button>
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-success px-3 text-sm font-semibold text-white disabled:opacity-50"
              type="button"
              disabled={busy || !selectedRun?.summary?.acceptableAsBaseline || !capabilities?.canCompareModels}
              onClick={acceptBaseline}
            >
              <ShieldCheck size={16} aria-hidden="true" />
              Accept baseline
            </button>
            <a
              className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold ${
                selectedRun && capabilities?.canExport ? "bg-background text-textPrimary" : "pointer-events-none bg-background text-textMuted opacity-50"
              }`}
              href={exportHref}
            >
              <Download size={16} aria-hidden="true" />
              Export report
            </a>
          </div>
        </div>

        {summary ? (
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <SmallStat label="Passed" value={formatCount(summary.passedCases)} />
            <SmallStat label="Failed" value={formatCount(summary.failedCases)} />
            <SmallStat label="Needs review" value={formatCount(summary.needsReviewCases)} />
            <SmallStat label="Token consumption" value={formatCount(summary.totalTokens)} />
            <SmallStat label="Prompt/model/tool version" value={selectedRun ? selectedRun.datasetVersion : "N/A"} />
            <SmallStat label="Baseline" value={selectedRun?.baseline ? "Baseline" : summary.acceptableAsBaseline ? "Ready" : "Blocked"} />
          </div>
        ) : null}

        {comparison ? (
          <div className="mt-4 rounded-lg bg-background p-3 text-sm">
            <p className="font-semibold text-textPrimary">
              {comparison.regression ? "Regression" : "No regression"}
            </p>
            <p className="mt-1 text-xs text-textMuted">
              Score {formatDelta(comparison.scoreDelta)} · Pass rate {formatDelta(comparison.passRateDelta)} · Cost {comparison.costDeltaKobo} kobo · Latency {comparison.latencyDeltaMs} ms
            </p>
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,360px)]">
        <div className="rounded-lg border border-gray-100 bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-textMuted">Failed cases</p>
              <h2 className="text-base font-semibold text-textPrimary">Score breakdown</h2>
            </div>
            <span className="text-xs font-semibold text-textMuted">
              {summary ? `${summary.aggregateScore}/100` : "N/A"}
            </span>
          </div>
          <div className="mt-3 grid gap-2">
            {(selectedRun?.results ?? []).length ? (
              (selectedRun?.results ?? []).map((result) => (
                <button
                  key={result.id}
                  className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg bg-background px-3 py-2 text-left text-sm"
                  type="button"
                  onClick={() => setSelectedCaseId(result.id)}
                >
                  <span>
                    <span className="block font-semibold text-textPrimary">{result.caseKey}</span>
                    <span className={`text-xs ${statusTone[result.status] ?? "text-textMuted"}`}>
                      {statusLabel(result.status)}
                    </span>
                  </span>
                  <span className="text-xs font-semibold text-textMuted">{result.score}/100</span>
                </button>
              ))
            ) : (
              <p className="rounded-lg bg-background p-3 text-sm font-medium text-textSecondary">
                Empty state: no AI evaluation runs have been recorded.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-gray-100 bg-card p-4 shadow-sm">
          <p className="text-xs font-medium text-textMuted">Case detail</p>
          {selectedCase ? (
            <div className="mt-2 space-y-3 text-sm">
              <h2 className="font-semibold text-textPrimary">{selectedCase.caseKey}</h2>
              <p className="text-xs text-textMuted">{selectedCase.category}</p>
              <p className="rounded-lg bg-background p-3 text-xs text-textSecondary">{selectedCase.response}</p>
              <div className="grid gap-2">
                {selectedCase.evaluatorResults.map((item) => (
                  <div key={item.id} className="rounded-lg bg-background p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-textPrimary">{item.label}</span>
                      <span className={item.critical ? "text-xs font-semibold text-danger" : "text-xs font-semibold text-textMuted"}>
                        {item.critical ? "Critical failure" : item.passed ? "Passed" : "Failed"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-textMuted">{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-2 rounded-lg bg-background p-3 text-sm font-medium text-textSecondary">
              Select a run to inspect case detail.
            </p>
          )}
        </div>
      </section>
    </section>
  );
}

function Metric({
  label,
  value,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  icon: ReactNode;
  tone?: "neutral" | "danger";
}) {
  return (
    <div className="rounded-lg border border-gray-100 bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-textMuted">{label}</p>
        <span className={tone === "danger" ? "text-danger" : "text-primary"}>{icon}</span>
      </div>
      <p className="mt-3 text-lg font-semibold text-textPrimary">{value}</p>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-background p-3">
      <p className="text-xs font-medium text-textMuted">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-textPrimary">{value}</p>
    </div>
  );
}

function statusLabel(status: string) {
  return {
    passed: "Passed",
    failed: "Failed",
    critical_failure: "Critical failure",
    needs_review: "Needs review",
    running: "Running",
    queued: "Running",
    cancelled: "Cancelled",
    completed: "Passed",
  }[status] ?? status;
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

function formatDelta(value: number) {
  return value > 0 ? `+${value}` : String(value);
}
