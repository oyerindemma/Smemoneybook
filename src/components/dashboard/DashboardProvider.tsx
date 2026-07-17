"use client";

import { RefreshCw, WifiOff } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type {
  CaptureFormData,
  RecordMoneyMode,
} from "@/components/dashboard/types";
import type { VoiceBookkeepingDraft } from "@/lib/voice";
import { RecordMoneySheet } from "@/components/money/RecordMoneySheet";
import { ListSkeleton, SummarySkeleton } from "@/components/dashboard/Skeleton";
import { NoticeToast } from "@/components/dashboard/NoticeToast";
import { UpgradePrompt } from "@/components/dashboard/UpgradePrompt";
import { getDailyDashboardSummary, getTodayActivities } from "@/lib/dashboard/dashboard-summary";
import {
  type InventoryItem,
  MoneybookState,
  type ReceiptConfig,
  recordTransaction,
} from "@/lib/bookkeeping/transaction-engine";
import {
  enqueueOfflineItem,
  getOfflineQueueSummary,
  offlineQueueChangedEvent,
  replayOfflineQueue,
} from "@/lib/offline/offline-queue";
import {
  initProductAnalytics,
  startProductAnalyticsSession,
  trackProductEvent,
} from "@/lib/analytics/product-analytics";
import { sendDebtReminderAction } from "@/server/actions/whatsapp/send-debt-reminder";
import { sendPaymentConfirmationAction } from "@/server/actions/whatsapp/send-payment-confirmation";
import { sendStockAlertAction } from "@/server/actions/whatsapp/send-stock-alert";
import { phase1FeatureFlags } from "@/lib/phase1/feature-flags";

type DashboardPayload = {
  state?: MoneybookState;
  error?: string;
};

type PosReceipt = {
  transactionId: string;
  receiptNo: string;
  total: number;
  paidAmount: number;
  balance: number;
  items: Array<{
    name: string;
    quantity: number;
    unitLabel?: string;
    unitPrice: number;
    discount: number;
    total: number;
  }>;
  payments: Array<{
    method: string;
    amount: number;
  }>;
  createdAt: string;
};

type PosCheckoutInput = {
  locationId?: string;
  items: Array<{ inventoryItemId: string; quantity: number; discount?: number }>;
  payments: Array<{
    method: "cash" | "bank_transfer" | "pos_terminal" | "card" | "wallet" | "other";
    amount: number;
    accountId?: string;
    note?: string;
  }>;
  orderDiscount: number;
  customerName?: string;
  customerPhone?: string;
  note?: string;
  createInvoice?: boolean;
};

type CustomerReturnInput = {
  locationId?: string;
  originalTransactionId: string;
  reason: string;
  disposition: "sellable_stock" | "damaged_stock" | "no_stock";
  outcome:
    | "cash_refund"
    | "transfer_refund"
    | "store_credit"
    | "exchange"
    | "reduce_customer_balance";
  accountId?: string;
  note?: string;
  items: Array<{ inventoryItemId: string; quantity: number }>;
};

type SupplierReturnInput = {
  locationId?: string;
  reason: string;
  settlement:
    | "supplier_credit"
    | "refund_received"
    | "replacement_expected"
    | "reduce_supplier_bill";
  supplierId?: string;
  originalTransactionId?: string;
  accountId?: string;
  note?: string;
  items: Array<{ inventoryItemId: string; quantity: number }>;
};

type ReceiptConfigInput = ReceiptConfig;

type SyncStatus = "online" | "offline" | "retrying" | "error";

type DashboardContextValue = {
  state: MoneybookState;
  summary: ReturnType<typeof getDailyDashboardSummary>;
  todayActivityCount: number;
  notice: string;
  setNotice: (message: string) => void;
  openRecordModal: (mode?: RecordMoneyMode) => void;
  openVoiceDraft: (draft: VoiceBookkeepingDraft) => void;
  recordMoney: (formData: CaptureFormData) => Promise<boolean>;
  reverseActivity: (transactionId: string) => Promise<void>;
  collectDebt: (debtId: string, accountId: string, amount?: number) => Promise<void>;
  settleSupplierDebt: (debtId: string, accountId: string, amount?: number) => Promise<void>;
  remindDebt: (debtId: string, channel: "manual" | "whatsapp" | "sms") => Promise<void>;
  sendPaymentConfirmation: (debtId: string, amount?: number) => Promise<void>;
  sendStockAlert: (itemId: string, ownerPhone: string) => Promise<{ whatsappUrl?: string } | void>;
  checkoutPos: (input: PosCheckoutInput) => Promise<PosReceipt | null>;
  submitCustomerReturn: (input: CustomerReturnInput) => Promise<boolean>;
  submitSupplierReturn: (input: SupplierReturnInput) => Promise<boolean>;
  saveReceiptConfig: (input: ReceiptConfigInput) => Promise<boolean>;
  createInventoryItem: (input: {
    name: string;
    sku?: string;
    barcode?: string;
    unitName?: string;
    baseUnitName?: string;
    sellingUnitName?: string;
    conversionFactor?: number;
    categoryName?: string;
    brandName?: string;
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
  const [queuedCount, setQueuedCount] = useState(0);
  const [failedSyncCount, setFailedSyncCount] = useState(0);
  const [conflictSyncCount, setConflictSyncCount] = useState(0);
  const [isRecordOpen, setIsRecordOpen] = useState(false);
  const [recordMode, setRecordMode] = useState<RecordMoneyMode>("money");
  const [voiceDraft, setVoiceDraft] = useState<VoiceBookkeepingDraft | null>(null);
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

  const applyOfflineQueueSummary = useCallback(
    (summary = getOfflineQueueSummary()) => {
      setQueuedCount(summary.total);
      setFailedSyncCount(summary.failed);
      setConflictSyncCount(summary.conflicts);
      return summary;
    },
    [],
  );

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setSyncStatus((current) => (current === "offline" ? current : "retrying"));
    const selectedBusinessId =
      typeof window === "undefined" ? "" : localStorage.getItem("selectedBusinessId");
    const selectedLocationId =
      typeof window === "undefined" ? "" : getStoredLocationId(selectedBusinessId);
    const params = new URLSearchParams();

    if (selectedBusinessId) {
      params.set("businessId", selectedBusinessId);
    }

    if (selectedLocationId) {
      params.set("locationId", selectedLocationId);
    }

    const query = params.size > 0 ? `?${params.toString()}` : "";

    try {
      const response = await fetch(`/api/dashboard/summary${query}`, {
        credentials: "include",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as DashboardPayload | null;

      if (response.ok && payload?.state) {
        setState(payload.state);
        trackProductEvent("dashboard_loaded", {
          business_type: payload.state.businessType ?? "Unknown",
          onboarding_completed: Boolean(payload.state.onboardingCompleted),
          transaction_count: payload.state.transactions.length,
        });
        setSyncStatus("online");
        if (payload.state.businessId) {
          localStorage.setItem("selectedBusinessId", payload.state.businessId);
        }
        if (payload.state.businessId && payload.state.selectedLocationId) {
          localStorage.setItem(
            getLocationStorageKey(payload.state.businessId),
            payload.state.selectedLocationId,
          );
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

  const syncOfflineQueue = useCallback(async () => {
    if (!phase1FeatureFlags.offlineQueue) {
      setQueuedCount(0);
      setSyncStatus(navigator.onLine ? "online" : "offline");
      return;
    }

    setSyncStatus("retrying");
    const result = await replayOfflineQueue();
    applyOfflineQueueSummary({
      total: result.remaining,
      failed: result.failed,
      conflicts: result.conflicts,
    });

    if (result.remaining > 0) {
      setSyncStatus("error");
      if (result.conflicts > 0) {
        setNotice(
          `${result.conflicts} offline change${result.conflicts === 1 ? "" : "s"} need review before syncing.`,
        );
        return;
      }

      setNotice(
        result.failed > 0
          ? `${result.failed} offline change${result.failed === 1 ? "" : "s"} could not sync. Retry or review it.`
          : "Some saved changes still need internet.",
      );
      return;
    }

    await loadDashboard();
    if (result.synced > 0) {
      setNotice("Offline changes synced.");
    }
  }, [applyOfflineQueueSummary, loadDashboard]);

  useEffect(() => {
    initProductAnalytics();
    startProductAnalyticsSession();
    const timer = window.setTimeout(() => {
      void loadDashboard();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadDashboard]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsOnline(navigator.onLine);
      const queueSummary = phase1FeatureFlags.offlineQueue
        ? applyOfflineQueueSummary()
        : { total: 0, failed: 0, conflicts: 0 };
      setSyncStatus(navigator.onLine ? (queueSummary.total > 0 ? "retrying" : "online") : "offline");
      if (navigator.onLine && queueSummary.total > 0) {
        void syncOfflineQueue();
      }
    }, 0);

    const handleOnline = () => {
      setIsOnline(true);
      const queueSummary = phase1FeatureFlags.offlineQueue
        ? applyOfflineQueueSummary()
        : { total: 0, failed: 0, conflicts: 0 };
      if (queueSummary.total > 0) {
        setNotice("You’re back online. Syncing saved changes.");
        void syncOfflineQueue();
        return;
      }

      setSyncStatus("online");
      setNotice("You’re back online.");
    };
    const handleOffline = () => {
      setIsOnline(false);
      setSyncStatus("offline");
      setNotice("You’re offline. Reconnect before saving money changes.");
    };
    const handleOfflineQueueChanged = () => {
      applyOfflineQueueSummary();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener(offlineQueueChangedEvent, handleOfflineQueueChanged);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener(offlineQueueChangedEvent, handleOfflineQueueChanged);
    };
  }, [applyOfflineQueueSummary, loadDashboard, syncOfflineQueue]);

  const retryNow = useCallback(() => {
    if (!navigator.onLine) {
      setSyncStatus("offline");
      setNotice("Still offline. Check your connection and try again.");
      return;
    }

    const queueSummary = phase1FeatureFlags.offlineQueue
      ? applyOfflineQueueSummary()
      : { total: 0, failed: 0, conflicts: 0 };
    if (queueSummary.total > 0) {
      void syncOfflineQueue();
      return;
    }

    void loadDashboard();
  }, [applyOfflineQueueSummary, loadDashboard, syncOfflineQueue]);

  function requireOnline() {
    if (navigator.onLine) {
      return true;
    }

    setIsOnline(false);
    setSyncStatus("offline");
    setNotice(
      phase1FeatureFlags.offlineQueue
        ? "You’re offline. Changes will sync when internet returns."
        : "You’re offline. Reconnect before saving changes.",
    );
    return false;
  }

  async function recordMoney(formData: CaptureFormData) {
    if (!state) {
      return false;
    }

    const idempotencyKey = createClientIdempotencyKey("ui");
    const businessId = state.businessId;
    const isFirstTransaction = state.transactions.length === 0;
    const optimisticState = recordTransaction(state, {
      ...formData,
      idempotencyKey,
    });

    if (!requireOnline()) {
      if (!phase1FeatureFlags.offlineQueue) {
        setNotice("You’re offline. Reconnect before saving money changes.");
        return false;
      }

      setState(optimisticState);
      enqueueOfflineItem({
        id: idempotencyKey,
        type: "transaction",
        url: "/api/transactions",
        body: {
          ...formData,
          businessId,
          locationId: state.selectedLocationId,
          idempotencyKey,
        },
      });
      applyOfflineQueueSummary();
      setNotice("Saved offline. MoneyBook will sync it later.");
      trackProductEvent("transaction_saved", {
        type: formData.type,
        offline: true,
        business_type: state.businessType ?? "Unknown",
        is_first_transaction: isFirstTransaction,
      });
      if (isFirstTransaction) {
        trackProductEvent("first_transaction_recorded", {
          type: formData.type,
          offline: true,
          business_type: state.businessType ?? "Unknown",
        });
      }
      return true;
    }

    try {
      setState(optimisticState);

      const response = await fetch("/api/transactions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          businessId,
          locationId: state.selectedLocationId,
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
        setNotice(buildSavedMoneyNotice(payload.state, formData.type, isFirstTransaction));
        trackProductEvent("transaction_saved", {
          type: formData.type,
          offline: false,
          business_type: state.businessType ?? "Unknown",
          is_first_transaction: isFirstTransaction,
        });
        if (isFirstTransaction) {
          trackProductEvent("first_transaction_recorded", {
            type: formData.type,
            offline: false,
            business_type: state.businessType ?? "Unknown",
          });
          trackProductEvent("activation_aha_moment", {
            type: formData.type,
            business_type: state.businessType ?? "Unknown",
          });
        }
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
    sku?: string;
    barcode?: string;
    unitName?: string;
    baseUnitName?: string;
    sellingUnitName?: string;
    conversionFactor?: number;
    categoryName?: string;
    brandName?: string;
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
      body: JSON.stringify({
        ...input,
        businessId: state?.businessId,
        locationId: state?.selectedLocationId,
      }),
    });
    await refreshFromResponse(response, "Product added");
  }

  async function moveInventory(
    itemId: string,
    direction: "in" | "out",
    quantity: number,
    note?: string,
  ) {
    if (!state) {
      return;
    }

    if (!requireOnline()) {
      if (!phase1FeatureFlags.offlineQueue) {
        setNotice("You’re offline. Reconnect before saving stock changes.");
        return;
      }

      const idempotencyKey = createClientIdempotencyKey("stock");
      setState(applyLocalStockMove(state, itemId, direction, quantity, note));
      enqueueOfflineItem({
        id: idempotencyKey,
        type: "stock",
        url: `/api/inventory/${itemId}/${direction === "in" ? "stock-in" : "stock-out"}`,
        body: {
          quantity,
          note,
          businessId: state.businessId,
          locationId: state.selectedLocationId,
          idempotencyKey,
        },
      });
      applyOfflineQueueSummary();
      setNotice("Stock saved offline. MoneyBook will sync it later.");
      return;
    }

    const idempotencyKey = createClientIdempotencyKey("stock");
    const response = await fetch(
      `/api/inventory/${itemId}/${direction === "in" ? "stock-in" : "stock-out"}`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quantity,
          note,
          businessId: state?.businessId,
          locationId: state.selectedLocationId,
          idempotencyKey,
        }),
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
    return result.whatsappUrl ? { whatsappUrl: result.whatsappUrl } : undefined;
  }

  async function checkoutPos(input: PosCheckoutInput) {
    if (!phase1FeatureFlags.pos) {
      setNotice("POS is turned off for this rollout.");
      return null;
    }

    if (!state?.businessId || !requireOnline()) {
      return null;
    }

    const response = await fetch("/api/pos/checkout", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...input,
        businessId: state.businessId,
        locationId: input.locationId ?? state.selectedLocationId,
        idempotencyKey: createClientIdempotencyKey("pos"),
      }),
    });
    const payload = (await response.json().catch(() => null)) as
      | (DashboardPayload & { receipt?: PosReceipt })
      | null;

    if (response.ok && payload?.state) {
      setState(payload.state);
      setSyncStatus("online");
      setNotice("Checkout saved.");
      return payload.receipt ?? null;
    }

    setNotice(payload?.error ?? "Could not save checkout.");
    setSyncStatus("error");
    return null;
  }

  async function submitCustomerReturn(input: CustomerReturnInput) {
    if (!phase1FeatureFlags.returns) {
      setNotice("Customer returns are turned off for this rollout.");
      return false;
    }

    if (!state?.businessId || !requireOnline()) {
      return false;
    }

    const response = await fetch("/api/returns/customer", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...input,
        businessId: state.businessId,
        locationId: input.locationId ?? state.selectedLocationId,
        idempotencyKey: createClientIdempotencyKey("customer-return"),
      }),
    });
    const payload = (await response.json().catch(() => null)) as DashboardPayload | null;

    if (response.ok && payload?.state) {
      setState(payload.state);
      setSyncStatus("online");
      setNotice("Customer return saved.");
      return true;
    }

    setNotice(payload?.error ?? "Could not save customer return.");
    setSyncStatus("error");
    return false;
  }

  async function submitSupplierReturn(input: SupplierReturnInput) {
    if (!phase1FeatureFlags.returns) {
      setNotice("Supplier returns are turned off for this rollout.");
      return false;
    }

    if (!state?.businessId || !requireOnline()) {
      return false;
    }

    const response = await fetch("/api/returns/supplier", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...input,
        businessId: state.businessId,
        locationId: input.locationId ?? state.selectedLocationId,
        idempotencyKey: createClientIdempotencyKey("supplier-return"),
      }),
    });
    const payload = (await response.json().catch(() => null)) as DashboardPayload | null;

    if (response.ok && payload?.state) {
      setState(payload.state);
      setSyncStatus("online");
      setNotice("Supplier return saved.");
      return true;
    }

    setNotice(payload?.error ?? "Could not save supplier return.");
    setSyncStatus("error");
    return false;
  }

  async function saveReceiptConfig(input: ReceiptConfigInput) {
    if (!state?.businessId || !requireOnline()) {
      return false;
    }

    const response = await fetch("/api/receipt-config", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...input,
        businessId: state.businessId,
      }),
    });
    const payload = (await response.json().catch(() => null)) as DashboardPayload | null;

    if (response.ok && payload?.state) {
      setState(payload.state);
      setSyncStatus("online");
      setNotice("Receipt settings saved.");
      return true;
    }

    setNotice(payload?.error ?? "Could not save receipt settings.");
    setSyncStatus("error");
    return false;
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
        openRecordModal: (mode = "money") => {
          setVoiceDraft(null);
          setRecordMode(mode);
          setIsRecordOpen(true);
          trackProductEvent("quick_action_clicked", {
            action: mode,
            business_type: state.businessType ?? "Unknown",
          });
        },
        openVoiceDraft: (draft) => {
          setVoiceDraft(draft);
          setRecordMode(draft.intent.kind === "expense" ? "expense" : "sale");
          setIsRecordOpen(true);
        },
        recordMoney,
        reverseActivity,
        collectDebt,
        settleSupplierDebt,
        remindDebt,
        sendPaymentConfirmation,
        createInventoryItem,
        moveInventory,
        sendStockAlert,
        checkoutPos,
        submitCustomerReturn,
        submitSupplierReturn,
        saveReceiptConfig,
        showUpgradePrompt: setUpgradePrompt,
      }}
    >
      {children}
      {isRecordOpen ? (
        <RecordMoneySheet
          accounts={state.accounts}
          initialMode={recordMode}
          initialDraft={voiceDraft ?? undefined}
          items={state.items}
          businessType={state.businessType}
          onClose={() => {
            setIsRecordOpen(false);
            setVoiceDraft(null);
          }}
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
            window.location.assign("/more/billing");
          }}
        />
      ) : null}
      <SyncStatusBanner
        isOnline={isOnline}
        status={syncStatus}
        queuedCount={queuedCount}
        failedCount={failedSyncCount}
        conflictCount={conflictSyncCount}
        onRetry={retryNow}
        onReview={() => window.location.assign("/more#offline-sync")}
      />
      <NoticeToast message={notice} />
    </DashboardContext.Provider>
  );
}

function handleSessionExpired() {
  localStorage.removeItem("selectedBusinessId");
  localStorage.removeItem("selectedLocationId");
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

function getLocationStorageKey(businessId?: string | null) {
  return businessId ? `selectedLocationId:${businessId}` : "selectedLocationId";
}

function getStoredLocationId(businessId?: string | null) {
  if (typeof window === "undefined") {
    return "";
  }

  if (businessId) {
    return localStorage.getItem(getLocationStorageKey(businessId)) ?? "";
  }

  return localStorage.getItem("selectedLocationId") ?? "";
}

function buildSavedMoneyNotice(
  state: MoneybookState,
  type: CaptureFormData["type"],
  isFirstTransaction: boolean,
) {
  const activeTransactions = state.transactions.filter(
    (transaction) => !transaction.reversedByTransactionId,
  );
  const todayKey = new Date().toISOString().slice(0, 10);
  const todaysProfit = activeTransactions
    .filter((transaction) => transaction.occurredAt.slice(0, 10) === todayKey)
    .reduce((sum, transaction) => {
      if (transaction.type === "sale") {
        return sum + transaction.profit;
      }

      if (transaction.type === "expense") {
        return sum - transaction.amount;
      }

      return sum;
    }, 0);

  if (isFirstTransaction) {
    return type === "sale"
      ? "Great start. Your first sale is now tracked."
      : "Great start. Your first expense is now tracked.";
  }

  if (type === "sale" && todaysProfit > 0) {
    return `Nice. Your business made ${formatCompactNaira(todaysProfit)} profit today.`;
  }

  return "Saved. Your money is up to date.";
}

function formatCompactNaira(amount: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}

function SyncStatusBanner({
  isOnline,
  status,
  queuedCount,
  failedCount,
  conflictCount,
  onRetry,
  onReview,
}: {
  isOnline: boolean;
  status: SyncStatus;
  queuedCount: number;
  failedCount: number;
  conflictCount: number;
  onRetry: () => void;
  onReview: () => void;
}) {
  if (isOnline && status === "online") {
    return null;
  }

  const isRetrying = status === "retrying";
  const hasReviewItems = conflictCount > 0 || failedCount > 0;
  const message = getSyncStatusMessage({
    conflictCount,
    failedCount,
    isOnline,
    isRetrying,
    queuedCount,
  });

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
      <div className="flex shrink-0 gap-2">
        {hasReviewItems ? (
          <button
            className="min-h-11 rounded-xl border border-gray-200 bg-white px-4 text-xs font-semibold text-textPrimary transition-all duration-150 hover:bg-background hover:shadow-md active:scale-[0.98]"
            type="button"
            onClick={onReview}
          >
            Review
          </button>
        ) : null}
        <button
          className="min-h-11 rounded-xl bg-primary px-4 text-xs font-semibold text-white transition-all duration-150 hover:bg-primaryHover hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          disabled={isRetrying}
          onClick={onRetry}
        >
          Retry
        </button>
      </div>
    </div>
  );
}

function getSyncStatusMessage({
  conflictCount,
  failedCount,
  isOnline,
  isRetrying,
  queuedCount,
}: {
  conflictCount: number;
  failedCount: number;
  isOnline: boolean;
  isRetrying: boolean;
  queuedCount: number;
}) {
  if (conflictCount > 0) {
    return `${conflictCount} offline change${conflictCount === 1 ? "" : "s"} need review.`;
  }

  if (failedCount > 0) {
    return `${failedCount} offline change${failedCount === 1 ? "" : "s"} failed to sync.`;
  }

  if (!isOnline) {
    if (!phase1FeatureFlags.offlineQueue) {
      return "Offline. Reconnect before saving changes.";
    }

    return queuedCount > 0
      ? `${queuedCount} change${queuedCount === 1 ? "" : "s"} saved offline.`
      : "Offline. New changes will sync later.";
  }

  return isRetrying
    ? "Syncing your latest money records..."
    : "Couldn’t refresh. Check your connection and retry.";
}

function applyLocalStockMove(
  state: MoneybookState,
  itemId: string,
  direction: "in" | "out",
  quantity: number,
  note?: string,
): MoneybookState {
  const createdAt = new Date().toISOString();
  const items = state.items.map((item): InventoryItem => {
    if (item.id !== itemId) {
      return item;
    }

    const quantityOnHand =
      direction === "in"
        ? (item.quantityOnHandDecimal ?? item.quantityOnHand) + quantity
        : Math.max(0, (item.quantityOnHandDecimal ?? item.quantityOnHand) - quantity);

    return {
      ...item,
      quantityOnHand: Math.trunc(quantityOnHand),
      quantityOnHandDecimal: quantityOnHand,
      isLowStock: quantityOnHand <= (item.lowStockLevelDecimal ?? item.lowStockLevel),
      movements: [
        {
          id: createClientIdempotencyKey("offline-stock"),
          type: direction === "in" ? "stock_in" : "stock_out",
          quantity,
          quantityDecimal: quantity,
          note,
          createdAt,
        },
        ...item.movements,
      ],
    };
  });

  return { ...state, items };
}
