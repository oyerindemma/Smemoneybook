"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Check, History, PackageCheck, Send, X } from "lucide-react";
import type { InventoryItem, MoneybookState } from "@/lib/bookkeeping/transaction-engine";

type Transfer = {
  id: string;
  transferNumber: string;
  status: string;
  reason?: string;
  reference?: string;
  createdAt?: string;
  sourceLocation: { id: string; name: string };
  destinationLocation: { id: string; name: string };
  items: Array<{
    inventoryItemId: string;
    name: string;
    requestedQuantity: number;
    sentQuantity: number;
    receivedQuantity: number;
    damagedQuantity: number;
    shortageQuantity: number;
  }>;
  auditEvents?: Array<{
    id: string;
    action: string;
    message: string;
    createdAt: string;
    actor?: {
      name: string;
      email: string;
    };
  }>;
};

export function StockTransferPanel({
  businessId,
  locations,
  items,
  onNotice,
}: {
  businessId?: string;
  locations: NonNullable<MoneybookState["locations"]>;
  items: InventoryItem[];
  onNotice: (message: string) => void;
}) {
  const initialWarehouseLocations = locations.filter((location) => location.type === "warehouse");
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [sourceLocationId, setSourceLocationId] = useState(initialWarehouseLocations[0]?.id ?? "");
  const [destinationLocationId, setDestinationLocationId] = useState(initialWarehouseLocations[1]?.id ?? "");
  const [inventoryItemId, setInventoryItemId] = useState(items[0]?.id ?? "");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const warehouseLocations = useMemo(
    () => locations.filter((location) => location.type === "warehouse"),
    [locations],
  );

  const productName = useMemo(
    () => items.find((item) => item.id === inventoryItemId)?.name ?? "Product",
    [inventoryItemId, items],
  );

  const selectedSourceLocationId = warehouseLocations.some(
    (location) => location.id === sourceLocationId,
  )
    ? sourceLocationId
    : warehouseLocations[0]?.id ?? "";
  const selectedDestinationLocationId =
    warehouseLocations.some((location) => location.id === destinationLocationId) &&
    destinationLocationId !== selectedSourceLocationId
      ? destinationLocationId
      : warehouseLocations.find((location) => location.id !== selectedSourceLocationId)?.id ?? "";

  const canCreate = Boolean(
    businessId &&
      selectedSourceLocationId &&
      selectedDestinationLocationId &&
      selectedSourceLocationId !== selectedDestinationLocationId &&
      inventoryItemId &&
      Number(quantity) > 0,
  );

  useEffect(() => {
    if (!businessId) {
      return;
    }

    let mounted = true;

    fetch(`/api/stock-transfers?businessId=${encodeURIComponent(businessId)}`, {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as {
          transfers?: Transfer[];
          error?: string;
        } | null;

        if (!mounted) {
          return;
        }

        if (response.ok) {
          setTransfers(payload?.transfers ?? []);
        }
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
    };
  }, [businessId]);

  async function createTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!businessId || !canCreate) {
      return;
    }

    setIsSaving(true);
    const response = await fetch("/api/stock-transfers", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessId,
        sourceLocationId: selectedSourceLocationId,
        destinationLocationId: selectedDestinationLocationId,
        reason,
        idempotencyKey: createTransferKey(),
        items: [{ inventoryItemId, quantity: Number(quantity) }],
      }),
    });
    const payload = (await response.json().catch(() => null)) as {
      transfer?: Transfer;
      error?: string;
    } | null;
    setIsSaving(false);

    if (response.ok && payload?.transfer) {
      setTransfers((current) => [payload.transfer as Transfer, ...current]);
      setQuantity("1");
      setReason("");
      onNotice(`Transfer created for ${productName}.`);
      return;
    }

    onNotice(payload?.error ?? "Could not create transfer.");
  }

  async function transitionTransfer(
    transfer: Transfer,
    action: "approve" | "send" | "receive" | "reject" | "cancel",
  ) {
    if (!businessId) {
      return;
    }

    const response = await fetch(`/api/stock-transfers/${transfer.id}/${action}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessId,
        items:
          action === "receive"
            ? transfer.items.map((item) => ({
                inventoryItemId: item.inventoryItemId,
                receivedQuantity: item.sentQuantity || item.requestedQuantity,
                damagedQuantity: 0,
              }))
            : undefined,
      }),
    });
    const payload = (await response.json().catch(() => null)) as {
      transfer?: Transfer;
      error?: string;
    } | null;

    if (response.ok && payload?.transfer) {
      setTransfers((current) =>
        current.map((item) => (item.id === transfer.id ? (payload.transfer as Transfer) : item)),
      );
      onNotice(`Transfer ${action} saved.`);
      return;
    }

    onNotice(payload?.error ?? `Could not ${action} transfer.`);
  }

  if (warehouseLocations.length < 2) {
    return (
      <section className="rounded-2xl border border-gray-100 bg-card p-6 shadow-sm">
        <p className="text-xs font-medium text-textSecondary">Transfers</p>
        <h2 className="mt-1 text-base font-semibold text-textPrimary">Warehouse transfers</h2>
        <p className="mt-2 text-sm text-textSecondary">
          Add at least two warehouses before moving stock between them.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-gray-100 bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-textSecondary">Transfers</p>
          <h2 className="mt-1 text-base font-semibold text-textPrimary">Warehouse transfers</h2>
        </div>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          {transfers.length} active
        </span>
      </div>

      <form className="mt-4 grid gap-3" onSubmit={createTransfer}>
        <div className="grid gap-3 md:grid-cols-2">
          <Select label="From" value={selectedSourceLocationId} onChange={setSourceLocationId}>
            {warehouseLocations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </Select>
          <Select label="To" value={selectedDestinationLocationId} onChange={setDestinationLocationId}>
            {warehouseLocations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_140px]">
          <Select label="Product" value={inventoryItemId} onChange={setInventoryItemId}>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
          <label className="grid gap-2 text-sm font-medium text-textPrimary">
            Quantity
            <input
              className="min-h-12 rounded-xl border border-gray-200 bg-white px-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              min="0.01"
              step="0.01"
              type="number"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </label>
        </div>
        <label className="grid gap-2 text-sm font-medium text-textPrimary">
          Reason
          <input
            className="min-h-12 rounded-xl border border-gray-200 bg-white px-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <button
          className="min-h-12 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          type="submit"
          disabled={!canCreate || isSaving}
        >
          {isSaving ? "Creating..." : "Create transfer"}
        </button>
      </form>

      <div className="mt-5 grid gap-3">
        {transfers.slice(0, 8).map((transfer) => (
          <div key={transfer.id} className="rounded-xl border border-gray-100 bg-background p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-textPrimary">
                  {transfer.transferNumber}
                </p>
                <p className="mt-1 text-xs text-textSecondary">
                  {transfer.sourceLocation.name} to {transfer.destinationLocation.name}
                </p>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-textPrimary">
                {formatTransferStatus(transfer.status)}
              </span>
            </div>
            {transfer.reason ? (
              <p className="mt-2 text-xs text-textMuted">Reason: {transfer.reason}</p>
            ) : null}
            <p className="mt-3 text-sm text-textSecondary">
              {transfer.items
                .map((item) => `${item.name} (${item.requestedQuantity})`)
                .join(", ")}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {transfer.status === "draft" ? (
                <IconButton
                  label="Approve"
                  icon={<Check size={16} />}
                  onClick={() => transitionTransfer(transfer, "approve")}
                />
              ) : null}
              {transfer.status === "approved" ? (
                <IconButton
                  label="Send"
                  icon={<Send size={16} />}
                  onClick={() => transitionTransfer(transfer, "send")}
                />
              ) : null}
              {transfer.status === "in_transit" ? (
                <>
                  <IconButton
                    label="Receive"
                    icon={<PackageCheck size={16} />}
                    onClick={() => transitionTransfer(transfer, "receive")}
                  />
                  <IconButton
                    label="Reject"
                    icon={<X size={16} />}
                    onClick={() => transitionTransfer(transfer, "reject")}
                  />
                </>
              ) : null}
              {["draft", "approved"].includes(transfer.status) ? (
                <IconButton
                  label="Cancel"
                  icon={<X size={16} />}
                  onClick={() => transitionTransfer(transfer, "cancel")}
                />
              ) : null}
            </div>
            {transfer.auditEvents?.length ? (
              <div className="mt-4 rounded-xl bg-white p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-textPrimary">
                  <History size={14} aria-hidden="true" />
                  Audit history
                </div>
                <div className="mt-2 grid gap-2">
                  {transfer.auditEvents.map((event) => (
                    <p className="text-xs leading-5 text-textSecondary" key={event.id}>
                      {formatDate(event.createdAt)} · {event.message}
                      {event.actor ? ` by ${event.actor.name}` : ""}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium text-textPrimary">
      {label}
      <select
        className="min-h-12 rounded-xl border border-gray-200 bg-white px-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

function IconButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-xs font-semibold text-textPrimary"
      type="button"
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

function formatTransferStatus(status: string) {
  return {
    draft: "Draft",
    approved: "Approved",
    in_transit: "Sent",
    received: "Received",
    partially_received: "Partially received",
    cancelled: "Cancelled",
  }[status] ?? status.replaceAll("_", " ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function createTransferKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `transfer-${crypto.randomUUID()}`;
  }

  return `transfer-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
