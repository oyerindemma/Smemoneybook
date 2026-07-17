"use client";

import { FormEvent, useEffect, useState } from "react";
import { FileText, Percent } from "lucide-react";

type TaxRate = {
  id?: string;
  label: string;
  rate: number;
  type: "vat" | "zero_rated" | "exempt" | "custom";
  isDefault: boolean;
};

export function TaxManagementPanel({
  businessId,
  onNotice,
}: {
  businessId?: string;
  onNotice: (message: string) => void;
}) {
  const [enabled, setEnabled] = useState(false);
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [inclusiveByDefault, setInclusiveByDefault] = useState(false);
  const [vatRate, setVatRate] = useState("7.5");
  const [customLabel, setCustomLabel] = useState("");
  const [customRate, setCustomRate] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!businessId) {
      return;
    }

    let mounted = true;

    fetch(`/api/tax/settings?businessId=${encodeURIComponent(businessId)}`, {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as {
          config?: {
            enabled?: boolean;
            registrationNumber?: string;
            inclusiveByDefault?: boolean;
          };
          rates?: TaxRate[];
          error?: string;
        } | null;

        if (!mounted) {
          return;
        }

        if (response.ok && payload) {
          setEnabled(Boolean(payload.config?.enabled));
          setRegistrationNumber(payload.config?.registrationNumber ?? "");
          setInclusiveByDefault(Boolean(payload.config?.inclusiveByDefault));
          const defaultVat = payload.rates?.find((rate) => rate.type === "vat" || rate.isDefault);
          const custom = payload.rates?.find((rate) => rate.type === "custom");
          setVatRate(String(defaultVat?.rate ?? 7.5));
          setCustomLabel(custom?.label ?? "");
          setCustomRate(custom ? String(custom.rate) : "");
          return;
        }

        onNotice(payload?.error ?? "Could not load tax settings.");
      })
      .catch(() => {
        if (mounted) {
          onNotice("Could not load tax settings.");
        }
      });

    return () => {
      mounted = false;
    };
  }, [businessId, onNotice]);

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!businessId) {
      return;
    }

    const rates: TaxRate[] = [
      { label: "VAT", rate: Number(vatRate), type: "vat", isDefault: true },
    ];

    if (customLabel.trim() && Number(customRate) >= 0) {
      rates.push({
        label: customLabel.trim(),
        rate: Number(customRate),
        type: "custom",
        isDefault: false,
      });
    }

    setIsSaving(true);
    const response = await fetch("/api/tax/settings", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessId,
        country: "NG",
        registrationNumber,
        enabled,
        inclusiveByDefault,
        rates,
      }),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    setIsSaving(false);

    onNotice(response.ok ? "Tax settings saved." : payload?.error ?? "Could not save tax settings.");
  }

  async function saveTaxSummary() {
    if (!businessId) {
      return;
    }

    const now = new Date();
    const response = await fetch(
      `/api/tax/summary?businessId=${encodeURIComponent(businessId)}&month=${now.getMonth() + 1}&year=${now.getFullYear()}`,
      {
        method: "POST",
        credentials: "include",
      },
    );
    const payload = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;

    onNotice(response.ok ? payload?.message ?? "Tax summary saved." : payload?.error ?? "Could not save tax summary.");
  }

  return (
    <section className="rounded-2xl border border-gray-100 bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-textSecondary">Business settings</p>
          <h2 className="mt-1 text-base font-semibold text-textPrimary">Tax management</h2>
        </div>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          {enabled ? "Enabled" : "Optional"}
        </span>
      </div>

      <form className="mt-5 grid gap-4" onSubmit={saveSettings}>
        <label className="flex min-h-12 items-center gap-3 rounded-xl bg-background px-4 text-sm font-semibold">
          <input
            checked={enabled}
            type="checkbox"
            onChange={(event) => setEnabled(event.target.checked)}
          />
          Enable tax settings
        </label>

        <div className="grid gap-3 md:grid-cols-3">
          <Input
            label="Tax ID"
            value={registrationNumber}
            onChange={setRegistrationNumber}
          />
          <Input label="VAT %" type="number" value={vatRate} onChange={setVatRate} />
          <label className="flex min-h-12 items-center gap-3 rounded-xl bg-background px-4 text-sm font-semibold md:mt-7">
            <input
              checked={inclusiveByDefault}
              type="checkbox"
              onChange={(event) => setInclusiveByDefault(event.target.checked)}
            />
            Inclusive by default
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_160px]">
          <Input label="Custom rate label" value={customLabel} onChange={setCustomLabel} />
          <Input label="Custom %" type="number" value={customRate} onChange={setCustomRate} />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            type="submit"
            disabled={isSaving}
          >
            <Percent size={16} aria-hidden="true" />
            {isSaving ? "Saving..." : "Save tax settings"}
          </button>
          <button
            className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-textPrimary"
            type="button"
            onClick={saveTaxSummary}
          >
            <FileText size={16} aria-hidden="true" />
            Save tax summary
          </button>
        </div>
      </form>
    </section>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium text-textPrimary">
      {label}
      <input
        className="min-h-12 rounded-xl border border-gray-200 bg-white px-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
