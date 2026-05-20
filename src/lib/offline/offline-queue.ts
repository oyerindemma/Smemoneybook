import type { CaptureFormData } from "@/components/dashboard/types";

export type OfflineQueueItem =
  | {
      id: string;
      type: "transaction";
      url: "/api/transactions";
      body: CaptureFormData & { businessId?: string; idempotencyKey: string };
    }
  | {
      id: string;
      type: "stock";
      url: string;
      body: { businessId?: string; quantity: number; note?: string };
    };

const queueKey = "smeMoneyBookOfflineQueue";

export function readOfflineQueue(): OfflineQueueItem[] {
  if (typeof window === "undefined") {
    return [];
  }

  const rawQueue = localStorage.getItem(queueKey);
  if (!rawQueue) {
    return [];
  }

  try {
    return JSON.parse(rawQueue) as OfflineQueueItem[];
  } catch {
    localStorage.removeItem(queueKey);
    return [];
  }
}

export function enqueueOfflineItem(item: OfflineQueueItem) {
  const nextQueue = [...readOfflineQueue(), item];
  localStorage.setItem(queueKey, JSON.stringify(nextQueue));
  return nextQueue.length;
}

export function replaceOfflineQueue(items: OfflineQueueItem[]) {
  if (items.length === 0) {
    localStorage.removeItem(queueKey);
    return;
  }

  localStorage.setItem(queueKey, JSON.stringify(items));
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
        remaining.push(item);
      }
    } catch {
      remaining.push(item);
    }
  }

  replaceOfflineQueue(remaining);
  return {
    synced: queue.length - remaining.length,
    remaining: remaining.length,
  };
}
