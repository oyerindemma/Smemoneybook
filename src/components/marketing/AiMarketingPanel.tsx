"use client";

import { Megaphone, Plus, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardProvider";

type MarketingDraft = {
  id: string;
  channel: string;
  goal: string;
  audience: string;
  tone: string;
  status: string;
  content: string;
  createdAt: string;
};

export function AiMarketingPanel() {
  const { state, setNotice } = useDashboard();
  const [drafts, setDrafts] = useState<MarketingDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [channel, setChannel] = useState("whatsapp");
  const [goal, setGoal] = useState("announce new stock");
  const [audience, setAudience] = useState("regular customers");
  const [tone, setTone] = useState("friendly");
  const [offer, setOffer] = useState("");

  async function fetchDrafts() {
    if (!state.businessId) {
      return [];
    }

    const params = new URLSearchParams({ businessId: state.businessId });
    if (state.selectedLocationId) {
      params.set("locationId", state.selectedLocationId);
    }

    const response = await fetch(`/api/ai-marketing?${params.toString()}`, {
      credentials: "include",
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as { drafts?: MarketingDraft[]; error?: string } | null;

    if (!response.ok || !payload?.drafts) {
      throw new Error(payload?.error ?? "Could not load marketing drafts.");
    }

    return payload.drafts;
  }

  useEffect(() => {
    let mounted = true;

    async function loadDrafts() {
      try {
        const nextDrafts = await fetchDrafts();

        if (mounted) {
          setDrafts(nextDrafts);
        }
      } catch (error) {
        if (mounted) {
          setNotice(error instanceof Error ? error.message : "Could not load marketing drafts.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadDrafts();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.businessId, state.selectedLocationId]);

  async function refreshDrafts() {
    setLoading(true);
    try {
      setDrafts(await fetchDrafts());
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load marketing drafts.");
    } finally {
      setLoading(false);
    }
  }

  async function createDraft() {
    if (!state.businessId || saving) {
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/ai-marketing", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_draft",
          businessId: state.businessId,
          locationId: state.selectedLocationId,
          channel,
          goal,
          audience,
          tone,
          offer,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not create marketing draft.");
      }

      setNotice("Marketing draft created for review.");
      await refreshDrafts();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not create marketing draft.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-gray-100 bg-card p-5 shadow-sm md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Megaphone size={20} aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-medium text-textSecondary">AI marketing</p>
            <h2 className="text-lg font-semibold tracking-tight text-textPrimary">
              {loading ? "Loading..." : `${drafts.length} drafts`}
            </h2>
            <p className="mt-1 text-xs text-textMuted">Draft-only content for review</p>
          </div>
        </div>
        <button
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-gray-200 px-4 text-sm font-semibold text-textPrimary transition hover:bg-background disabled:opacity-60"
          type="button"
          disabled={loading}
          onClick={refreshDrafts}
        >
          <RefreshCw size={16} aria-hidden="true" />
          Refresh
        </button>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <Field label="Channel" value={channel} onChange={setChannel} />
        <Field label="Tone" value={tone} onChange={setTone} />
        <Field label="Goal" value={goal} onChange={setGoal} />
        <Field label="Audience" value={audience} onChange={setAudience} />
      </div>
      <label className="mt-3 block text-xs font-semibold text-textSecondary">
        Offer
        <input
          className="mt-2 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-textPrimary outline-none focus:border-primary"
          value={offer}
          onChange={(event) => setOffer(event.target.value)}
        />
      </label>
      <button
        className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
        type="button"
        disabled={saving || !goal.trim()}
        onClick={createDraft}
      >
        <Plus size={16} aria-hidden="true" />
        Create draft
      </button>

      {drafts[0] ? (
        <div className="mt-5 rounded-2xl bg-background p-4">
          <p className="text-xs font-semibold text-textMuted">{drafts[0].channel} · {drafts[0].status}</p>
          <p className="mt-3 text-sm leading-6 text-textPrimary">{drafts[0].content}</p>
        </div>
      ) : loading ? (
        <div className="mt-5 h-28 animate-pulse rounded-2xl bg-background" />
      ) : (
        <div className="mt-5 rounded-2xl bg-background p-4 text-sm font-medium text-textSecondary">
          Create a draft, review the wording, then approve it before using it anywhere.
        </div>
      )}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs font-semibold text-textSecondary">
      {label}
      <input
        className="mt-2 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-textPrimary outline-none focus:border-primary"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
