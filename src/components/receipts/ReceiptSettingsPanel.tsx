"use client";

import { FormEvent, useState } from "react";
import type { ReceiptConfig } from "@/lib/bookkeeping/transaction-engine";

const defaultConfig: ReceiptConfig = {
  includePoweredBy: true,
  defaultPaperSize: "80mm",
};

export function ReceiptSettingsPanel({
  config,
  onSave,
}: {
  config?: ReceiptConfig;
  onSave: (input: ReceiptConfig) => Promise<boolean>;
}) {
  const [form, setForm] = useState<ReceiptConfig>({ ...defaultConfig, ...config });
  const [isSaving, setIsSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    await onSave({
      ...form,
      logoUrl: cleanOptional(form.logoUrl),
      address: cleanOptional(form.address),
      phone: cleanOptional(form.phone),
      email: cleanOptional(form.email),
      taxId: cleanOptional(form.taxId),
      footerMessage: cleanOptional(form.footerMessage),
    });
    setIsSaving(false);
  }

  return (
    <section className="rounded-2xl border border-gray-100 bg-card p-6 shadow-sm">
      <div>
        <p className="text-xs font-medium text-textSecondary">Receipts</p>
        <h2 className="mt-1 text-base font-semibold text-textPrimary">Print settings</h2>
      </div>

      <form className="mt-4 grid gap-4" onSubmit={submit}>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Logo URL">
            <Input
              placeholder="https://..."
              value={form.logoUrl ?? ""}
              onChange={(value) => setForm((current) => ({ ...current, logoUrl: value }))}
            />
          </Field>
          <Field label="Default paper">
            <select
              className="min-h-12 rounded-xl border border-gray-200 bg-white px-4 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              value={form.defaultPaperSize}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  defaultPaperSize: event.target.value as ReceiptConfig["defaultPaperSize"],
                }))
              }
            >
              <option value="58mm">58 mm thermal</option>
              <option value="80mm">80 mm thermal</option>
              <option value="pdf">Standard PDF</option>
            </select>
          </Field>
        </div>

        <Field label="Address">
          <Input
            placeholder="Shop address"
            value={form.address ?? ""}
            onChange={(value) => setForm((current) => ({ ...current, address: value }))}
          />
        </Field>

        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Phone">
            <Input
              placeholder="+234..."
              value={form.phone ?? ""}
              onChange={(value) => setForm((current) => ({ ...current, phone: value }))}
            />
          </Field>
          <Field label="Email">
            <Input
              placeholder="sales@example.com"
              value={form.email ?? ""}
              onChange={(value) => setForm((current) => ({ ...current, email: value }))}
            />
          </Field>
          <Field label="Tax ID">
            <Input
              placeholder="TIN / VAT"
              value={form.taxId ?? ""}
              onChange={(value) => setForm((current) => ({ ...current, taxId: value }))}
            />
          </Field>
        </div>

        <Field label="Footer message">
          <Input
            placeholder="Thank you for your business."
            value={form.footerMessage ?? ""}
            onChange={(value) => setForm((current) => ({ ...current, footerMessage: value }))}
          />
        </Field>

        <label className="flex min-h-12 items-center justify-between gap-4 rounded-xl bg-background px-4 text-sm font-semibold">
          <span>Show MoneyBook footer</span>
          <input
            checked={form.includePoweredBy}
            className="h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary/20"
            type="checkbox"
            onChange={(event) =>
              setForm((current) => ({ ...current, includePoweredBy: event.target.checked }))
            }
          />
        </label>

        <button
          className="min-h-12 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-primaryHover hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          type="submit"
          disabled={isSaving}
        >
          {isSaving ? "Saving..." : "Save receipt settings"}
        </button>
      </form>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-medium text-textPrimary">
      {label}
      {children}
    </label>
  );
}

function Input({
  placeholder,
  value,
  onChange,
}: {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      className="min-h-12 rounded-xl border border-gray-200 bg-white px-4 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function cleanOptional(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
