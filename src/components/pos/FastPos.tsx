"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, Printer, ScanLine, Search, Star, Trash2 } from "lucide-react";
import { useDashboard } from "@/components/dashboard/DashboardProvider";
import type { Account, InventoryItem } from "@/components/dashboard/types";
import { formatNaira, type ReceiptConfig } from "@/lib/bookkeeping/transaction-engine";
import {
  formatQuantityValue,
  formatSaleQuantity,
  formatStockQuantity,
  getAvailableSaleQuantity,
  getConversionFactor,
  getSellingUnitLabel,
  getStockQuantity,
  isConvertedSaleUnit,
  saleQuantityToStockQuantity,
  stockQuantityToSaleQuantity,
} from "@/lib/inventory/unit-conversion";

type CartLine = {
  inventoryItemId: string;
  quantity: number;
  discount: number;
};

type PaymentLine = {
  method: "cash" | "bank_transfer" | "pos_terminal" | "card" | "wallet" | "other";
  amount: number;
  accountId?: string;
};

type PosReceipt = Awaited<ReturnType<ReturnType<typeof useDashboard>["checkoutPos"]>>;
type PaperSize = ReceiptConfig["defaultPaperSize"];

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
};

const paymentMethods: Array<{ value: PaymentLine["method"]; label: string }> = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "pos_terminal", label: "POS terminal" },
  { value: "card", label: "Card" },
  { value: "wallet", label: "Wallet" },
  { value: "other", label: "Other" },
];

export function FastPos({
  items,
  accounts,
  businessName,
  receiptConfig,
}: {
  items: InventoryItem[];
  accounts: Account[];
  businessName: string;
  receiptConfig?: ReceiptConfig;
}) {
  const { checkoutPos } = useDashboard();
  const [search, setSearch] = useState("");
  const [barcode, setBarcode] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payments, setPayments] = useState<PaymentLine[]>([
    {
      method: "cash",
      amount: 0,
      accountId: accounts.find((account) => account.type === "cash")?.id ?? accounts[0]?.id,
    },
  ]);
  const [orderDiscount, setOrderDiscount] = useState("0");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [note, setNote] = useState("");
  const [favorites, setFavorites] = useState<string[]>(() => readStoredList("posFavoriteProducts"));
  const [recent, setRecent] = useState<string[]>(() => readStoredList("posRecentProducts"));
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [receipt, setReceipt] = useState<PosReceipt>(null);
  const [paperSize, setPaperSize] = useState<PaperSize>(
    receiptConfig?.defaultPaperSize ?? "80mm",
  );
  const [scanStatus, setScanStatus] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    },
    [],
  );

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const cartLines = cart
    .map((line) => {
      const item = itemById.get(line.inventoryItemId);

      if (!item) {
        return null;
      }

      const stockQuantity = saleQuantityToStockQuantity(item, line.quantity);
      const gross = item.sellingPrice * line.quantity;
      const discount = Math.min(line.discount, gross);
      return {
        ...line,
        item,
        stockQuantity,
        gross,
        discount,
        total: gross - discount,
      };
    })
    .filter((line): line is NonNullable<typeof line> => Boolean(line));
  const subtotal = cartLines.reduce((total, line) => total + line.total, 0);
  const discount = Math.min(Number(orderDiscount) || 0, subtotal);
  const total = Math.max(subtotal - discount, 0);
  const paidAmount = payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
  const balance = Math.max(total - paidAmount, 0);
  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return items.slice(0, 20);
    }

    return items
      .filter((item) =>
        [item.name, item.sku, item.barcode, item.internalCode, item.categoryName, item.brandName]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(query)),
      )
      .slice(0, 30);
  }, [items, search]);
  const favoriteItems = favorites
    .map((id) => itemById.get(id))
    .filter((item): item is InventoryItem => Boolean(item));
  const recentItems = recent
    .map((id) => itemById.get(id))
    .filter((item): item is InventoryItem => Boolean(item));
  const browserCanTryCamera =
    typeof window !== "undefined" &&
    "mediaDevices" in navigator &&
    "BarcodeDetector" in window;

  function addToCart(item: InventoryItem) {
    const availableSaleQuantity = getAvailableSaleQuantity(item);

    if (availableSaleQuantity <= 0) {
      setError(`No stock left for ${item.name}.`);
      return;
    }

    setCart((current) => {
      const existing = current.find((line) => line.inventoryItemId === item.id);

      if (existing) {
        return current.map((line) =>
          line.inventoryItemId === item.id
            ? { ...line, quantity: Math.min(availableSaleQuantity, line.quantity + 1) }
            : line,
        );
      }

      return [
        ...current,
        { inventoryItemId: item.id, quantity: Math.min(1, availableSaleQuantity), discount: 0 },
      ];
    });
    rememberRecent(item.id);
    setError("");
  }

  function rememberRecent(itemId: string) {
    setRecent((current) => {
      const next = [itemId, ...current.filter((id) => id !== itemId)].slice(0, 8);
      localStorage.setItem("posRecentProducts", JSON.stringify(next));
      return next;
    });
  }

  function toggleFavorite(itemId: string) {
    setFavorites((current) => {
      const next = current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [itemId, ...current].slice(0, 16);
      localStorage.setItem("posFavoriteProducts", JSON.stringify(next));
      return next;
    });
  }

  function updateCartLine(itemId: string, patch: Partial<CartLine>) {
    setCart((current) =>
      current.map((line) => {
        if (line.inventoryItemId !== itemId) {
          return line;
        }

        const item = itemById.get(itemId);
        const nextQuantity = patch.quantity ?? line.quantity;
        return {
          ...line,
          ...patch,
          quantity: item
            ? Math.min(Math.max(nextQuantity, 0.01), getAvailableSaleQuantity(item))
            : nextQuantity,
        };
      }),
    );
  }

  function removeLine(itemId: string) {
    setCart((current) => current.filter((line) => line.inventoryItemId !== itemId));
  }

  function addBarcodeToCart(code = barcode) {
    const cleanCode = code.trim();

    if (!cleanCode) {
      setError("Enter or scan a barcode.");
      return;
    }

    const item = items.find(
      (candidate) =>
        candidate.barcode === cleanCode ||
        candidate.internalCode === cleanCode ||
        candidate.sku === cleanCode,
    );

    if (!item) {
      setError("No product found for that code.");
      return;
    }

    addToCart(item);
    setBarcode("");
    setScanStatus(`${item.name} added.`);
  }

  async function startScanner() {
    const BarcodeDetector = (window as unknown as {
      BarcodeDetector?: BarcodeDetectorConstructor;
    }).BarcodeDetector;

    if (!BarcodeDetector || !navigator.mediaDevices?.getUserMedia) {
      setScanStatus("Camera scanning is not available here. Enter the barcode manually.");
      return;
    }

    setScanStatus("Starting camera...");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      setIsScanning(true);

      if (!videoRef.current) {
        return;
      }

      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      const detector = new BarcodeDetector({
        formats: ["ean_8", "ean_13", "upc_a", "code_128", "qr_code"],
      });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      let remainingFrames = 450;

      setScanStatus("Point the camera at the barcode.");

      const scanFrame = async () => {
        remainingFrames -= 1;

        if (!videoRef.current || !context || remainingFrames <= 0) {
          stopScanner();
          setScanStatus("No code found. You can enter it manually.");
          return;
        }

        canvas.width = videoRef.current.videoWidth || 640;
        canvas.height = videoRef.current.videoHeight || 480;
        context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const codes = await detector.detect(canvas).catch(() => []);
        const rawValue = codes[0]?.rawValue;

        if (rawValue) {
          stopScanner();
          setBarcode(rawValue);
          addBarcodeToCart(rawValue);
          return;
        }

        window.requestAnimationFrame(() => void scanFrame());
      };

      void scanFrame();
    } catch {
      stopScanner();
      setScanStatus("Camera permission was not granted. Enter the barcode manually.");
    }
  }

  function stopScanner() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setIsScanning(false);
  }

  function updatePayment(index: number, patch: Partial<PaymentLine>) {
    setPayments((current) =>
      current.map((payment, paymentIndex) =>
        paymentIndex === index ? { ...payment, ...patch } : payment,
      ),
    );
  }

  async function submitCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (cartLines.length === 0) {
      setError("Add at least one product.");
      return;
    }

    if (paidAmount - total > 0.01) {
      setError("Payment amounts cannot be more than the sale total.");
      return;
    }

    if (balance > 0 && !customerName.trim()) {
      setError("Enter customer name when they will pay later.");
      return;
    }

    const outOfStockLine = cartLines.find(
      (line) => line.stockQuantity > getStockQuantity(line.item),
    );

    if (outOfStockLine) {
      setError(`You do not have enough stock for ${outOfStockLine.item.name}.`);
      return;
    }

    setIsSaving(true);
    setError("");
    const nextReceipt = await checkoutPos({
      items: cartLines.map((line) => ({
        inventoryItemId: line.inventoryItemId,
        quantity: line.quantity,
        discount: line.discount,
      })),
      payments: payments
        .filter((payment) => payment.amount > 0)
        .map((payment) => ({
          ...payment,
          accountId: payment.accountId || accounts[0]?.id,
        })),
      orderDiscount: discount,
      customerName: customerName.trim() || undefined,
      customerPhone: customerPhone.trim() || undefined,
      note: note.trim() || undefined,
    });
    setIsSaving(false);

    if (nextReceipt) {
      setReceipt(nextReceipt);
      setCart([]);
      setPayments([{ method: "cash", amount: 0, accountId: accounts[0]?.id }]);
      setOrderDiscount("0");
      setCustomerName("");
      setCustomerPhone("");
      setNote("");
    }
  }

  function printReceipt() {
    if (!receipt) {
      return;
    }

    const receiptWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!receiptWindow) {
      window.print();
      return;
    }

    receiptWindow.document.write(
      renderReceiptHtml(receipt, paperSize, { businessName, receiptConfig }),
    );
    receiptWindow.document.close();
    receiptWindow.focus();
    receiptWindow.print();
  }

  return (
    <div className="grid gap-6 pb-24 lg:grid-cols-[1fr_420px]">
      <section className="space-y-5">
        <div className="rounded-2xl border border-gray-100 bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-textMuted"
                size={18}
                aria-hidden="true"
              />
              <input
                className="h-14 w-full rounded-xl border border-gray-200 bg-white pl-11 pr-4 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                placeholder="Search product, barcode, category"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <div className="flex gap-2">
              <input
                className="h-14 min-w-0 flex-1 rounded-xl border border-gray-200 px-4 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 sm:w-44"
                inputMode="numeric"
                placeholder="Barcode"
                value={barcode}
                onChange={(event) => setBarcode(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addBarcodeToCart();
                  }
                }}
              />
              <button
                aria-label="Scan barcode"
                className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-white"
                type="button"
                onClick={() => void startScanner()}
              >
                <ScanLine size={20} aria-hidden="true" />
              </button>
            </div>
          </div>
          <video
            ref={videoRef}
            className={`mt-4 h-44 w-full rounded-xl bg-black object-cover ${isScanning ? "" : "hidden"}`}
            muted
            playsInline
          />
          {scanStatus ? <p className="mt-3 text-sm text-textSecondary">{scanStatus}</p> : null}
          {!browserCanTryCamera ? (
            <p className="mt-3 text-xs text-textSecondary">
              Camera scanning depends on browser support. Manual barcode entry works everywhere.
            </p>
          ) : null}
        </div>

        {favoriteItems.length > 0 ? (
          <ProductStrip title="Favourites" items={favoriteItems} onAdd={addToCart} />
        ) : null}
        {recentItems.length > 0 ? (
          <ProductStrip title="Recent products" items={recentItems} onAdd={addToCart} />
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          {filteredItems.map((item) => (
            <article
              key={item.id}
              className="rounded-2xl border border-gray-100 bg-card p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate font-semibold">{item.name}</h2>
                  <p className="mt-1 text-sm text-textSecondary">
                    {formatNaira(item.sellingPrice)} per {getSellingUnitLabel(item, 1)} ·{" "}
                    {formatStockQuantity(item)} left
                  </p>
                  {isConvertedSaleUnit(item) ? (
                    <p className="mt-1 text-xs font-medium text-textSecondary">
                      Available {formatSaleQuantity(
                        item,
                        stockQuantityToSaleQuantity(item, getStockQuantity(item)),
                      )}{" "}
                      · 1 {getSellingUnitLabel(item, 1)} ={" "}
                      {formatStockQuantity(item, getConversionFactor(item))}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-textSecondary">
                    {[item.categoryName, item.brandName, item.barcode || item.internalCode]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <button
                  aria-label={
                    favorites.includes(item.id)
                      ? `Remove ${item.name} from favourites`
                      : `Add ${item.name} to favourites`
                  }
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-textSecondary"
                  type="button"
                  onClick={() => toggleFavorite(item.id)}
                >
                  <Star
                    size={17}
                    aria-hidden="true"
                    className={favorites.includes(item.id) ? "fill-accent text-accent" : ""}
                  />
                </button>
              </div>
              <button
                className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white disabled:bg-textMuted"
                type="button"
                disabled={getStockQuantity(item) <= 0}
                onClick={() => addToCart(item)}
              >
                <Plus size={16} aria-hidden="true" />
                Add to cart
              </button>
            </article>
          ))}
        </div>
      </section>

      <form className="space-y-5" onSubmit={submitCheckout}>
        <section className="rounded-2xl border border-gray-100 bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Cart</h2>
            <strong>{formatNaira(total)}</strong>
          </div>
          <div className="mt-4 grid gap-3">
            {cartLines.length === 0 ? (
              <p className="rounded-xl bg-background p-4 text-sm text-textSecondary">
                Search or scan a product to start checkout.
              </p>
            ) : (
              cartLines.map((line) => (
                <div
                  key={line.inventoryItemId}
                  className="rounded-xl border border-gray-100 bg-white p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{line.item.name}</p>
                      <p className="text-sm text-textSecondary">{formatNaira(line.total)}</p>
                      <p className="mt-1 text-xs font-medium text-textSecondary">
                        {formatSaleQuantity(line.item, line.quantity)} @{" "}
                        {formatNaira(line.item.sellingPrice)} per{" "}
                        {getSellingUnitLabel(line.item, 1)}
                        {isConvertedSaleUnit(line.item)
                          ? ` · reduces ${formatStockQuantity(line.item, line.stockQuantity)}`
                          : ""}
                      </p>
                    </div>
                    <button
                      aria-label={`Remove ${line.item.name}`}
                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-danger"
                      type="button"
                      onClick={() => removeLine(line.inventoryItemId)}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-[40px_1fr_40px] items-center gap-2">
                    <button
                      aria-label={`Reduce ${line.item.name}`}
                      className="flex h-10 items-center justify-center rounded-xl border border-gray-200"
                      type="button"
                      onClick={() =>
                        updateCartLine(line.inventoryItemId, {
                          quantity: Math.max(0.01, line.quantity - 1),
                        })
                      }
                    >
                      <Minus size={15} aria-hidden="true" />
                    </button>
                    <input
                      className="h-10 rounded-xl border border-gray-200 px-3 text-center"
                      inputMode="decimal"
                      min="0.01"
                      step="any"
                      type="number"
                      value={line.quantity}
                      onChange={(event) =>
                        updateCartLine(line.inventoryItemId, {
                          quantity: Number(event.target.value),
                        })
                      }
                    />
                    <button
                      aria-label={`Increase ${line.item.name}`}
                      className="flex h-10 items-center justify-center rounded-xl border border-gray-200"
                      type="button"
                      onClick={() =>
                        updateCartLine(line.inventoryItemId, {
                          quantity: line.quantity + 1,
                        })
                      }
                    >
                      <Plus size={15} aria-hidden="true" />
                    </button>
                  </div>
                  <label className="mt-3 grid gap-1 text-xs font-medium text-textSecondary">
                    Item discount
                    <input
                      className="h-10 rounded-xl border border-gray-200 px-3 text-sm text-textPrimary"
                      inputMode="decimal"
                      type="number"
                      value={line.discount}
                      onChange={(event) =>
                        updateCartLine(line.inventoryItemId, {
                          discount: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                </div>
              ))
            )}
          </div>
          <label className="mt-4 grid gap-2 text-sm font-medium">
            Order discount
            <input
              className="h-12 rounded-xl border border-gray-200 px-4"
              inputMode="decimal"
              type="number"
              value={orderDiscount}
              onChange={(event) => setOrderDiscount(event.target.value)}
            />
          </label>
        </section>

        <section className="rounded-2xl border border-gray-100 bg-card p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Payment</h2>
          <div className="mt-4 grid gap-3">
            {payments.map((payment, index) => (
              <div className="grid gap-2 rounded-xl bg-background p-3" key={index}>
                <select
                  className="h-11 rounded-xl border border-gray-200 bg-white px-3"
                  value={payment.method}
                  onChange={(event) =>
                    updatePayment(index, { method: event.target.value as PaymentLine["method"] })
                  }
                >
                  {paymentMethods.map((method) => (
                    <option key={method.value} value={method.value}>
                      {method.label}
                    </option>
                  ))}
                </select>
                <select
                  className="h-11 rounded-xl border border-gray-200 bg-white px-3"
                  value={payment.accountId ?? ""}
                  onChange={(event) => updatePayment(index, { accountId: event.target.value })}
                >
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
                <input
                  className="h-11 rounded-xl border border-gray-200 px-3"
                  inputMode="decimal"
                  placeholder="Amount paid"
                  type="number"
                  value={payment.amount || ""}
                  onChange={(event) =>
                    updatePayment(index, { amount: Number(event.target.value) })
                  }
                />
              </div>
            ))}
          </div>
          <button
            className="mt-3 min-h-11 rounded-xl border border-gray-200 px-4 text-sm font-semibold"
            type="button"
            onClick={() =>
              setPayments((current) => [
                ...current,
                { method: "bank_transfer", amount: 0, accountId: accounts[0]?.id },
              ])
            }
          >
            Add payment method
          </button>
          <div className="mt-4 grid gap-2 rounded-xl bg-background p-4 text-sm">
            <Row label="Paid now" value={formatNaira(paidAmount)} />
            <Row label="Customer owing" value={formatNaira(balance)} />
          </div>
        </section>

        <section className="rounded-2xl border border-gray-100 bg-card p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Customer</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input
              className="h-12 rounded-xl border border-gray-200 px-4"
              placeholder={balance > 0 ? "Customer name required" : "Customer optional"}
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
            />
            <input
              className="h-12 rounded-xl border border-gray-200 px-4"
              inputMode="tel"
              placeholder="Phone optional"
              value={customerPhone}
              onChange={(event) => setCustomerPhone(event.target.value)}
            />
          </div>
          <input
            className="mt-3 h-12 w-full rounded-xl border border-gray-200 px-4"
            placeholder="Sale note optional"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          {error ? <p className="mt-3 text-sm font-semibold text-danger">{error}</p> : null}
          <button
            className="mt-4 flex min-h-14 w-full items-center justify-center rounded-xl bg-primary px-5 font-semibold text-white disabled:bg-textMuted"
            type="submit"
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save sale"}
          </button>
        </section>

        {receipt ? (
          <section className="rounded-2xl border border-success/20 bg-success/10 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-success">Receipt ready</h2>
                <p className="text-sm text-textSecondary">#{receipt.receiptNo}</p>
              </div>
              <button
                className="flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white"
                type="button"
                onClick={printReceipt}
              >
                <Printer size={16} aria-hidden="true" />
                Print
              </button>
            </div>
            <select
              className="mt-3 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm"
              value={paperSize}
              onChange={(event) => setPaperSize(event.target.value as typeof paperSize)}
            >
              <option value="58mm">58 mm</option>
              <option value="80mm">80 mm</option>
              <option value="pdf">Standard PDF</option>
            </select>
            <p className="mt-2 text-xs text-textSecondary">
              Browser printing is supported. Bluetooth and Wi-Fi printing depend on the device and
              wrapper support.
            </p>
          </section>
        ) : null}
      </form>
    </div>
  );
}

function ProductStrip({
  title,
  items,
  onAdd,
}: {
  title: string;
  items: InventoryItem[];
  onAdd: (item: InventoryItem) => void;
}) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-card p-5 shadow-sm">
      <h2 className="font-semibold">{title}</h2>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {items.map((item) => (
          <button
            key={item.id}
            className="min-w-36 rounded-xl border border-gray-200 bg-white p-3 text-left text-sm"
            type="button"
            onClick={() => onAdd(item)}
          >
            <span className="block truncate font-semibold">{item.name}</span>
            <span className="mt-1 block text-xs text-textSecondary">
              {formatNaira(item.sellingPrice)}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-textSecondary">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function renderReceiptHtml(
  receipt: NonNullable<PosReceipt>,
  paperSize: PaperSize,
  options: { businessName: string; receiptConfig?: ReceiptConfig },
) {
  const width = paperSize === "58mm" ? "58mm" : paperSize === "80mm" ? "80mm" : "720px";
  const config = options.receiptConfig;
  const rows = receipt.items
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.name)} x ${formatQuantityValue(item.quantity)}${item.unitLabel ? ` ${escapeHtml(item.unitLabel)}` : ""}</td>
          <td>${formatNaira(item.total)}</td>
        </tr>
      `,
    )
    .join("");
  const payments = receipt.payments
    .map((payment) => `<p>${escapeHtml(payment.method)}: ${formatNaira(payment.amount)}</p>`)
    .join("");
  const contactLines = [
    config?.address,
    [config?.phone, config?.email].filter(Boolean).join(" · "),
    config?.taxId ? `Tax ID: ${config.taxId}` : "",
  ].filter((line): line is string => Boolean(line));
  const logo = config?.logoUrl
    ? `<img alt="" class="logo" src="${escapeHtml(config.logoUrl)}" />`
    : "";
  const footer = [config?.footerMessage, config?.includePoweredBy ? "Powered by SME MoneyBook" : ""]
    .filter((line): line is string => Boolean(line))
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");

  return `
    <!doctype html>
    <html>
      <head>
        <title>Receipt ${escapeHtml(receipt.receiptNo)}</title>
        <style>
          @page { size: ${paperSize === "pdf" ? "A4" : width} auto; margin: 8mm; }
          body { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; margin: 0; color: #111827; }
          main { width: ${width}; margin: 0 auto; }
          h1 { font-size: 16px; margin: 0 0 8px; }
          .logo { display: block; max-height: 44px; max-width: 120px; margin: 0 0 8px; object-fit: contain; }
          p { margin: 4px 0; font-size: 12px; }
          table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 12px; }
          td { border-top: 1px dashed #d1d5db; padding: 6px 0; vertical-align: top; }
          td:last-child { text-align: right; white-space: nowrap; }
          .total { border-top: 2px solid #111827; padding-top: 8px; font-weight: 700; }
          .footer { margin-top: 14px; text-align: center; font-size: 11px; }
        </style>
      </head>
      <body>
        <main>
          ${logo}
          <h1>${escapeHtml(options.businessName || "SME MoneyBook")}</h1>
          ${contactLines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
          <p>Receipt: ${escapeHtml(receipt.receiptNo)}</p>
          <p>Date: ${new Intl.DateTimeFormat("en-NG", {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(receipt.createdAt))}</p>
          <table>${rows}</table>
          <p class="total">Total: ${formatNaira(receipt.total)}</p>
          <p>Paid: ${formatNaira(receipt.paidAmount)}</p>
          <p>Balance: ${formatNaira(receipt.balance)}</p>
          ${payments}
          <div class="footer">${footer || "<p>Thank you.</p>"}</div>
        </main>
      </body>
    </html>
  `;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function readStoredList(key: string) {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    return JSON.parse(localStorage.getItem(key) || "[]") as string[];
  } catch {
    return [];
  }
}
