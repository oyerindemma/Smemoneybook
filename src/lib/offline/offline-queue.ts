import type { CaptureFormData } from "@/components/dashboard/types";

type OfflineQueueMetadata = {
  id: string;
  attempts?: number;
  conflict?: boolean;
  createdAt?: string;
  lastError?: string;
  lastStatus?: number;
  updatedAt?: string;
};

export type OfflineQueueItem = OfflineQueueMetadata &
  (
    | {
        type: "transaction";
        url: "/api/transactions";
        body: CaptureFormData & {
          businessId?: string;
          locationId?: string;
          idempotencyKey: string;
        };
      }
    | {
        type: "stock";
        url: string;
        body: {
          businessId?: string;
          locationId?: string;
          quantity: number;
          note?: string;
          idempotencyKey: string;
        };
      }
  );

export type OfflineQueueSummary = {
  total: number;
  failed: number;
  conflicts: number;
};

const queueKey = "smeMoneyBookOfflineQueue";
export const offlineQueueChangedEvent = "smeMoneyBookOfflineQueueChanged";

export function readOfflineQueue(): OfflineQueueItem[] {
  if (typeof window === "undefined") {
    return [];
  }

  const rawQueue = readRawQueue();
  if (!rawQueue) {
    return [];
  }

  try {
    return (JSON.parse(rawQueue) as OfflineQueueItem[]).map(normalizeQueueItem);
  } catch {
    removeStoredQueue();
    return [];
  }
}

export function enqueueOfflineItem(item: OfflineQueueItem) {
  const nextQueue = [...readOfflineQueue(), normalizeQueueItem(item)];
  writeStoredQueue(nextQueue);
  notifyOfflineQueueChanged();
  return nextQueue.length;
}

export function replaceOfflineQueue(items: OfflineQueueItem[]) {
  if (items.length === 0) {
    removeStoredQueue();
    notifyOfflineQueueChanged();
    return;
  }

  writeStoredQueue(items.map(normalizeQueueItem));
  notifyOfflineQueueChanged();
}

export function removeOfflineQueueItem(id: string) {
  const nextQueue = readOfflineQueue().filter((item) => item.id !== id);
  replaceOfflineQueue(nextQueue);
  return getOfflineQueueSummary(nextQueue);
}

export function getOfflineQueueSummary(items = readOfflineQueue()): OfflineQueueSummary {
  return {
    total: items.length,
    failed: items.filter((item) => item.lastError && !item.conflict).length,
    conflicts: items.filter((item) => item.conflict).length,
  };
}

export async function replayOfflineQueue() {
  const queue = readOfflineQueue();
  const remaining: OfflineQueueItem[] = [];

  for (const item of queue) {
    try {
      const response = await fetch(item.url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.body),
      });

      if (!response.ok) {
        const errorMessage = await readResponseMessage(response);
        const failedItem = markFailed(item, response.status, errorMessage);
        remaining.push(failedItem);
        await reportOfflineSyncIssue(failedItem);
      }
    } catch (error) {
      remaining.push(
        markFailed(
          item,
          undefined,
          error instanceof Error ? error.message : "Network unavailable.",
        ),
      );
    }
  }

  replaceOfflineQueue(remaining);
  const summary = getOfflineQueueSummary(remaining);

  return {
    synced: queue.length - remaining.length,
    remaining: summary.total,
    failed: summary.failed,
    conflicts: summary.conflicts,
  };
}

function getQueueStorage() {
  try {
    return window.sessionStorage;
  } catch {
    return window.localStorage;
  }
}

function readRawQueue() {
  const storage = getQueueStorage();
  const rawQueue = storage.getItem(queueKey);

  if (rawQueue) {
    return rawQueue;
  }

  if (storage !== window.localStorage) {
    const legacyQueue = window.localStorage.getItem(queueKey);
    if (legacyQueue) {
      storage.setItem(queueKey, legacyQueue);
      window.localStorage.removeItem(queueKey);
      return legacyQueue;
    }
  }

  return null;
}

function writeStoredQueue(items: OfflineQueueItem[]) {
  const storage = getQueueStorage();
  storage.setItem(queueKey, JSON.stringify(items));

  if (storage !== window.localStorage) {
    window.localStorage.removeItem(queueKey);
  }
}

function removeStoredQueue() {
  getQueueStorage().removeItem(queueKey);
  window.localStorage.removeItem(queueKey);
}

function notifyOfflineQueueChanged() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(offlineQueueChangedEvent));
}

function normalizeQueueItem(item: OfflineQueueItem): OfflineQueueItem {
  const now = new Date().toISOString();
  return {
    ...item,
    attempts: item.attempts ?? 0,
    conflict: Boolean(item.conflict),
    createdAt: item.createdAt ?? now,
    updatedAt: item.updatedAt ?? now,
  };
}

function markFailed(item: OfflineQueueItem, status: number | undefined, message: string) {
  return {
    ...item,
    attempts: (item.attempts ?? 0) + 1,
    conflict: status === 409,
    lastError: message,
    lastStatus: status,
    updatedAt: new Date().toISOString(),
  };
}

async function readResponseMessage(response: Response) {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return payload?.error ?? `Sync failed with status ${response.status}.`;
}

async function reportOfflineSyncIssue(item: OfflineQueueItem) {
  const businessId = item.body.businessId;

  if (!businessId) {
    return;
  }

  await fetch("/api/offline/sync-operations", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      businessId,
      operationId: item.id,
      operationType: item.type,
      status: item.conflict ? "CONFLICT" : "FAILED",
      retryCount: item.attempts ?? 0,
      errorMessage: item.lastError,
      payloadSummary: buildPayloadSummary(item),
    }),
  }).catch(() => undefined);
}

function buildPayloadSummary(item: OfflineQueueItem) {
  if (item.type === "stock") {
    return {
      type: item.type,
      url: item.url,
      locationId: item.body.locationId,
      quantity: item.body.quantity,
      hasNote: Boolean(item.body.note),
      idempotencyKey: item.body.idempotencyKey,
    };
  }

  return {
    type: item.type,
    locationId: item.body.locationId,
    transactionType: item.body.type,
    amount: item.body.amount,
    hasItems: Boolean(item.body.invoiceItems?.length),
    hasParty: Boolean(item.body.partyName),
    idempotencyKey: item.body.idempotencyKey,
  };
}
