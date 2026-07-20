"use client";

import { FormEvent, useEffect, useState } from "react";
import { WhatsAppAutomationPanel } from "@/components/automation/WhatsAppAutomationPanel";
import { FeatureUnavailablePanel } from "@/components/dashboard/FeatureUnavailablePanel";
import { useDashboard } from "@/components/dashboard/DashboardProvider";
import { phase3FeatureFlags } from "@/lib/phase3/feature-flags";

type AutomationPreferencePayload = {
  dailyReminderEnabled: boolean;
  dailyReminderTime: string;
  debtReminderEnabled: boolean;
  lowStockAlertEnabled: boolean;
  weeklySummaryEnabled: boolean;
  whatsappAutomationEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  timezone: string;
};

const defaults: AutomationPreferencePayload = {
  dailyReminderEnabled: false,
  dailyReminderTime: "18:00",
  debtReminderEnabled: false,
  lowStockAlertEnabled: true,
  weeklySummaryEnabled: false,
  whatsappAutomationEnabled: false,
  quietHoursStart: "21:00",
  quietHoursEnd: "07:00",
  timezone: "Africa/Lagos",
};

export default function AutomationSettingsPage() {
  const { state, setNotice } = useDashboard();
  const [settings, setSettings] = useState(defaults);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!state.businessId) return;
      const response = await fetch(`/api/automation/preferences?businessId=${state.businessId}`, {
        credentials: "include",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as {
        preferences?: Partial<AutomationPreferencePayload>;
      } | null;

      if (active && response.ok && payload?.preferences) {
        setSettings({ ...defaults, ...payload.preferences });
      }
      if (active) setIsLoading(false);
    }

    void load();
    return () => {
      active = false;
    };
  }, [state.businessId]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!state.businessId) return;
    setIsSaving(true);
    const response = await fetch("/api/automation/preferences", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...settings, businessId: state.businessId }),
    });
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    setNotice(response.ok ? payload?.message ?? "Automation settings saved." : "Could not save automation settings.");
    setIsSaving(false);
  }

  return (
    <main className="space-y-8">
      <header>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Automations</h1>
        <p className="mt-1 text-sm text-textSecondary md:text-base">
          Create helpful suggestions first. WhatsApp sending stays off until you enable it.
        </p>
      </header>

      <form className="grid gap-4 rounded-2xl border border-gray-100 bg-card p-6 shadow-sm" onSubmit={save}>
        {isLoading ? (
          <div className="h-32 animate-pulse rounded-xl bg-background" />
        ) : (
          <>
            <Toggle
              label="Enable daily reminder"
              checked={settings.dailyReminderEnabled}
              onChange={(value) => setSettings((current) => ({ ...current, dailyReminderEnabled: value }))}
            />
            <Field label="Daily reminder time">
              <input
                className="h-11 rounded-xl border border-gray-200 px-3 text-sm"
                type="time"
                value={settings.dailyReminderTime}
                onChange={(event) => setSettings((current) => ({ ...current, dailyReminderTime: event.target.value }))}
              />
            </Field>
            <Toggle label="Enable debt reminder suggestions" checked={settings.debtReminderEnabled} onChange={(value) => setSettings((current) => ({ ...current, debtReminderEnabled: value }))} />
            <Toggle label="Enable low stock alerts" checked={settings.lowStockAlertEnabled} onChange={(value) => setSettings((current) => ({ ...current, lowStockAlertEnabled: value }))} />
            <Toggle label="Enable weekly summary" checked={settings.weeklySummaryEnabled} onChange={(value) => setSettings((current) => ({ ...current, weeklySummaryEnabled: value }))} />
            <Toggle label="Enable WhatsApp sending for approved templates only" checked={settings.whatsappAutomationEnabled} onChange={(value) => setSettings((current) => ({ ...current, whatsappAutomationEnabled: value }))} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Quiet hours start">
                <input className="h-11 rounded-xl border border-gray-200 px-3 text-sm" type="time" value={settings.quietHoursStart} onChange={(event) => setSettings((current) => ({ ...current, quietHoursStart: event.target.value }))} />
              </Field>
              <Field label="Quiet hours end">
                <input className="h-11 rounded-xl border border-gray-200 px-3 text-sm" type="time" value={settings.quietHoursEnd} onChange={(event) => setSettings((current) => ({ ...current, quietHoursEnd: event.target.value }))} />
              </Field>
            </div>
            <button className="min-h-12 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primaryHover disabled:opacity-50" disabled={isSaving} type="submit">
              {isSaving ? "Saving..." : "Save automations"}
            </button>
          </>
        )}
      </form>

      {phase3FeatureFlags.whatsappAutomation ? (
        <WhatsAppAutomationPanel />
      ) : (
        <FeatureUnavailablePanel
          title="Smart WhatsApp automation is not available"
          description="Phase 3L is behind a rollout flag while consent, opt-out, template status, quiet hours, retries, and cost controls are validated."
          billingLink={false}
        />
      )}
    </main>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-12 items-center justify-between gap-4 rounded-xl bg-background px-4 py-3 text-sm font-semibold text-textPrimary">
      {label}
      <input className="h-5 w-5 accent-primary" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-textPrimary">
      {label}
      {children}
    </label>
  );
}
