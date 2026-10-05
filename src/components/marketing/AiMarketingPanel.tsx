"use client";

import {
  CheckCircle2,
  Download,
  Megaphone,
  Pencil,
  RefreshCw,
  Send,
  ShieldCheck,
  UserX,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardProvider";

type Segment = {
  key: string;
  label: string;
  definition: string;
  period: { label: string };
  customerCount: number;
  consentEligibleCount: number;
  excludedCount: number;
  dataLimitations: string[];
  breakdown?: Record<string, number>;
};

type Setup = {
  provider: { configured: boolean; model: string | null };
  delivery: { enabled: boolean; status: string; message: string };
};

type Capabilities = {
  canCreate: boolean;
  canApprove: boolean;
  canSend: boolean;
  canExport: boolean;
  canManageConsent: boolean;
};

type Campaign = {
  id: string;
  name: string;
  objective: string;
  channel: string;
  status: string;
  recipientSummary: { total: number; eligible: number; excluded: number; disabled: number };
  segmentDefinition: {
    label?: string;
    definition?: string;
    dataLimitations?: string[];
  };
  latestDraft?: Draft | null;
  drafts?: Draft[];
  recipients?: Recipient[];
  deliverySummary?: {
    notSent: number;
    disabled: number;
    sent: number;
    delivered: number;
    failed: number;
  };
  createdAt: string;
  approvedAt?: string;
};

type Draft = {
  id: string;
  content: string;
  promptVersion?: string;
  model?: string;
};

type Recipient = {
  id: string;
  customerId: string;
  customerName: string;
  maskedContact: string;
  consentStatus: string;
  eligibilityStatus: string;
  exclusionReason?: string;
  deliveryStatus: string;
  preferredChannel: string;
  doNotContact: boolean;
};

const channels = ["whatsapp", "sms", "email", "phone"];

export function AiMarketingPanel() {
  const { state, setNotice } = useDashboard();
  const [segments, setSegments] = useState<Segment[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [selectedSegmentKey, setSelectedSegmentKey] = useState("verified_marketing_consent");
  const [periodStart, setPeriodStart] = useState(() => defaultPeriodStart());
  const [periodEnd, setPeriodEnd] = useState(() => defaultPeriodEnd());
  const [campaignName, setCampaignName] = useState("Weekend customer reactivation");
  const [objective, setObjective] = useState("Invite consented customers to review new stock this weekend.");
  const [channel, setChannel] = useState("whatsapp");
  const [tone, setTone] = useState("friendly and clear");
  const [notes, setNotes] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [deliveryMessage, setDeliveryMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const selectedSegment = useMemo(
    () => segments.find((segment) => segment.key === selectedSegmentKey) ?? segments[0] ?? null,
    [segments, selectedSegmentKey],
  );
  const latestDraft = selectedCampaign?.drafts?.[0] ?? selectedCampaign?.latestDraft ?? null;
  const exportHref = selectedCampaign && state.businessId
    ? `/api/ai-marketing/export?${new URLSearchParams({ businessId: state.businessId, campaignId: selectedCampaign.id }).toString()}`
    : "#";

  const loadCampaignDetail = useCallback(async (campaignId: string) => {
    if (!state.businessId) {
      return null;
    }

    const params = new URLSearchParams({ businessId: state.businessId });
    const response = await fetch(`/api/ai-marketing/campaigns/${campaignId}?${params.toString()}`, {
      credentials: "include",
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as { campaign?: Campaign; error?: string } | null;

    if (!response.ok || !payload?.campaign) {
      throw new Error(payload?.error ?? "Could not load campaign.");
    }

    return payload.campaign;
  }, [state.businessId]);

  const load = useCallback(async () => {
    if (!state.businessId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({ businessId: state.businessId });
      if (periodStart) {
        params.set("start", periodStart);
      }
      if (periodEnd) {
        params.set("end", periodEnd);
      }
      const campaignParams = new URLSearchParams({ businessId: state.businessId });
      const [segmentResponse, campaignResponse] = await Promise.all([
        fetch(`/api/ai-marketing/segments?${params.toString()}`, {
          credentials: "include",
          cache: "no-store",
        }),
        fetch(`/api/ai-marketing/campaigns?${campaignParams.toString()}`, {
          credentials: "include",
          cache: "no-store",
        }),
      ]);
      const segmentPayload = (await segmentResponse.json().catch(() => null)) as
        | { segments?: Segment[]; setup?: Setup; capabilities?: Capabilities; error?: string }
        | null;
      const campaignPayload = (await campaignResponse.json().catch(() => null)) as
        | { campaigns?: Campaign[]; setup?: Setup; capabilities?: Capabilities; error?: string }
        | null;

      if (!segmentResponse.ok || !segmentPayload?.segments) {
        throw new Error(segmentPayload?.error ?? "Could not load AI Marketing segments.");
      }

      if (!campaignResponse.ok || !campaignPayload?.campaigns) {
        throw new Error(campaignPayload?.error ?? "Could not load AI Marketing campaigns.");
      }

      const nextSegments = segmentPayload.segments;
      setSegments(nextSegments);
      setCampaigns(campaignPayload.campaigns);
      setSetup(segmentPayload.setup ?? campaignPayload.setup ?? null);
      setCapabilities(segmentPayload.capabilities ?? campaignPayload.capabilities ?? null);
      setSelectedSegmentKey((current) => current || nextSegments[0]?.key || "");

      const firstCampaign = campaignPayload.campaigns[0];
      if (firstCampaign) {
        const detail = await loadCampaignDetail(firstCampaign.id);
        setSelectedCampaign(detail);
        setDraftContent(detail?.drafts?.[0]?.content ?? detail?.latestDraft?.content ?? "");
        setSelectedCustomerId(detail?.recipients?.[0]?.customerId ?? "");
      } else {
        setSelectedCampaign(null);
        setDraftContent("");
        setSelectedCustomerId("");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load AI Marketing.");
    } finally {
      setLoading(false);
    }
  }, [loadCampaignDetail, periodEnd, periodStart, state.businessId, setNotice]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [load]);

  async function createCampaign() {
    if (!state.businessId || busy || !selectedSegment) {
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/ai-marketing/campaigns", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: state.businessId,
          name: campaignName,
          objective,
          channel,
          segmentKey: selectedSegment.key,
          periodStart: periodStart || undefined,
          periodEnd: periodEnd || undefined,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { campaign?: Campaign; error?: string } | null;

      if (!response.ok || !payload?.campaign) {
        throw new Error(payload?.error ?? "Could not create campaign.");
      }

      setNotice("AI Marketing campaign created.");
      setSelectedCampaign(payload.campaign);
      setDraftContent("");
      setSelectedCustomerId(payload.campaign.recipients?.[0]?.customerId ?? "");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not create campaign.");
    } finally {
      setBusy(false);
    }
  }

  async function selectCampaign(campaignId: string) {
    setBusy(true);
    try {
      const campaign = await loadCampaignDetail(campaignId);
      setSelectedCampaign(campaign);
      setDraftContent(campaign?.drafts?.[0]?.content ?? campaign?.latestDraft?.content ?? "");
      setSelectedCustomerId(campaign?.recipients?.[0]?.customerId ?? "");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load campaign.");
    } finally {
      setBusy(false);
    }
  }

  async function generateDraft() {
    if (!state.businessId || !selectedCampaign || busy) {
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`/api/ai-marketing/campaigns/${selectedCampaign.id}/draft`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: state.businessId, tone, editableNotes: notes }),
      });
      const payload = (await response.json().catch(() => null)) as { draft?: Draft; error?: string } | null;

      if (!response.ok || !payload?.draft) {
        throw new Error(payload?.error ?? "Could not generate draft.");
      }

      setDraftContent(payload.draft.content);
      setNotice("AI Marketing draft generated.");
      const detail = await loadCampaignDetail(selectedCampaign.id);
      setSelectedCampaign(detail);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not generate draft.");
    } finally {
      setBusy(false);
    }
  }

  async function approveCampaign() {
    if (!state.businessId || !selectedCampaign || !latestDraft || busy) {
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`/api/ai-marketing/campaigns/${selectedCampaign.id}/approve`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: state.businessId,
          draftId: latestDraft.id,
          reviewConfirmed: true,
          content: draftContent,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { campaign?: Campaign; error?: string } | null;

      if (!response.ok || !payload?.campaign) {
        throw new Error(payload?.error ?? "Could not approve campaign.");
      }

      setSelectedCampaign(payload.campaign);
      setNotice("AI Marketing campaign approved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not approve campaign.");
    } finally {
      setBusy(false);
    }
  }

  async function attemptSend() {
    if (!state.businessId || !selectedCampaign || busy) {
      return;
    }

    setBusy(true);
    try {
      const params = new URLSearchParams({ businessId: state.businessId });
      const response = await fetch(`/api/ai-marketing/campaigns/${selectedCampaign.id}/send?${params.toString()}`, {
        method: "POST",
        credentials: "include",
      });
      const payload = (await response.json().catch(() => null)) as
        | { delivery?: { message: string; status: string; sentCount: number }; error?: string }
        | null;

      if (!response.ok || !payload?.delivery) {
        throw new Error(payload?.error ?? "Could not attempt send.");
      }

      setDeliveryMessage(payload.delivery.message);
      setNotice(payload.delivery.message);
      const detail = await loadCampaignDetail(selectedCampaign.id);
      setSelectedCampaign(detail);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not attempt send.");
    } finally {
      setBusy(false);
    }
  }

  async function optOutSelectedCustomer() {
    if (!state.businessId || !selectedCustomerId || busy) {
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`/api/ai-marketing/customers/${selectedCustomerId}/consent`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: state.businessId,
          marketingConsentStatus: "opted_out",
          marketingConsentSource: "owner_preview_review",
          preferredChannel: channel,
          doNotContact: true,
          consentNotes: "Preview opt-out management QA.",
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not update consent.");
      }

      setNotice("Marketing opt-out recorded.");
      if (selectedCampaign) {
        const detail = await loadCampaignDetail(selectedCampaign.id);
        setSelectedCampaign(detail);
      }
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not update consent.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-5">
      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Segments" value={loading ? "..." : String(segments.length)} icon={<Megaphone size={16} aria-hidden="true" />} />
        <Metric label="Eligible recipients" value={String(selectedSegment?.consentEligibleCount ?? 0)} icon={<ShieldCheck size={16} aria-hidden="true" />} />
        <Metric label="Consent exclusions" value={String(selectedSegment?.excludedCount ?? 0)} icon={<UserX size={16} aria-hidden="true" />} />
        <Metric label="Sending" value={setup?.delivery.enabled ? "Enabled" : "Disabled"} icon={<Send size={16} aria-hidden="true" />} tone="warning" />
      </div>

      <section className="rounded-lg border border-gray-100 bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-medium text-textMuted">Segment overview</p>
            <h2 className="text-base font-semibold text-textPrimary">
              {selectedSegment?.label ?? "No customer segments"}
            </h2>
            <p className="mt-1 text-xs text-textMuted">
              {selectedSegment ? `${selectedSegment.customerCount} customers · ${selectedSegment.period.label}` : "No segment data yet"}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[150px_150px_auto]">
            <label className="grid gap-1 text-xs font-medium text-textMuted">
              Start date
              <input
                className="min-h-10 rounded-lg border border-gray-200 bg-background px-3 text-sm text-textPrimary"
                type="date"
                value={periodStart}
                onChange={(event) => setPeriodStart(event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-xs font-medium text-textMuted">
              End date
              <input
                className="min-h-10 rounded-lg border border-gray-200 bg-background px-3 text-sm text-textPrimary"
                type="date"
                value={periodEnd}
                onChange={(event) => setPeriodEnd(event.target.value)}
              />
            </label>
            <button
              className="inline-flex min-h-10 items-center gap-2 self-end rounded-lg bg-background px-3 text-sm font-semibold text-textPrimary disabled:opacity-50"
              type="button"
              disabled={loading}
              onClick={() => void load()}
            >
              <RefreshCw size={16} aria-hidden="true" />
              Refresh
            </button>
          </div>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          {segments.map((segment) => (
            <button
              key={segment.key}
              className={`min-h-24 rounded-lg border p-3 text-left text-sm transition ${
                selectedSegmentKey === segment.key ? "border-primary bg-primary/5" : "border-gray-100 bg-background"
              }`}
              type="button"
              onClick={() => setSelectedSegmentKey(segment.key)}
            >
              <span className="block font-semibold text-textPrimary">{segment.label}</span>
              <span className="mt-1 block text-xs text-textMuted">
                {segment.consentEligibleCount} eligible · {segment.excludedCount} excluded
              </span>
            </button>
          ))}
        </div>
        {selectedSegment ? (
          <div className="mt-4 rounded-lg bg-background p-3 text-xs text-textSecondary">
            <p className="font-semibold text-textPrimary">{selectedSegment.definition}</p>
            <p className="mt-1">{selectedSegment.dataLimitations.join(" ")}</p>
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)]">
        <div className="rounded-lg border border-gray-100 bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Pencil size={16} className="text-primary" aria-hidden="true" />
            <h2 className="text-base font-semibold text-textPrimary">Campaign objective</h2>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Field label="Campaign name" value={campaignName} onChange={setCampaignName} />
            <label className="grid gap-1 text-xs font-medium text-textMuted">
              Channel
              <select
                className="min-h-10 rounded-lg border border-gray-200 bg-background px-3 text-sm text-textPrimary"
                value={channel}
                onChange={(event) => setChannel(event.target.value)}
              >
                {channels.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
            <Field label="Objective" value={objective} onChange={setObjective} />
            <Field label="Tone" value={tone} onChange={setTone} />
          </div>
          <label className="mt-3 grid gap-1 text-xs font-medium text-textMuted">
            Draft notes
            <textarea
              className="min-h-24 rounded-lg border border-gray-200 bg-background px-3 py-2 text-sm text-textPrimary"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
          <button
            className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-white disabled:opacity-50"
            type="button"
            disabled={busy || !capabilities?.canCreate || !selectedSegment}
            onClick={createCampaign}
          >
            <CheckCircle2 size={16} aria-hidden="true" />
            Create campaign
          </button>
        </div>

        <div className="rounded-lg border border-gray-100 bg-card p-4 shadow-sm">
          <p className="text-xs font-medium text-textMuted">Recipient eligibility summary</p>
          <h2 className="mt-1 text-base font-semibold text-textPrimary">
            {selectedCampaign ? selectedCampaign.name : "No campaign selected"}
          </h2>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <SmallStat label="Total" value={String(selectedCampaign?.recipientSummary.total ?? 0)} />
            <SmallStat label="Eligible" value={String(selectedCampaign?.recipientSummary.eligible ?? 0)} />
            <SmallStat label="Excluded" value={String(selectedCampaign?.recipientSummary.excluded ?? 0)} />
          </div>
          <p className="mt-3 rounded-lg bg-background p-3 text-xs font-medium text-textSecondary">
            {setup?.provider.configured ? `AI provider configured: ${setup.provider.model}` : "AI provider setup required"}
          </p>
          <p className="mt-2 rounded-lg bg-background p-3 text-xs font-medium text-textSecondary">
            {setup?.delivery.message ?? "Outbound AI Marketing sending is disabled for this Preview release."}
          </p>
        </div>
      </section>

      <section className="rounded-lg border border-gray-100 bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-medium text-textMuted">AI message draft</p>
            <h2 className="text-base font-semibold text-textPrimary">
              AI-generated draft <span aria-hidden="true">&mdash;</span> review before approval.
            </h2>
            <p className="mt-1 text-xs text-textMuted">
              {latestDraft ? `${latestDraft.promptVersion ?? "prompt"} · ${latestDraft.model ?? "model"}` : "Generate a draft after creating a campaign."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-background px-3 text-sm font-semibold text-textPrimary disabled:opacity-50"
              type="button"
              disabled={busy || !selectedCampaign || !capabilities?.canCreate || !setup?.provider.configured}
              onClick={generateDraft}
            >
              <Megaphone size={16} aria-hidden="true" />
              Generate draft
            </button>
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-success px-3 text-sm font-semibold text-white disabled:opacity-50"
              type="button"
              disabled={busy || !latestDraft || !draftContent.trim() || !capabilities?.canApprove}
              onClick={approveCampaign}
            >
              <ShieldCheck size={16} aria-hidden="true" />
              Approve campaign
            </button>
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-background px-3 text-sm font-semibold text-textPrimary disabled:opacity-50"
              type="button"
              disabled={busy || !selectedCampaign?.approvedAt || !capabilities?.canSend}
              onClick={attemptSend}
            >
              <Send size={16} aria-hidden="true" />
              Attempt send
            </button>
            <a
              className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold ${
                selectedCampaign && capabilities?.canExport ? "bg-background text-textPrimary" : "pointer-events-none bg-background text-textMuted opacity-50"
              }`}
              href={exportHref}
            >
              <Download size={16} aria-hidden="true" />
              Export
            </a>
          </div>
        </div>
        <textarea
          className="mt-4 min-h-44 w-full rounded-lg border border-gray-200 bg-background px-3 py-2 text-sm leading-6 text-textPrimary"
          value={draftContent}
          onChange={(event) => setDraftContent(event.target.value)}
          placeholder="Draft content appears here for manual editing."
        />
        {deliveryMessage ? (
          <p className="mt-3 rounded-lg bg-warning/10 p-3 text-sm font-medium text-warning">
            {deliveryMessage}
          </p>
        ) : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)]">
        <div className="rounded-lg border border-gray-100 bg-card p-4 shadow-sm">
          <p className="text-xs font-medium text-textMuted">Campaign preview</p>
          <h2 className="mt-1 text-base font-semibold text-textPrimary">Consent exclusions</h2>
          <div className="mt-3 grid gap-2">
            {(selectedCampaign?.recipients ?? []).length ? (
              (selectedCampaign?.recipients ?? []).map((recipient) => (
                <button
                  key={recipient.id}
                  className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg bg-background px-3 py-2 text-left text-sm"
                  type="button"
                  onClick={() => setSelectedCustomerId(recipient.customerId)}
                >
                  <span>
                    <span className="block font-semibold text-textPrimary">{recipient.customerName}</span>
                    <span className="text-xs text-textMuted">
                      {recipient.consentStatus} · {recipient.eligibilityStatus}
                      {recipient.exclusionReason ? ` · ${recipient.exclusionReason}` : ""}
                    </span>
                  </span>
                  <span className="text-xs font-semibold text-textMuted">{recipient.deliveryStatus}</span>
                </button>
              ))
            ) : (
              <p className="rounded-lg bg-background p-3 text-sm font-medium text-textSecondary">
                Empty state: create a campaign to preview eligible and excluded recipients.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-gray-100 bg-card p-4 shadow-sm">
            <p className="text-xs font-medium text-textMuted">Opt-out management</p>
            <h2 className="mt-1 text-base font-semibold text-textPrimary">Selected customer</h2>
            <select
              className="mt-3 min-h-10 w-full rounded-lg border border-gray-200 bg-background px-3 text-sm text-textPrimary"
              value={selectedCustomerId}
              onChange={(event) => setSelectedCustomerId(event.target.value)}
            >
              {(selectedCampaign?.recipients ?? []).map((recipient) => (
                <option key={recipient.customerId} value={recipient.customerId}>
                  {recipient.customerName}
                </option>
              ))}
            </select>
            <button
              className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg bg-background px-3 text-sm font-semibold text-textPrimary disabled:opacity-50"
              type="button"
              disabled={busy || !selectedCustomerId || !capabilities?.canManageConsent}
              onClick={optOutSelectedCustomer}
            >
              <UserX size={16} aria-hidden="true" />
              Record opt-out
            </button>
          </div>

          <div className="rounded-lg border border-gray-100 bg-card p-4 shadow-sm">
            <p className="text-xs font-medium text-textMuted">Campaign history</p>
            <div className="mt-3 grid gap-2">
              {campaigns.length ? campaigns.map((campaign) => (
                <button
                  key={campaign.id}
                  className="rounded-lg bg-background p-3 text-left text-sm"
                  type="button"
                  onClick={() => void selectCampaign(campaign.id)}
                >
                  <span className="block font-semibold text-textPrimary">{campaign.name}</span>
                  <span className="text-xs text-textMuted">
                    {campaign.status} · {campaign.recipientSummary.eligible} eligible
                  </span>
                </button>
              )) : (
                <p className="rounded-lg bg-background p-3 text-sm font-medium text-textSecondary">
                  No AI Marketing campaigns have been created.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>
    </section>
  );
}

function Metric({
  label,
  value,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: "neutral" | "warning";
}) {
  return (
    <div className="rounded-lg border border-gray-100 bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-textMuted">{label}</p>
        <span className={tone === "warning" ? "text-warning" : "text-primary"}>{icon}</span>
      </div>
      <p className="mt-3 text-lg font-semibold text-textPrimary">{value}</p>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-background p-3">
      <p className="text-xs font-medium text-textMuted">{label}</p>
      <p className="mt-1 text-sm font-semibold text-textPrimary">{value}</p>
    </div>
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
    <label className="grid gap-1 text-xs font-medium text-textMuted">
      {label}
      <input
        className="min-h-10 rounded-lg border border-gray-200 bg-background px-3 text-sm text-textPrimary"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function defaultPeriodEnd() {
  return toDateInputValue(new Date());
}

function defaultPeriodStart() {
  const date = new Date();
  date.setDate(date.getDate() - 90);

  return toDateInputValue(date);
}

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}
