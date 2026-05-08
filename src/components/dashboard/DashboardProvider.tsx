"use client";

import { RefreshCw, WifiOff } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { CaptureFormData } from "@/components/dashboard/types";
import { RecordMoneySheet } from "@/components/money/RecordMoneySheet";
import { ListSkeleton, SummarySkeleton } from "@/components/dashboard/Skeleton";
import { NoticeToast } from "@/components/dashboard/NoticeToast";
import { UpgradePrompt } from "@/components/dashboard/UpgradePrompt";
import { getDailyDashboardSummary, getTodayActivities } from "@/lib/dashboard/dashboard-summary";
import {
  MoneybookState,
  recordTransaction,
} from "@/lib/bookkeeping/transaction-engine";
import { sendDebtReminderAction } from "@/server/actions/whatsapp/send-debt-reminder";
import { sendInvoiceAction } from "@/server/actions/whatsapp/send-invoice";
import { sendPaymentConfirmationAction } from "@/server/actions/whatsapp/send-payment-confirmation";
import { sendStockAlertAction } from "@/server/actions/whatsapp/send-stock-alert";

type DashboardPayload = {
  state?: MoneybookState;
  error?: string;
};

type SyncStatus = "online" | "offline" | "retrying" | "error";

type DashboardContextValue = {
  state: MoneybookState;
  summary: ReturnType<typeof getDailyDashboardSummary>;
  todayActivityCount: number;
  notice: string;
  setNotice: (message: string) => void;
  openRecordModal: () => void;
  recordMoney: (formData: CaptureFormData) => Promise<boolean>;
  reverseActivity: (transactionId: string) => Promise<void>;
  collectDebt: (debtId: string, accountId: string, amount?: number) => Promise<void>;
  settleSupplierDebt: (debtId: string, accountId: string, amount?: number) => Promise<void>;
  remindDebt: (debtId: string, channel: "manual" | "whatsapp" | "sms") => Promise<void>;
  sendInvoice: (debtId: string) => Promise<void>;
  sendPaymentConfirmation: (debtId: string, amount?: number) => Promise<void>;
  sendStockAlert: (itemId: string, ownerPhone: string) => Promise<void>;
  createInventoryItem: (input: {
    name: string;
    sellingPrice: number;
    costPrice: number;
    quantityOnHand: number;
    lowStockLevel: number;
  }) => Promise<void>;
  moveInventory: (
    itemId: string,
    direction: "in" | "out",
    quantity: number,
    note?: string,
  ) => Promise<void>;
  showUpgradePrompt: (prompt: { title: string; description: string }) => void;
};

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<MoneybookState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState("Your money is up to date.");
  const [isOnline, setIsOnline] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("online");
  const [isRecordOpen, setIsRecordOpen] = useState(false);
  const [upgradePrompt, setUpgradePrompt] = useState<{
    title: string;
    description: string;
  } | null>(null);

  const summary = useMemo(
    () => (state ? getDailyDashboardSummary(state) : null),
    [state],
  );
  const todayActivityCount = useMemo(
    () => (state ? getTodayActivities(state).length : 0),
    [state],
  );

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setSyncStatus((current) => (current === "offline" ? current : "retrying"));
    const selectedBusinessId =
      typeof window === "undefined" ? "" : localStorage.getItem("selectedBusinessId");
    const query = selectedBusinessId
      ? `?businessId=${encodeURIComponent(selectedBusinessId)}`
      : "";

    try {
      const response = await fetch(`/api/dashboard/summary${query}`, {
        credentials: "include",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as DashboardPayload | null;

      if (response.ok && payload?.state) {
        setState(payload.state);
        setSyncStatus("online");
        if (payload.state.businessId) {
          localStorage.setItem("selectedBusinessId", payload.state.businessId);
        }
        setIsLoading(false);
        return;
      }

      if (response.status === 401) {
        handleSessionExpired();
        return;
      }

      setNotice(payload?.error ?? "Couldn’t refresh your money. Try again.");
      setSyncStatus("error");
      setIsLoading(false);
    } catch {
      setNotice("Something went wrong. Check your internet and try again.");
      setSyncStatus(navigator.onLine ? "error" : "offline");
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDashboard();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadDashboard]);

  useEffect(() => {
    localStorage.removeItem("offlineTransactions");
    const timer = window.setTimeout(() => {
      setIsOnline(navigator.onLine);
      setSyncStatus(navigator.onLine ? "online" : "offline");
    }, 0);

    const handleOnline = () => {
      setIsOnline(true);
      setNotice("You’re back online. Refreshing your money.");
      void loadDashboard();
    };
    const handleOffline = () => {
      setIsOnline(false);
      setSyncStatus("offline");
      setNotice("You’re offline. Reconnect before saving money changes.");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [loadDashboard]);

  const retryNow = useCallback(() => {
    if (!navigator.onLine) {
      setSyncStatus("offline");
      setNotice("Still offline. Check your connection and try again.");
      return;
    }

    void loadDashboard();
  }, [loadDashboard]);

  function requireOnline() {
    if (navigator.onLine) {
      return true;
    }

    setIsOnline(false);
    setSyncStatus("offline");
    setNotice("You’re offline. Reconnect before saving money changes.");
    return false;
  }

  async function recordMoney(formData: CaptureFormData) {
    if (!state) {
      return false;
    }

    if (!requireOnline()) {
      return false;
    }

    const idempotencyKey = createClientIdempotencyKey("ui");
    const businessId = state.businessId;

    try {
      setState(
        recordTransaction(state, {
          ...formData,
          idempotencyKey,
        }),
      );

      const response = await fetch("/api/transactions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          businessId,
          idempotencyKey,
        }),
      });
      const payload = (await response.json().catch(() => null)) as DashboardPayload | null;

      if (response.status === 401) {
        handleSessionExpired();
        return false;
      }

      if (response.ok && payload?.state) {
        setState(payload.state);
        setNotice("Money saved");
        return true;
      }

      setNotice("Couldn’t save. Try again.");
      await loadDashboard();
      return false;
    } catch {
      setNotice("Couldn’t save. Try again.");
      setSyncStatus(navigator.onLine ? "error" : "offline");
      await loadDashboard();
      return false;
    }
  }

  async function reverseActivity(transactionId: string) {
    if (!requireOnline()) {
      return;
    }

    const response = await fetch(`/api/transactions/${transactionId}/reverse`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Correction", businessId: state?.businessId }),
    });
    await refreshFromResponse(response, "Activity corrected.");
  }

  async function collectDebt(debtId: string, accountId: string, amount?: number) {
    if (!requireOnline()) {
      return;
    }

    const response = await fetch(`/api/debts/${debtId}/collect`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId,
        amount,
        businessId: state?.businessId,
        idempotencyKey: createClientIdempotencyKey("collect"),
      }),
    });
    await refreshFromResponse(response, "Collected money saved.");
  }

  async function settleSupplierDebt(debtId: string, accountId: string, amount?: number) {
    if (!requireOnline()) {
      return;
    }

    const response = await fetch(`/api/debts/${debtId}/settle`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId,
        amount,
        businessId: state?.businessId,
        idempotencyKey: createClientIdempotencyKey("settle"),
      }),
    });
    await refreshFromResponse(response, "Supplier payment saved.");
  }

  async function remindDebt(debtId: string, channel: "manual" | "whatsapp" | "sms") {
    if (!requireOnline()) {
      return;
    }

    if (channel === "whatsapp" && state?.businessId) {
      const result = await sendDebtReminderAction({ businessId: state.businessId, debtId });
      if (result.state) {
        setState(result.state);
      }
      setNotice(result.message);
      return;
    }

    const response = await fetch(`/api/debts/${debtId}/remind`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel, businessId: state?.businessId }),
    });
    const payload = (await response.json().catch(() => null)) as
      | (DashboardPayload & { message?: string; whatsappUrl?: string })
      | null;

    if (response.ok) {
      if (payload?.state) {
        setState(payload.state);
        setSyncStatus("online");
      }
      setNotice(payload?.message ?? "Reminder noted.");
      if (payload?.whatsappUrl) {
        window.open(payload.whatsappUrl, "_blank", "noopener,noreferrer");
      }
      return;
    }

    setNotice("Something went wrong. Check your internet and try again.");
  }

  async function sendInvoice(debtId: string) {
    if (!state?.businessId || !requireOnline()) {
      return;
    }

    const result = await sendInvoiceAction({ businessId: state.businessId, debtId });
    setNotice(result.message);
  }

  async function sendPaymentConfirmation(debtId: string, amount?: number) {
    if (!state?.businessId || !requireOnline()) {
      return;
    }

    const result = await sendPaymentConfirmationAction({
      businessId: state.businessId,
      debtId,
      amount,
    });
    setNotice(result.message);
  }

  async function createInventoryItem(input: {
    name: string;
    sellingPrice: number;
    costPrice: number;
    quantityOnHand: number;
    lowStockLevel: number;
  }) {
    if (!requireOnline()) {
      return;
    }

    const response = await fetch("/api/inventory", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, businessId: state?.businessId }),
    });
    await refreshFromResponse(response, "Product added");
  }

  async function moveInventory(
    itemId: string,
    direction: "in" | "out",
    quantity: number,
    note?: string,
  ) {
    if (!requireOnline()) {
      return;
    }

    const response = await fetch(
      `/api/inventory/${itemId}/${direction === "in" ? "stock-in" : "stock-out"}`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity, note, businessId: state?.businessId }),
      },
    );
    await refreshFromResponse(response, "Stock updated");
  }

  async function sendStockAlert(itemId: string, ownerPhone: string) {
    if (!state?.businessId || !requireOnline()) {
      return;
    }

    const result = await sendStockAlertAction({
      businessId: state.businessId,
      itemId,
      ownerPhone,
    });
    setNotice(result.message);
  }

  async function refreshFromResponse(response: Response, successMessage: string) {
    const payload = (await response.json().catch(() => null)) as DashboardPayload | null;

    if (response.status === 401) {
      handleSessionExpired();
      return;
    }

    if (response.ok && payload?.state) {
      setState(payload.state);
      setSyncStatus("online");
      setNotice(successMessage);
      return;
    }

    setNotice("Couldn’t save. Try again.");
    setSyncStatus("error");
  }

  if (isLoading || !state || !summary) {
    return (
      <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-y-8 px-5 py-8 md:py-10">
        <SummarySkeleton />
        <section className="rounded-2xl bg-card p-6 shadow-sm border border-gray-100 transition hover:shadow-md sm:p-7">
          <ListSkeleton rows={4} />
        </section>
      </div>
    );
  }

  return (
    <DashboardContext.Provider
      value={{
        state,
        summary,
        todayActivityCount,
        notice,
        setNotice,
        openRecordModal: () => setIsRecordOpen(true),
        recordMoney,
        reverseActivity,
        collectDebt,
        settleSupplierDebt,
        remindDebt,
        sendInvoice,
        sendPaymentConfirmation,
        createInventoryItem,
        moveInventory,
        sendStockAlert,
        showUpgradePrompt: setUpgradePrompt,
      }}
    >
      {children}
      {isRecordOpen ? (
        <RecordMoneySheet
          accounts={state.accounts}
          onClose={() => setIsRecordOpen(false)}
          onSubmit={recordMoney}
        />
      ) : null}
      {upgradePrompt ? (
        <UpgradePrompt
          title={upgradePrompt.title}
          description={upgradePrompt.description}
          onClose={() => setUpgradePrompt(null)}
          onUpgrade={() => {
            setUpgradePrompt(null);
            setNotice("Upgrade checkout is not ready yet.");
          }}
        />
      ) : null}
      <SyncStatusBanner
        isOnline={isOnline}
        status={syncStatus}
        onRetry={retryNow}
      />
      <NoticeToast message={notice} />
    </DashboardContext.Provider>
  );
}

function handleSessionExpired() {
  localStorage.removeItem("selectedBusinessId");
  window.location.replace("/?session=expired");
}

export function useDashboard() {
  const context = useContext(DashboardContext);

  if (!context) {
    throw new Error("useDashboard must be used inside DashboardProvider.");
  }

  return context;
}

function createClientIdempotencyKey(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function SyncStatusBanner({
  isOnline,
  status,
  onRetry,
}: {
  isOnline: boolean;
  status: SyncStatus;
  onRetry: () => void;
}) {
  if (isOnline && status === "online") {
    return null;
  }

  const isRetrying = status === "retrying";
  const message = !isOnline
    ? "Offline. Money changes won’t save until you reconnect."
    : isRetrying
      ? "Refreshing your latest money records..."
      : "Couldn’t refresh. Check your connection and retry.";

  return (
    <div className="fixed inset-x-4 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-accent/30 bg-card px-4 py-3 text-sm font-semibold text-textPrimary shadow-xl">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
        {isRetrying ? (
          <RefreshCw className="animate-spin" size={18} aria-hidden="true" />
        ) : (
          <WifiOff size={18} aria-hidden="true" />
        )}
      </span>
      <span className="flex-1 leading-5">{message}</span>
      <button
        className="min-h-11 rounded-xl bg-primary px-4 text-xs font-semibold text-white transition-all duration-150 hover:bg-primaryHover hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        type="button"
        disabled={isRetrying}
        onClick={onRetry}
      >
        Retry
      </button>
    </div>
  );
}
