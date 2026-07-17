"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Archive, Building2, MapPin, Plus } from "lucide-react";
import type { MoneybookState } from "@/lib/bookkeeping/transaction-engine";

type LocationKind =
  | "main_shop"
  | "warehouse"
  | "branch"
  | "storage"
  | "virtual"
  | "damaged_goods"
  | "transit";

type ManagedLocation = {
  id: string;
  name: string;
  type: string;
  address?: string;
  phone?: string;
  email?: string;
  isDefault: boolean;
  archivedAt?: string;
  productBalanceCount?: number;
  memberCount?: number;
};

const locationTypes: Array<{ value: LocationKind; label: string }> = [
  { value: "main_shop", label: "Main shop" },
  { value: "warehouse", label: "Warehouse" },
  { value: "branch", label: "Branch" },
  { value: "storage", label: "Storage" },
  { value: "virtual", label: "Virtual" },
  { value: "damaged_goods", label: "Damaged goods" },
  { value: "transit", label: "Transit" },
];

export function LocationManagementPanel({
  businessId,
  initialLocations,
  mode = "all",
  onNotice,
}: {
  businessId?: string;
  initialLocations?: NonNullable<MoneybookState["locations"]>;
  mode?: "all" | "warehouses";
  onNotice: (message: string) => void;
}) {
  const [locations, setLocations] = useState<ManagedLocation[]>(initialLocations ?? []);
  const [name, setName] = useState("");
  const [type, setType] = useState<LocationKind>(mode === "warehouses" ? "warehouse" : "branch");
  const [address, setAddress] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!businessId) {
      return;
    }

    let mounted = true;

    fetch(`/api/locations?businessId=${encodeURIComponent(businessId)}`, {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as {
          locations?: ManagedLocation[];
          error?: string;
        } | null;

        if (!mounted) {
          return;
        }

        if (response.ok) {
          setLocations(payload?.locations ?? []);
          return;
        }

        onNotice(payload?.error ?? "Could not load locations.");
      })
      .catch(() => {
        if (mounted) {
          onNotice("Could not load locations.");
        }
      });

    return () => {
      mounted = false;
    };
  }, [businessId, onNotice]);

  const visibleLocations = useMemo(
    () =>
      mode === "warehouses"
        ? locations.filter((location) => location.type === "warehouse")
        : locations,
    [locations, mode],
  );

  async function createLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!businessId || !name.trim()) {
      return;
    }

    setIsSaving(true);
    const response = await fetch("/api/locations", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessId,
        name,
        type,
        address,
      }),
    });
    const payload = (await response.json().catch(() => null)) as {
      location?: ManagedLocation;
      error?: string;
    } | null;
    setIsSaving(false);

    if (response.ok && payload?.location) {
      setLocations((current) => [...current, payload.location as ManagedLocation]);
      setName("");
      setAddress("");
      onNotice(`${payload.location.name} created.`);
      return;
    }

    onNotice(payload?.error ?? "Could not create location.");
  }

  async function archiveLocation(location: ManagedLocation) {
    if (!businessId) {
      return;
    }

    const response = await fetch(`/api/locations/${location.id}`, {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId }),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;

    if (response.ok) {
      setLocations((current) => current.filter((item) => item.id !== location.id));
      onNotice(`${location.name} archived.`);
      return;
    }

    onNotice(payload?.error ?? "Could not archive location.");
  }

  function selectForStock(location: ManagedLocation) {
    if (!businessId) {
      return;
    }

    localStorage.setItem(`selectedLocationId:${businessId}`, location.id);
    onNotice(`${location.name} selected for stock.`);
    window.location.assign("/stock");
  }

  const title = mode === "warehouses" ? "Warehouses" : "Business locations";
  const emptyTitle = mode === "warehouses" ? "No warehouses yet" : "No locations yet";

  return (
    <section className="rounded-2xl border border-gray-100 bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-textSecondary">
            {mode === "warehouses" ? "Stock" : "Business settings"}
          </p>
          <h2 className="mt-1 text-base font-semibold text-textPrimary">{title}</h2>
        </div>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          {visibleLocations.length}
        </span>
      </div>

      <form className="mt-5 grid gap-3 md:grid-cols-[1fr_180px_1fr_auto]" onSubmit={createLocation}>
        <label className="grid gap-2 text-sm font-medium text-textPrimary">
          Name
          <input
            className="min-h-12 rounded-xl border border-gray-200 bg-white px-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={mode === "warehouses" ? "Central warehouse" : "New branch"}
          />
        </label>
        <label className="grid gap-2 text-sm font-medium text-textPrimary">
          Type
          <select
            className="min-h-12 rounded-xl border border-gray-200 bg-white px-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            value={type}
            onChange={(event) => setType(event.target.value as LocationKind)}
          >
            {locationTypes
              .filter((option) => mode === "all" || option.value === "warehouse")
              .map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium text-textPrimary">
          Address
          <input
            className="min-h-12 rounded-xl border border-gray-200 bg-white px-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />
        </label>
        <button
          className="mt-auto inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          type="submit"
          disabled={!name.trim() || isSaving}
        >
          <Plus size={16} aria-hidden="true" />
          {isSaving ? "Saving..." : "Create"}
        </button>
      </form>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {visibleLocations.length === 0 ? (
          <div className="rounded-xl bg-background p-5 text-sm text-textSecondary">
            <p className="font-semibold text-textPrimary">{emptyTitle}</p>
            <p className="mt-1 leading-6">Create one to make this section available for stock movement.</p>
          </div>
        ) : (
          visibleLocations.map((location) => (
            <div key={location.id} className="rounded-xl border border-gray-100 bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {location.type === "warehouse" ? (
                      <Building2 size={17} aria-hidden="true" />
                    ) : (
                      <MapPin size={17} aria-hidden="true" />
                    )}
                    <p className="truncate text-sm font-semibold text-textPrimary">{location.name}</p>
                  </div>
                  <p className="mt-1 text-xs font-medium uppercase text-textMuted">
                    {formatLocationType(location.type)}
                    {location.isDefault ? " · default" : ""}
                  </p>
                </div>
                <button
                  className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-xs font-semibold text-textPrimary"
                  type="button"
                  onClick={() => selectForStock(location)}
                >
                  Use for stock
                </button>
                {!location.isDefault ? (
                  <button
                    className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-xs font-semibold text-textPrimary"
                    type="button"
                    onClick={() => archiveLocation(location)}
                  >
                    <Archive size={14} aria-hidden="true" />
                    Archive
                  </button>
                ) : null}
              </div>
              {location.address ? (
                <p className="mt-3 text-sm text-textSecondary">{location.address}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-textSecondary">
                <span className="rounded-full bg-white px-3 py-1">
                  {location.productBalanceCount ?? 0} product balances
                </span>
                <span className="rounded-full bg-white px-3 py-1">
                  {location.memberCount ?? 0} staff
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function formatLocationType(type: string) {
  return type.replaceAll("_", " ");
}
