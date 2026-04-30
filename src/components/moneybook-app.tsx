"use client";

import { Bell, Search, Store } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AccountsList } from "@/components/dashboard/AccountsList";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { DebtList } from "@/components/dashboard/DebtList";
import { InsightStrip } from "@/components/dashboard/InsightStrip";
import { InventoryPanel } from "@/components/dashboard/InventoryPanel";
import { MoneyCard } from "@/components/dashboard/MoneyCard";
import { QuickCapture } from "@/components/dashboard/QuickCapture";
import { ReportsPanel } from "@/components/dashboard/ReportsPanel";
import type {
  CaptureFormData,
  QuickAction,
} from "@/components/dashboard/types";
import {
  getDashboardSummary,
  MoneybookState,
  recordTransaction,
} from "@/lib/bookkeeping/transaction-engine";

let transactionSequence = 0;
type LoadStatus = "loading" | "ready" | "signed_out" | "setup_needed" | "error";

export function MoneybookApp() {
  const [state, setState] = useState<MoneybookState | null>(null);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [activeAction, setActiveAction] = useState<QuickAction | null>(null);
  const [notice, setNotice] = useState("Ready for today’s money.");
  const [lastUsedAccountId, setLastUsedAccountId] = useState("cash");
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);

  const todaySummary = useMemo(
    () => (state ? getDashboardSummary(state) : null),
    [state],
  );

  useEffect(() => {
    void loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoadStatus("loading");
    const response = await fetch("/api/dashboard/summary", {
      credentials: "include",
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as {
      state?: MoneybookState;
      error?: string;
    } | null;

    if (response.ok && payload?.state) {
      setState(payload.state);
      setLoadStatus("ready");
      setNotice("Your money is up to date.");
      return;
    }

    setState(null);
    if (response.status === 401) {
      setLoadStatus("signed_out");
      setNotice("Sign in to track your money.");
      return;
    }

    if (response.status === 404) {
      setLoadStatus("setup_needed");
      setNotice(payload?.error ?? "Create a business to start.");
      return;
    }

    setLoadStatus("error");
    setNotice(payload?.error ?? "Connect Neon and run migrations to continue.");
  }

  function chooseAction(action: QuickAction) {
    setActiveAction(action);
    setIsRecordModalOpen(false);
    window.setTimeout(() => {
      captureRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  function handleTransactionSubmit(formData: CaptureFormData) {
    const idempotencyKey = `ui-${(transactionSequence += 1)}`;

    try {
      setState((current) =>
        current
          ? recordTransaction(current, {
              ...formData,
              idempotencyKey,
            })
          : current,
      );
      setLastUsedAccountId(formData.accountId);
      setNotice(
        formData.type === "sale"
          ? "Money in saved. Your balance is updated."
          : formData.type === "transfer"
            ? "Transfer saved. Both accounts are updated."
          : "Money out saved. Your balance is updated.",
      );
      void saveTransaction({ ...formData, idempotencyKey });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save this entry.");
    }
  }

  async function saveTransaction(formData: CaptureFormData & { idempotencyKey: string }) {
    const response = await fetch("/api/transactions", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });
    const payload = (await response.json().catch(() => null)) as {
      state?: MoneybookState;
      error?: string;
    } | null;

    if (response.ok && payload?.state) {
      setState(payload.state);
      setLoadStatus("ready");
      return;
    }

    setNotice(payload?.error ?? "Could not save this entry.");
    await loadDashboard();
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setState(null);
    setLoadStatus("signed_out");
  }

  async function handleRemindDebt(
    debtId: string,
    channel: "manual" | "whatsapp" | "sms",
  ) {
    const response = await fetch(`/api/debts/${debtId}/remind`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel }),
    });
    const payload = (await response.json().catch(() => null)) as {
      message?: string;
      state?: MoneybookState;
      error?: string;
    } | null;

    if (response.ok) {
      if (payload?.state) {
        setState(payload.state);
      }
      setNotice(
        payload?.message ??
          (channel === "manual"
            ? "Reminder noted."
            : `${channel.toUpperCase()} reminder prepared.`),
      );
      return;
    }

    setNotice(payload?.error ?? "Could not note reminder.");
  }

  async function handleCollectDebt(
    debtId: string,
    accountId: string,
    amount?: number,
  ) {
    if (!accountId) {
      setNotice("Choose where the collected money entered.");
      return;
    }

    const response = await fetch(`/api/debts/${debtId}/collect`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId,
        amount,
        idempotencyKey: `collect-${(transactionSequence += 1)}`,
      }),
    });
    const payload = (await response.json().catch(() => null)) as {
      state?: MoneybookState;
      error?: string;
    } | null;

    if (response.ok && payload?.state) {
      setState(payload.state);
      setNotice("Collected money saved.");
      return;
    }

    setNotice(payload?.error ?? "Could not collect this money.");
  }

  async function handleSettleSupplierDebt(
    debtId: string,
    accountId: string,
    amount?: number,
  ) {
    if (!accountId) {
      setNotice("Choose where the money left from.");
      return;
    }

    const response = await fetch(`/api/debts/${debtId}/settle`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId,
        amount,
        idempotencyKey: `settle-${(transactionSequence += 1)}`,
      }),
    });
    const payload = (await response.json().catch(() => null)) as {
      state?: MoneybookState;
      error?: string;
    } | null;

    if (response.ok && payload?.state) {
      setState(payload.state);
      setNotice("Supplier payment saved.");
      return;
    }

    setNotice(payload?.error ?? "Could not settle this supplier bill.");
  }

  async function handleCreateAccount(input: {
    name: string;
    type: "cash" | "bank" | "pos" | "mobile_money";
    openingBalance: number;
  }) {
    const response = await fetch("/api/accounts", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const payload = (await response.json().catch(() => null)) as {
      state?: MoneybookState;
      error?: string;
    } | null;

    if (response.ok && payload?.state) {
      setState(payload.state);
      setNotice("Account added.");
      return;
    }

    setNotice(payload?.error ?? "Could not add this account.");
  }

  async function handleReverseTransaction(transactionId: string) {
    const reason = window.prompt("Why are you reversing this record?");

    if (reason === null) {
      return;
    }

    const response = await fetch(`/api/transactions/${transactionId}/reverse`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    const payload = (await response.json().catch(() => null)) as {
      state?: MoneybookState;
      error?: string;
    } | null;

    if (response.ok && payload?.state) {
      setState(payload.state);
      setNotice("Record reversed with a correction entry.");
      return;
    }

    setNotice(payload?.error ?? "Could not reverse this record.");
  }

  async function handleCreateInventoryItem(input: {
    name: string;
    sellingPrice: number;
    costPrice: number;
    quantityOnHand: number;
    lowStockLevel: number;
  }) {
    const response = await fetch("/api/inventory", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const payload = (await response.json().catch(() => null)) as {
      state?: MoneybookState;
      error?: string;
    } | null;

    if (response.ok && payload?.state) {
      setState(payload.state);
      setNotice("Product saved.");
      return;
    }

    setNotice(payload?.error ?? "Could not save product.");
  }

  async function handleMoveInventory(
    itemId: string,
    direction: "in" | "out",
    quantity: number,
    note?: string,
  ) {
    const response = await fetch(
      `/api/inventory/${itemId}/${direction === "in" ? "stock-in" : "stock-out"}`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity, note }),
      },
    );
    const payload = (await response.json().catch(() => null)) as {
      state?: MoneybookState;
      error?: string;
    } | null;

    if (response.ok && payload?.state) {
      setState(payload.state);
      setNotice(direction === "in" ? "Stock added." : "Stock removed.");
      return;
    }

    setNotice(payload?.error ?? "Could not update stock.");
  }

  if (loadStatus === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F5F3EF] px-4 text-ink">
        <p className="rounded-xl bg-white p-4 text-sm text-black/65 shadow-soft">
          Loading your money...
        </p>
      </main>
    );
  }

  if (loadStatus === "signed_out" || loadStatus === "error" || !state || !todaySummary) {
    return (
      <main className="min-h-screen bg-[#F5F3EF] px-4 py-8 text-ink">
        <AuthPanel
          mode={loadStatus}
          notice={notice}
          onReady={loadDashboard}
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F5F3EF] pb-28 text-ink md:pb-10">
      <ShellHeader
        businessName={state.businessName}
        notice={notice}
        onLogout={handleLogout}
      />

      <section className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <MoneyCard summary={todaySummary} />

        <div ref={captureRef}>
          <QuickCapture
            key={activeAction ?? "empty"}
            accounts={state.accounts}
            items={state.items}
            activeAction={activeAction}
            lastUsedAccountId={lastUsedAccountId}
            onActionSelect={chooseAction}
            onSubmit={handleTransactionSubmit}
          />
        </div>

        <InsightStrip
          summary={todaySummary}
          transactionCount={getTodayTransactionCount(state)}
        />
        <ActivityFeed
          transactions={state.transactions}
          onReverse={handleReverseTransaction}
        />

        <InventoryPanel
          items={state.items}
          onCreate={handleCreateInventoryItem}
          onMove={handleMoveInventory}
        />

        <ReportsPanel onNotice={setNotice} />

        <div className="grid gap-4 lg:grid-cols-2">
          <AccountsList accounts={state.accounts} onCreate={handleCreateAccount} />
          <DebtList
            accounts={state.accounts}
            debts={state.debts}
            onCollect={handleCollectDebt}
            onSettleSupplier={handleSettleSupplierDebt}
            onRemind={handleRemindDebt}
          />
        </div>
      </section>

      <button
        className="fixed inset-x-4 bottom-4 z-30 h-14 rounded-xl bg-ink text-base font-semibold text-white shadow-soft md:hidden"
        type="button"
        onClick={() => setIsRecordModalOpen(true)}
      >
        + Record money
      </button>

      {isRecordModalOpen ? (
        <RecordMoneyModal
          onClose={() => setIsRecordModalOpen(false)}
          onActionSelect={chooseAction}
        />
      ) : null}
    </main>
  );
}

function ShellHeader({
  businessName,
  notice,
  onLogout,
}: {
  businessName: string;
  notice: string;
  onLogout: () => void;
}) {
  return (
    <header className="border-b border-black/10 bg-white">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ink text-white">
            <Store size={22} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm text-black/55">SME Moneybook</p>
            <h1 className="truncate text-xl font-semibold">{businessName}</h1>
          </div>
        </div>

        <div className="hidden min-w-0 flex-1 items-center justify-end gap-3 md:flex">
          <Link
            className="h-10 rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-black/65 hover:bg-[#F5F3EF]"
            href="/customers"
          >
            Customers
          </Link>
          <Link
            className="h-10 rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-black/65 hover:bg-[#F5F3EF]"
            href="/suppliers"
          >
            Suppliers
          </Link>
          <div className="flex max-w-sm items-center gap-2 rounded-xl border border-black/10 bg-[#F5F3EF] px-3 py-2 text-sm text-black/60">
            <Search size={16} aria-hidden="true" />
            <span className="truncate">{notice}</span>
          </div>
          <button
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-black/10 bg-white hover:bg-[#F5F3EF]"
            type="button"
            aria-label="Notifications"
            title="Notifications"
          >
            <Bell size={18} aria-hidden="true" />
          </button>
          <button
            className="h-10 rounded-xl border border-black/10 bg-white px-4 text-sm font-semibold text-black/65 hover:bg-[#F5F3EF]"
            type="button"
            onClick={onLogout}
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}

function AuthPanel({
  mode,
  notice,
  onReady,
}: {
  mode: LoadStatus;
  notice: string;
  onReady: () => Promise<void>;
}) {
  const [authMode, setAuthMode] = useState<"login" | "register">("register");
  const [message, setMessage] = useState(notice);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch(
      authMode === "register" ? "/api/auth/register" : "/api/auth/login",
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          password: form.get("password"),
          businessName: form.get("businessName"),
        }),
      },
    );
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    if (!response.ok) {
      setMessage(payload?.error ?? "Could not continue.");
      return;
    }

    await onReady();
  }

  return (
    <section className="mx-auto max-w-md rounded-2xl bg-white p-5 shadow-soft sm:p-6">
      <div className="mb-5">
        <p className="text-sm text-black/55">SME Moneybook</p>
        <h1 className="text-2xl font-semibold">
          {mode === "error" ? "Database setup needed" : "Track your money daily"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-black/60">{message}</p>
      </div>

      {mode === "error" ? (
        <p className="rounded-xl bg-[#F5F3EF] p-4 text-sm text-black/65">
          Add `DATABASE_URL` for Neon in .env, then run `npm run db:migrate`.
        </p>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 rounded-xl bg-[#F5F3EF] p-1">
            <button
              className={`h-11 rounded-xl text-sm font-semibold ${
                authMode === "register" ? "bg-ink text-white" : "text-black/65"
              }`}
              type="button"
              onClick={() => setAuthMode("register")}
            >
              Create
            </button>
            <button
              className={`h-11 rounded-xl text-sm font-semibold ${
                authMode === "login" ? "bg-ink text-white" : "text-black/65"
              }`}
              type="button"
              onClick={() => setAuthMode("login")}
            >
              Sign in
            </button>
          </div>

          <form className="grid gap-3" onSubmit={submit}>
            {authMode === "register" ? (
              <>
                <label className="grid gap-2 text-sm font-medium">
                  Your name
                  <input
                    className="h-12 rounded-xl border border-black/10 px-3"
                    name="name"
                    required
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium">
                  Business name
                  <input
                    className="h-12 rounded-xl border border-black/10 px-3"
                    name="businessName"
                    required
                  />
                </label>
              </>
            ) : null}
            <label className="grid gap-2 text-sm font-medium">
              Email
              <input
                className="h-12 rounded-xl border border-black/10 px-3"
                name="email"
                type="email"
                required
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Password
              <input
                className="h-12 rounded-xl border border-black/10 px-3"
                name="password"
                type="password"
                minLength={8}
                required
              />
            </label>
            <button
              className="mt-2 h-12 rounded-xl bg-ink font-semibold text-white"
              type="submit"
            >
              Continue
            </button>
          </form>
        </>
      )}
    </section>
  );
}

function RecordMoneyModal({
  onClose,
  onActionSelect,
}: {
  onClose: () => void;
  onActionSelect: (action: QuickAction) => void;
}) {
  return (
    <div className="fixed inset-0 z-40 bg-black/35 px-4 pb-4 pt-24 md:hidden">
      <div className="mt-auto rounded-2xl bg-white p-4 shadow-soft">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Record money</h2>
          <button className="text-sm text-black/55" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="grid gap-3">
          <button
            className="h-14 rounded-xl bg-palm text-left text-base font-semibold text-white"
            type="button"
            onClick={() => onActionSelect("sale")}
          >
            <span className="px-4">+ I got money</span>
          </button>
          <button
            className="h-14 rounded-xl bg-red-600 text-left text-base font-semibold text-white"
            type="button"
            onClick={() => onActionSelect("expense")}
          >
            <span className="px-4">- I spent money</span>
          </button>
          <button
            className="h-14 rounded-xl bg-lagoon text-left text-base font-semibold text-white"
            type="button"
            onClick={() => onActionSelect("transfer")}
          >
            <span className="px-4">Move money</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function getTodayTransactionCount(state: MoneybookState) {
  return state.transactions.length;
}
