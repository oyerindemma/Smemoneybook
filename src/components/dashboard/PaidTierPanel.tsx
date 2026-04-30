"use client";

import { FileText, Sparkles, Upload } from "lucide-react";
import { FormEvent, useState } from "react";

export function PaidTierPanel({
  businessId,
  onNotice,
}: {
  businessId?: string;
  onNotice: (message: string) => void;
}) {
  const [receiptResult, setReceiptResult] = useState("");
  const [suggestion, setSuggestion] = useState("");

  async function suggestCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/assist/categorize", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: form.get("description"),
        type: form.get("type"),
      }),
    });
    const payload = (await response.json().catch(() => null)) as {
      suggestion?: { category: string; confidence: number; reason: string };
      error?: string;
    } | null;

    if (response.ok && payload?.suggestion) {
      setSuggestion(`${payload.suggestion.category} (${Math.round(payload.suggestion.confidence * 100)}%)`);
      onNotice(payload.suggestion.reason);
      return;
    }

    onNotice(payload?.error ?? "Could not suggest a category.");
  }

  async function extractReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/receipts", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessId,
        fileName: form.get("fileName"),
        text: form.get("text"),
      }),
    });
    const payload = (await response.json().catch(() => null)) as {
      receipt?: { vendor?: string; amount?: number; category?: string };
      error?: string;
    } | null;

    if (response.ok && payload?.receipt) {
      setReceiptResult(
        `${payload.receipt.vendor ?? "Receipt"} · ${payload.receipt.category ?? "Uncategorized"} · ₦${payload.receipt.amount ?? 0}`,
      );
      onNotice("Receipt extracted and saved for review.");
      return;
    }

    onNotice(payload?.error ?? "Could not extract receipt.");
  }

  async function startBilling(plan: "starter" | "growth" | "pro") {
    const response = await fetch("/api/billing/checkout", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId, plan }),
    });
    const payload = (await response.json().catch(() => null)) as {
      message?: string;
      error?: string;
    } | null;
    onNotice(payload?.message ?? payload?.error ?? "Billing checkout prepared.");
  }

  return (
    <section className="rounded-xl bg-white p-4 shadow-soft sm:p-6">
      <div>
        <p className="text-sm text-black/55">Paid tier toolkit</p>
        <h2 className="text-xl font-semibold">Growth features</h2>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <form className="rounded-xl border border-black/10 p-4" onSubmit={suggestCategory}>
          <div className="flex items-center gap-2">
            <Sparkles size={18} aria-hidden="true" />
            <h3 className="font-semibold">AI category assist</h3>
          </div>
          <input
            className="mt-3 h-11 w-full rounded-xl border border-black/10 px-3 text-sm"
            name="description"
            placeholder="fuel for delivery"
            required
          />
          <select className="mt-2 h-11 w-full rounded-xl border border-black/10 px-3 text-sm" name="type" defaultValue="expense">
            <option value="expense">Expense</option>
            <option value="sale">Sale</option>
            <option value="transfer">Transfer</option>
          </select>
          <button className="mt-3 h-10 w-full rounded-xl bg-ink text-sm font-semibold text-white" type="submit">
            Suggest
          </button>
          {suggestion ? <p className="mt-2 text-sm text-black/55">{suggestion}</p> : null}
        </form>

        <form className="rounded-xl border border-black/10 p-4" onSubmit={extractReceipt}>
          <div className="flex items-center gap-2">
            <Upload size={18} aria-hidden="true" />
            <h3 className="font-semibold">Receipt extraction</h3>
          </div>
          <input className="mt-3 h-11 w-full rounded-xl border border-black/10 px-3 text-sm" name="fileName" placeholder="receipt.txt" required />
          <textarea className="mt-2 min-h-24 w-full rounded-xl border border-black/10 p-3 text-sm" name="text" placeholder="Paste receipt text for extraction" />
          <button className="mt-3 h-10 w-full rounded-xl bg-ink text-sm font-semibold text-white" type="submit">
            Extract
          </button>
          {receiptResult ? <p className="mt-2 text-sm text-black/55">{receiptResult}</p> : null}
        </form>

        <div className="rounded-xl border border-black/10 p-4">
          <div className="flex items-center gap-2">
            <FileText size={18} aria-hidden="true" />
            <h3 className="font-semibold">Billing and exports</h3>
          </div>
          <div className="mt-3 grid gap-2">
            <button className="h-10 rounded-xl bg-[#F5F3EF] text-sm font-semibold text-black/70" type="button" onClick={() => startBilling("starter")}>
              ₦3,000 Starter
            </button>
            <button className="h-10 rounded-xl bg-ink text-sm font-semibold text-white" type="button" onClick={() => startBilling("growth")}>
              ₦6,000 Growth
            </button>
            <button className="h-10 rounded-xl bg-[#F5F3EF] text-sm font-semibold text-black/70" type="button" onClick={() => startBilling("pro")}>
              ₦10,000 Pro
            </button>
            <a className="flex h-10 items-center justify-center rounded-xl border border-black/10 text-sm font-semibold text-black/65" href="/api/accountant/export">
              Accountant export
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
