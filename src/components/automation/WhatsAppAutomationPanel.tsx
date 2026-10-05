"use client";

import { MessageCircle, Plus, RefreshCw, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardProvider";
import type { WhatsAppAutomationDashboard } from "@/lib/phase3/whatsapp-automation-service";

export function WhatsAppAutomationPanel() {
  const { state, setNotice } = useDashboard();
  const [dashboard, setDashboard] = useState<WhatsAppAutomationDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [templateName, setTemplateName] = useState("payment_confirmation");

  async function fetchDashboard() {
    if (!state.businessId) {
      return null;
    }

    const response = await fetch(`/api/whatsapp-automation?businessId=${encodeURIComponent(state.businessId)}`, {
      credentials: "include",
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as
      | { dashboard?: WhatsAppAutomationDashboard; error?: string }
      | null;

    if (!response.ok || !payload?.dashboard) {
      throw new Error(payload?.error ?? "Could not load WhatsApp automation.");
    }

    return payload.dashboard;
  }

  useEffect(() => {
    let mounted = true;

    async function loadDashboard() {
      try {
        const nextDashboard = await fetchDashboard();

        if (mounted) {
          setDashboard(nextDashboard);
        }
      } catch (error) {
        if (mounted) {
          setNotice(error instanceof Error ? error.message : "Could not load WhatsApp automation.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.businessId]);

  async function refreshDashboard() {
    setLoading(true);
    try {
      setDashboard(await fetchDashboard());
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load WhatsApp automation.");
    } finally {
      setLoading(false);
    }
  }

  async function upsertContact() {
    if (!state.businessId || !phone.trim() || saving) {
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/whatsapp-automation", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert_contact",
          businessId: state.businessId,
          phone: phone.trim(),
          name: name.trim(),
          consentStatus: "OPTED_IN",
          consentSource: "manual_admin",
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not save contact consent.");
      }

      setPhone("");
      setName("");
      setNotice("WhatsApp consent saved.");
      await refreshDashboard();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save contact consent.");
    } finally {
      setSaving(false);
    }
  }

  async function registerTemplate() {
    if (!state.businessId || !templateName.trim() || saving) {
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/whatsapp-automation", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register_template",
          businessId: state.businessId,
          templateName: templateName.trim(),
          category: "utility",
          status: "APPROVED",
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not register template.");
      }

      setNotice("WhatsApp template status saved.");
      await refreshDashboard();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not register template.");
    } finally {
      setSaving(false);
    }
  }

  async function queueMessage() {
    const contact = dashboard?.contacts.find((item) => item.consentStatus === "OPTED_IN");

    if (!state.businessId || !contact || saving) {
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/whatsapp-automation", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "queue_message",
          businessId: state.businessId,
          phone: contact.phone,
          automationType: "payment_confirmation",
          templateName,
          messagePreview: "Payment confirmation queued for approved WhatsApp template.",
          costKobo: 0,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not queue WhatsApp automation.");
      }

      setNotice("WhatsApp automation queued for review.");
      await refreshDashboard();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not queue WhatsApp automation.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-gray-100 bg-card p-5 shadow-sm md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <MessageCircle size={20} aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-medium text-textSecondary">Phase 3 WhatsApp</p>
            <h2 className="text-lg font-semibold tracking-tight text-textPrimary">
              {loading ? "Loading..." : `${dashboard?.contacts.length ?? 0} contacts`}
            </h2>
            <p className="mt-1 text-xs text-textMuted">Consent, templates, quiet hours, queue health</p>
          </div>
        </div>
        <button
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-gray-200 px-4 text-sm font-semibold text-textPrimary transition hover:bg-background disabled:opacity-60"
          type="button"
          disabled={loading}
          onClick={refreshDashboard}
        >
          <RefreshCw size={16} aria-hidden="true" />
          Refresh
        </button>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <Metric label="Queued" value={String(dashboard?.health.queued ?? 0)} />
        <Metric label="Sent" value={String(dashboard?.health.sent ?? 0)} />
        <Metric label="Skipped" value={String(dashboard?.health.skipped ?? 0)} />
        <Metric label="Cost" value={formatKobo(dashboard?.health.totalCostKobo ?? 0)} />
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_0.8fr_auto]">
        <label className="text-xs font-semibold text-textSecondary">
          Opt-in phone
          <input
            className="mt-2 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-textPrimary outline-none focus:border-primary"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </label>
        <label className="text-xs font-semibold text-textSecondary">
          Name
          <input
            className="mt-2 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-textPrimary outline-none focus:border-primary"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-xl bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
          type="button"
          disabled={saving || !phone.trim()}
          onClick={upsertContact}
        >
          <Plus size={16} aria-hidden="true" />
          Opt in
        </button>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto_auto]">
        <label className="text-xs font-semibold text-textSecondary">
          Approved template
          <input
            className="mt-2 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-textPrimary outline-none focus:border-primary"
            value={templateName}
            onChange={(event) => setTemplateName(event.target.value)}
          />
        </label>
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-xl border border-gray-200 px-4 text-sm font-semibold text-textPrimary transition hover:bg-background disabled:opacity-60"
          type="button"
          disabled={saving || !templateName.trim()}
          onClick={registerTemplate}
        >
          <Plus size={16} aria-hidden="true" />
          Register
        </button>
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-xl border border-gray-200 px-4 text-sm font-semibold text-textPrimary transition hover:bg-background disabled:opacity-60"
          type="button"
          disabled={saving || !dashboard?.contacts.some((contact) => contact.consentStatus === "OPTED_IN")}
          onClick={queueMessage}
        >
          <Send size={16} aria-hidden="true" />
          Queue
        </button>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-background p-3">
      <p className="text-xs font-medium text-textMuted">{label}</p>
      <p className="mt-2 text-sm font-semibold text-textPrimary">{value}</p>
    </div>
  );
}

function formatKobo(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value / 100);
}
