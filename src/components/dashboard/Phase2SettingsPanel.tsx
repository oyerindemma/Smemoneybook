"use client";

import { FormEvent, useEffect, useState } from "react";
import { Bell, Languages, LockKeyhole, Palette, Percent } from "lucide-react";
import { phase2FeatureFlags } from "@/lib/phase2/feature-flags";

type TaxRate = {
  label: string;
  rate: number;
  type: "vat" | "zero_rated" | "exempt" | "custom";
  isDefault: boolean;
};

type Announcement = {
  id: string;
  title: string;
  body: string;
};

export function Phase2SettingsPanel({
  businessId,
  onNotice,
}: {
  businessId?: string;
  onNotice: (message: string) => void;
}) {
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [taxId, setTaxId] = useState("");
  const [taxRate, setTaxRate] = useState("7.5");
  const [tradingName, setTradingName] = useState("");
  const [invoicePrefix, setInvoicePrefix] = useState("INV");
  const [accentColor, setAccentColor] = useState("#0B1F3A");
  const [language, setLanguage] = useState("en");
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [permissionsRole, setPermissionsRole] = useState<"staff" | "accountant">("staff");
  const [isSaving, setIsSaving] = useState("");

  const visible =
    phase2FeatureFlags.tax ||
    phase2FeatureFlags.invoiceBranding ||
    phase2FeatureFlags.i18n ||
    phase2FeatureFlags.granularPermissions ||
    phase2FeatureFlags.announcements;

  useEffect(() => {
    if (!businessId || !visible) {
      return;
    }

    if (phase2FeatureFlags.tax) {
      void fetch(`/api/tax/settings?businessId=${encodeURIComponent(businessId)}`, {
        credentials: "include",
        cache: "no-store",
      })
        .then(async (response) => {
          const payload = (await response.json().catch(() => null)) as {
            config?: { enabled?: boolean; registrationNumber?: string };
            rates?: Array<{ rate: number; isDefault: boolean }>;
          } | null;

          if (response.ok && payload) {
            setTaxEnabled(Boolean(payload.config?.enabled));
            setTaxId(payload.config?.registrationNumber ?? "");
            setTaxRate(String(payload.rates?.find((rate) => rate.isDefault)?.rate ?? 7.5));
          }
        })
        .catch(() => undefined);
    }

    if (phase2FeatureFlags.invoiceBranding) {
      void fetch(`/api/document-branding?businessId=${encodeURIComponent(businessId)}`, {
        credentials: "include",
        cache: "no-store",
      })
        .then(async (response) => {
          const payload = (await response.json().catch(() => null)) as {
            branding?: {
              tradingName?: string;
              invoicePrefix?: string;
              accentColor?: string;
            };
          } | null;

          if (response.ok && payload?.branding) {
            setTradingName(payload.branding.tradingName ?? "");
            setInvoicePrefix(payload.branding.invoicePrefix ?? "INV");
            setAccentColor(payload.branding.accentColor ?? "#0B1F3A");
          }
        })
        .catch(() => undefined);
    }

    if (phase2FeatureFlags.i18n) {
      void fetch(`/api/i18n/preferences?businessId=${encodeURIComponent(businessId)}`, {
        credentials: "include",
        cache: "no-store",
      })
        .then(async (response) => {
          const payload = (await response.json().catch(() => null)) as {
            language?: string;
          } | null;

          if (response.ok && payload?.language) {
            setLanguage(payload.language);
          }
        })
        .catch(() => undefined);
    }

    if (phase2FeatureFlags.announcements) {
      void fetch("/api/announcements", { credentials: "include", cache: "no-store" })
        .then(async (response) => {
          const payload = (await response.json().catch(() => null)) as {
            announcements?: Announcement[];
          } | null;

          if (response.ok) {
            setAnnouncements(payload?.announcements ?? []);
          }
        })
        .catch(() => undefined);
    }
  }, [businessId, visible]);

  if (!visible || !businessId) {
    return null;
  }

  async function saveTax(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!businessId) return;
    setIsSaving("tax");
    const rates: TaxRate[] = [
      { label: "VAT", rate: Number(taxRate), type: "vat", isDefault: true },
    ];
    const response = await fetch("/api/tax/settings", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessId,
        country: "NG",
        registrationNumber: taxId,
        enabled: taxEnabled,
        inclusiveByDefault: false,
        rates,
      }),
    });
    setIsSaving("");
    onNotice(response.ok ? "Tax settings saved." : "Could not save tax settings.");
  }

  async function saveBranding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!businessId) return;
    setIsSaving("branding");
    const response = await fetch("/api/document-branding", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId, tradingName, invoicePrefix, accentColor }),
    });
    setIsSaving("");
    onNotice(response.ok ? "Document branding saved." : "Could not save branding.");
  }

  async function saveLanguage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving("language");
    const response = await fetch("/api/i18n/preferences", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId, language, applyToBusiness: true }),
    });
    setIsSaving("");
    onNotice(response.ok ? "Language preference saved." : "Could not save language.");
  }

  async function savePermissionPolicy() {
    setIsSaving("permissions");
    const permissions =
      permissionsRole === "staff"
        ? ["money:write", "inventory:write", "locations:view", "transfers:view"]
        : ["reports:write", "backup:read", "locations:view", "transfers:view"];
    const response = await fetch("/api/permissions/policies", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId, role: permissionsRole, permissions }),
    });
    setIsSaving("");
    onNotice(response.ok ? "Permission policy saved." : "Could not save permissions.");
  }

  async function dismissAnnouncement(id: string) {
    await fetch(`/api/announcements/${id}/read`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dismissed: true }),
    });
    setAnnouncements((current) => current.filter((announcement) => announcement.id !== id));
  }

  return (
    <section className="rounded-2xl border border-gray-100 bg-card p-6 shadow-sm">
      <p className="text-xs font-medium text-textSecondary">Phase 2</p>
      <h2 className="mt-1 text-base font-semibold text-textPrimary">Business OS settings</h2>

      <div className="mt-5 grid gap-4">
        {phase2FeatureFlags.tax ? (
          <form className="rounded-xl bg-background p-4" onSubmit={saveTax}>
            <SectionTitle icon={<Percent size={18} />} title="Tax" />
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <label className="flex min-h-12 items-center gap-3 rounded-xl bg-white px-4 text-sm font-semibold">
                <input
                  checked={taxEnabled}
                  type="checkbox"
                  onChange={(event) => setTaxEnabled(event.target.checked)}
                />
                Enabled
              </label>
              <Input label="Tax ID" value={taxId} onChange={setTaxId} />
              <Input label="VAT %" value={taxRate} onChange={setTaxRate} type="number" />
            </div>
            <SaveButton active={isSaving === "tax"} />
          </form>
        ) : null}

        {phase2FeatureFlags.invoiceBranding ? (
          <form className="rounded-xl bg-background p-4" onSubmit={saveBranding}>
            <SectionTitle icon={<Palette size={18} />} title="Document branding" />
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <Input label="Trading name" value={tradingName} onChange={setTradingName} />
              <Input label="Invoice prefix" value={invoicePrefix} onChange={setInvoicePrefix} />
              <Input label="Accent color" value={accentColor} onChange={setAccentColor} />
            </div>
            <SaveButton active={isSaving === "branding"} />
          </form>
        ) : null}

        {phase2FeatureFlags.i18n ? (
          <form className="rounded-xl bg-background p-4" onSubmit={saveLanguage}>
            <SectionTitle icon={<Languages size={18} />} title="Language" />
            <select
              className="mt-3 min-h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm outline-none"
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
            >
              <option value="en">English</option>
              <option value="fr">French</option>
              <option value="sw">Swahili</option>
              <option value="ha">Hausa</option>
              <option value="yo">Yoruba</option>
              <option value="ig">Igbo</option>
            </select>
            <SaveButton active={isSaving === "language"} />
          </form>
        ) : null}

        {phase2FeatureFlags.granularPermissions ? (
          <div className="rounded-xl bg-background p-4">
            <SectionTitle icon={<LockKeyhole size={18} />} title="Permissions" />
            <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
              <select
                className="min-h-12 rounded-xl border border-gray-200 bg-white px-4 text-sm outline-none"
                value={permissionsRole}
                onChange={(event) => setPermissionsRole(event.target.value as "staff" | "accountant")}
              >
                <option value="staff">Staff</option>
                <option value="accountant">Accountant</option>
              </select>
              <button
                className="min-h-12 rounded-xl bg-primary px-5 text-sm font-semibold text-white"
                type="button"
                onClick={savePermissionPolicy}
              >
                {isSaving === "permissions" ? "Saving..." : "Save policy"}
              </button>
            </div>
          </div>
        ) : null}

        {phase2FeatureFlags.announcements ? (
          <div className="rounded-xl bg-background p-4">
            <SectionTitle icon={<Bell size={18} />} title="Announcements" />
            <div className="mt-3 grid gap-3">
              {announcements.length === 0 ? (
                <p className="text-sm text-textSecondary">No announcements.</p>
              ) : (
                announcements.map((announcement) => (
                  <div key={announcement.id} className="rounded-xl bg-white p-4">
                    <p className="text-sm font-semibold text-textPrimary">{announcement.title}</p>
                    <p className="mt-1 text-sm text-textSecondary">{announcement.body}</p>
                    <button
                      className="mt-3 text-xs font-semibold text-primary"
                      type="button"
                      onClick={() => dismissAnnouncement(announcement.id)}
                    >
                      Dismiss
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold text-textPrimary">
      {icon}
      <span>{title}</span>
    </div>
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
        className="min-h-12 rounded-xl border border-gray-200 bg-white px-4 text-sm outline-none"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function SaveButton({ active }: { active: boolean }) {
  return (
    <button
      className="mt-3 min-h-12 rounded-xl bg-primary px-5 text-sm font-semibold text-white"
      type="submit"
      disabled={active}
    >
      {active ? "Saving..." : "Save"}
    </button>
  );
}
