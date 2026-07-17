"use client";

import { useEffect, useState } from "react";
import { removeOfflineQueueItem } from "@/lib/offline/offline-queue";

type OfflineSyncOperation = {
  id: string;
  operationId: string;
  operationType: string;
  payload: unknown;
  status: "failed" | "conflict";
  retryCount: number;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
};

export function OfflineSyncReviewPanel({
  businessId,
  onNotice,
}: {
  businessId?: string;
  onNotice: (message: string) => void;
}) {
  const [operations, setOperations] = useState<OfflineSyncOperation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [resolvingId, setResolvingId] = useState("");

  useEffect(() => {
    if (!businessId) {
      return;
    }

    const selectedBusinessId = businessId;
    let isActive = true;

    async function loadOperations() {
      setIsLoading(true);
      const response = await fetch(
        `/api/offline/sync-operations?businessId=${encodeURIComponent(selectedBusinessId)}`,
        {
          credentials: "include",
          cache: "no-store",
        },
      ).catch(() => null);

      if (!isActive) {
        return;
      }

      setIsLoading(false);

      if (!response?.ok) {
        return;
      }

      const payload = (await response.json().catch(() => null)) as {
        operations?: OfflineSyncOperation[];
      } | null;

      setOperations(payload?.operations ?? []);
    }

    void loadOperations();

    return () => {
      isActive = false;
    };
  }, [businessId]);

  if (!businessId) {
    return null;
  }

  async function markResolved(operation: OfflineSyncOperation) {
    if (!businessId) {
      return;
    }

    setResolvingId(operation.id);
    const response = await fetch("/api/offline/sync-operations", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessId,
        operationId: operation.operationId,
      }),
    });
    setResolvingId("");

    if (!response.ok) {
      onNotice("Could not update offline review item.");
      return;
    }

    setOperations((current) => current.filter((item) => item.id !== operation.id));
    removeOfflineQueueItem(operation.operationId);
    onNotice("Offline review item resolved.");
  }

  return (
    <section
      id="offline-sync"
      className="rounded-2xl border border-gray-100 bg-card p-6 shadow-sm"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-medium text-textSecondary">Offline sync</p>
          <h2 className="mt-1 text-base font-semibold text-textPrimary">Review queue</h2>
        </div>
        <span className="w-fit rounded-xl bg-background px-3 py-2 text-xs font-semibold text-textSecondary">
          {operations.length} open
        </span>
      </div>

      <div className="mt-4 grid gap-3">
        {isLoading ? (
          <p className="rounded-xl bg-background px-4 py-3 text-sm text-textSecondary">
            Loading review queue...
          </p>
        ) : operations.length === 0 ? (
          <p className="rounded-xl bg-background px-4 py-3 text-sm text-textSecondary">
            No offline sync issues.
          </p>
        ) : (
          operations.map((operation) => (
            <article
              key={operation.id}
              className="rounded-xl border border-gray-100 bg-background px-4 py-3"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold capitalize text-textPrimary">
                      {operation.operationType}
                    </p>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        operation.status === "conflict"
                          ? "bg-danger/10 text-danger"
                          : "bg-accent/10 text-accent"
                      }`}
                    >
                      {operation.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-textSecondary">
                    Last attempt {formatDate(operation.updatedAt)} · {operation.retryCount} retry
                    {operation.retryCount === 1 ? "" : "s"}
                  </p>
                  {operation.lastError ? (
                    <p className="mt-2 text-sm text-textSecondary">{operation.lastError}</p>
                  ) : null}
                  <p className="mt-2 font-mono text-xs text-textMuted">
                    {formatPayload(operation.payload)}
                  </p>
                </div>
                <button
                  className="min-h-11 shrink-0 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-primaryHover disabled:cursor-not-allowed disabled:opacity-50"
                  type="button"
                  disabled={Boolean(resolvingId)}
                  onClick={() => void markResolved(operation)}
                >
                  {resolvingId === operation.id ? "Updating..." : "Mark resolved"}
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function formatPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "No payload summary";
  }

  const entries = Object.entries(payload)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .slice(0, 5)
    .map(([key, value]) => `${key}: ${String(value)}`);

  return entries.length > 0 ? entries.join(" | ") : "No payload summary";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
